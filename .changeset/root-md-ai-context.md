---
'@blinkk/root-cms': patch
---

feat: support `ROOT.md` for project-level Root AI context

Drop a `ROOT.md` file at the project root to give Root AI (`/cms/ai`)
site-specific instructions (conventions, patterns, naming rules, etc.).
The file's contents are appended to the system prompt for every chat.
Similar in spirit to `AGENTS.md` / `CLAUDE.md`.
