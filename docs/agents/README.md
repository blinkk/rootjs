# The Flock

The agents that run on rootjs.dev. Each is a `defineAgent({...})` export
discovered automatically by the `virtual:root/agents` Vite plugin.

| Agent | Bird | Tools | Role |
|------|------|-------|------|
| `content-manager` | 🦜 The Parrot | read + propose + subtask | Drafts and reorganizes content |
| `translator` | 🦢 The Swan | read + propose | Localizes en → de/es/fr/it/pt |
| `qa` | 🦅 The Eagle | read + propose + subtask | Runs CMS checks, flags issues |
| `editor` | 🦉 The Owl | read + propose | Copy editor and proofreader |
| `seo` | 🐦 The Sparrow | read + propose | Meta tags, alt text, headings |
| `project-manager` | 🦩 The Flamingo | read + subtask | Triages requests into subtasks |
| `client-liaison` | 🐧 The Penguin | read | Drafts client-facing replies |

## Adding a new agent

1. Create `agents/<slug>.ts` exporting `defineAgent({...})` as default.
2. The slug must match `/^[a-z0-9][a-z0-9-]*$/` and be unique.
3. Pick the smallest `allowedTools` set that does the job:
   - `read` — server-side CMS reads + CMS checks.
   - `propose` — post mutating tool calls for human review.
   - `subtask` — file follow-up tasks for other agents or humans.
4. Restart `pnpm dev`; the agent appears in the AgentPicker on `/cms/ai`
   and in the task assignee dropdown.

## Why birds

Blinkk's logo is a bird. The Flock metaphor keeps the role hierarchy
intuitive: the project manager (Flamingo) is the loudest of the bunch,
the QA (Eagle) has the sharpest eye, the translator (Swan) glides
between languages, and so on.
