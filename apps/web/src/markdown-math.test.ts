import { describe, expect, it } from "vite-plus/test";

import {
  protectCurrencyDollars,
  rehypeWrapMathCopySource,
  remarkMathPresentation,
} from "./markdown-math";

describe("protectCurrencyDollars", () => {
  it.each([
    ["Between $5 and $3 for each.", "Between \\$5 and $3 for each."],
    ["Pay $ 100 or $200 now.", "Pay \\$ 100 or $200 now."],
    ["It costs $20,000-$30,000.", "It costs \\$20,000-$30,000."],
    ["Price $5; equation $x$", "Price \\$5; equation $x$"],
  ])("protects price text while leaving later delimiters available: %s", (source, expected) => {
    expect(protectCurrencyDollars(source)).toBe(expected);
  });

  it.each([
    "$x^2$",
    "$5 + 3$",
    "$$x^2$$",
    "\\(x^2\\)",
    "`echo $5 and $3`",
    "```sh\necho $5 and $3\n```",
  ])("leaves valid or code-contained source unchanged: %s", (source) => {
    expect(protectCurrencyDollars(source)).toBe(source);
  });
});

describe("math copy source", () => {
  it("carries the exact authored delimiters through the KaTeX replacement boundary", () => {
    const markdownNode = {
      type: "inlineMath",
      position: { start: { offset: 0 }, end: { offset: 9 } },
      data: { hProperties: { className: ["math-inline"] } },
    };
    const markdownTree = { type: "root", children: [markdownNode] };
    remarkMathPresentation()(markdownTree, { value: "\\(x + y\\)" });

    const code = {
      type: "element",
      tagName: "code",
      properties: markdownNode.data.hProperties,
      children: [{ type: "text", value: "x + y" }],
    };
    const hastTree = { type: "root", children: [code] };
    rehypeWrapMathCopySource()(hastTree);

    expect(hastTree.children[0]).toMatchObject({
      tagName: "span",
      properties: { dataMarkdownCopy: "\\(x + y\\)" },
      children: [{ tagName: "code" }],
    });
  });

  it("wraps block math outside its pre so KaTeX can still replace the pre", () => {
    const code = {
      type: "element",
      tagName: "code",
      properties: { className: ["language-math", "math-display"], dataMarkdownCopy: "$$x$$" },
      children: [{ type: "text", value: "x" }],
    };
    const hastTree = {
      type: "root",
      children: [{ type: "element", tagName: "pre", properties: {}, children: [code] }],
    };
    rehypeWrapMathCopySource()(hastTree);

    expect(hastTree.children[0]).toMatchObject({
      tagName: "div",
      properties: { dataMarkdownCopy: "$$x$$" },
      children: [{ tagName: "pre", children: [{ tagName: "code" }] }],
    });
  });
});
