type MarkdownAstNode = {
  type?: string;
  position?: { start: { offset?: number }; end: { offset?: number } };
  data?: { hProperties?: Record<string, unknown> };
  children?: MarkdownAstNode[];
};

type MathHastNode = {
  type?: string;
  tagName?: string;
  properties?: Record<string, unknown>;
  children?: MathHastNode[];
};

function isEscaped(source: string, offset: number): boolean {
  let backslashes = 0;
  for (let index = offset - 1; index >= 0 && source[index] === "\\"; index -= 1) {
    backslashes += 1;
  }
  return backslashes % 2 === 1;
}

function isSingleDollar(source: string, offset: number): boolean {
  return (
    source[offset] === "$" &&
    source[offset - 1] !== "$" &&
    source[offset + 1] !== "$" &&
    !isEscaped(source, offset)
  );
}

function markdownCodeMask(source: string): Uint8Array {
  const mask = new Uint8Array(source.length);
  let fence: { marker: string; size: number } | undefined;
  let inlineTicks = 0;

  for (let lineStart = 0; lineStart < source.length; ) {
    const lineEnd = source.indexOf("\n", lineStart);
    const nextLine = lineEnd === -1 ? source.length : lineEnd + 1;
    const line = source.slice(lineStart, lineEnd === -1 ? source.length : lineEnd);
    const fenceMatch = inlineTicks === 0 ? /^ {0,3}(`{3,}|~{3,})/.exec(line) : null;
    if (fence) {
      mask.fill(1, lineStart, nextLine);
      if (
        fenceMatch?.[1]?.startsWith(fence.marker) &&
        fenceMatch[1].length >= fence.size &&
        line.slice(fenceMatch[0].length).trim() === ""
      ) {
        fence = undefined;
      }
      lineStart = nextLine;
      continue;
    }
    if (fenceMatch?.[1]) {
      fence = { marker: fenceMatch[1][0] ?? "`", size: fenceMatch[1].length };
      mask.fill(1, lineStart, nextLine);
      lineStart = nextLine;
      continue;
    }

    for (let offset = lineStart; offset < nextLine; offset += 1) {
      if (source[offset] !== "`") {
        if (inlineTicks > 0) mask[offset] = 1;
        continue;
      }
      let runEnd = offset + 1;
      while (source[runEnd] === "`") runEnd += 1;
      const runSize = runEnd - offset;
      const closesInlineCode = inlineTicks === runSize;
      if (inlineTicks === 0) inlineTicks = runSize;
      mask.fill(1, offset, runEnd);
      if (closesInlineCode) inlineTicks = 0;
      offset = runEnd - 1;
    }
    lineStart = nextLine;
  }
  return mask;
}

/**
 * Apply Pandoc's useful single-dollar boundary rules before remark-math sees
 * the document. Doing this to the source (rather than demoting an AST node)
 * lets Markdown inside a rejected price span be parsed normally and lets a
 * later real formula still find its own opener.
 */
export function protectCurrencyDollars(markdown: string): string {
  const escapedOpeners = new Set<number>();
  const codeMask = markdownCodeMask(markdown);
  let opener = -1;

  for (let offset = 0; offset < markdown.length; offset += 1) {
    if (codeMask[offset] === 1 || !isSingleDollar(markdown, offset)) continue;
    if (opener === -1) {
      opener = offset;
      continue;
    }

    const content = markdown.slice(opener + 1, offset);
    const invalidPair =
      /^\s/.test(content) || /\s$/.test(content) || /\d/.test(markdown[offset + 1] ?? "");
    if (invalidPair) {
      escapedOpeners.add(opener);
      opener = offset;
      continue;
    }
    opener = -1;
  }

  if (escapedOpeners.size === 0) return markdown;
  let protectedMarkdown = "";
  for (let offset = 0; offset < markdown.length; offset += 1) {
    if (escapedOpeners.has(offset)) protectedMarkdown += "\\";
    protectedMarkdown += markdown[offset];
  }
  return protectedMarkdown;
}

/** Preserve authored delimiters and promote inline display notation. */
export function remarkMathPresentation() {
  return (tree: MarkdownAstNode, file: { value?: unknown }) => {
    const source = typeof file.value === "string" ? file.value : "";
    const visit = (node: MarkdownAstNode) => {
      if (node.type === "inlineMath" || node.type === "math") {
        const from = node.position?.start.offset;
        const to = node.position?.end.offset;
        if (from !== undefined && to !== undefined) {
          const raw = source.slice(from, to);
          node.data = {
            ...node.data,
            hProperties: {
              ...node.data?.hProperties,
              dataMarkdownCopy: raw,
              ...(node.type === "inlineMath" && (raw.startsWith("$$") || raw.startsWith("\\["))
                ? { className: ["language-math", "math-display"] }
                : {}),
            },
          };
        }
      }
      node.children?.forEach(visit);
    };
    visit(tree);
  };
}

function mathCopySource(node: MathHastNode): string | undefined {
  const value = node.properties?.dataMarkdownCopy;
  return typeof value === "string" ? value : undefined;
}

/**
 * rehype-katex replaces the math code element, including its properties. Wrap
 * that replacement target so the clipboard serializer retains the source.
 */
export function rehypeWrapMathCopySource() {
  return (tree: MathHastNode) => {
    const visit = (node: MathHastNode) => {
      node.children?.forEach((child, index, children) => {
        visit(child);
        const source = mathCopySource(child);
        if (!source || child.type !== "element") return;
        const childClasses = Array.isArray(child.properties?.className)
          ? child.properties.className
          : [];
        if (
          node.tagName === "pre" &&
          child.tagName === "code" &&
          childClasses.includes("math-display")
        ) {
          delete child.properties?.dataMarkdownCopy;
          node.properties = { ...node.properties, dataMarkdownCopy: source };
          return;
        }
        delete child.properties?.dataMarkdownCopy;
        children[index] = {
          type: "element",
          tagName: child.tagName === "pre" ? "div" : "span",
          properties: { dataMarkdownCopy: source, className: ["chat-markdown-math"] },
          children: [child],
        };
      });
    };
    visit(tree);
  };
}
