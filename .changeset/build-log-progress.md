---
'@blinkk/root': minor
---

feat: add `--log` flag to `root build` with progress indicator

`root build` now shows a progress indicator by default instead of printing
one line per output file. In interactive terminals this is a live progress
bar (count, %, bytes written, elapsed, ETA); in non-interactive environments
(e.g. CI) a progress line is printed at ~10% milestones, keeping logs to a
handful of lines instead of one per page. A final summary lists the total
page count, output size, build time, and the largest pages.

- `--log progress` (default): progress indicator + summary.
- `--log verbose`: one line per output file (previous behavior).
- `--log quiet` (or the global `-q`): only the final summary; vite output is
  reduced to warnings and errors.
