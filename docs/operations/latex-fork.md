# LaTeX fork maintenance

The `latex` branch tracks stable `pingdotgg/t3code` releases and carries a small KaTeX patch for the
web and desktop chat renderer. It supports `$...$`, `$$...$$`, `\(...\)`, and `\[...\]`, keeps
ordinary prices literal, preserves authored TeX when copied, and gives long display formulas their
own horizontal scroll area.

## Automatic builds

`.github/workflows/sync-stable-latex.yml` checks the latest stable upstream release every day. When a
new release exists, it merges the release tag into `latex`, runs the web tests and typecheck, builds
an Apple Silicon DMG, uploads that DMG as a 30-day workflow artifact, and only then pushes the merge.
Merge conflicts or failed checks leave the branch unchanged and fail visibly in GitHub Actions.

The DMG is intentionally unsigned unless Apple signing credentials are added. An unsigned macOS app
cannot use Electron's seamless updater reliably, so the fork build points the updater at this fork
instead of allowing the official updater to silently replace it with stock T3 Code. Download a
successful workflow artifact and install the DMG manually.

## Local update and build

From a clean `latex` checkout, run:

```sh
bash scripts/update-latex-build.sh
```

The script resolves the latest stable GitHub release, merges it, installs the locked dependencies,
runs the web tests and typecheck, and builds an unsigned Apple Silicon DMG in `release/`. It refuses
to touch a different branch or a dirty worktree. It does not replace a running application.

If a stable release conflicts with the patch, resolve the merge locally, rerun the checks and build,
then push `latex`. Do not force an automated merge through a renderer conflict.
