# The Flock

The agents that run on rootjs.dev. Each is a `defineAgent({...})` export
discovered automatically by the `virtual:root/agents` Vite plugin.

| Agent | Bird | Tools | Role |
|------|------|-------|------|
| `blinkk` | dispatcher | read + subtask + apply | **Primary user-facing agent.** Coordinates the team, applies peer proposals when safe. |
| `content-manager` | 🦜 The Parrot | read + propose + subtask | Drafts and reorganizes content |
| `translator` | 🦢 The Swan | read + propose | Localizes en → de/es/fr/it/pt |
| `qa` | 🦅 The Eagle | read + propose + subtask + apply | Runs CMS checks, flags issues, applies safe fixes |
| `editor` | 🦉 The Owl | read + propose | Copy editor and proofreader |
| `seo` | 🐦 The Sparrow | read + propose | Meta tags, alt text, headings |
| `project-manager` | 🦩 The Flamingo | read + subtask + apply | Triages requests, applies peer proposals |
| `client-liaison` | 🐧 The Penguin | read | Drafts client-facing replies |

**`blinkk` is the dispatcher.** Talk to Blinkk; Blinkk talks to the rest.

## Adding a new agent

1. Create `agents/<slug>.ts` exporting `defineAgent({...})` as default.
2. The slug must match `/^[a-z0-9][a-z0-9-]*$/` and be unique.
3. Pick the smallest `allowedTools` set that does the job:
   - `read` — server-side CMS reads (`docs_list`, `doc_get`,
     `schema_get`, `docs_search`, `doc_listVersions`,
     `collections_list`), CMS checks (`checks_list`, `check_run`),
     project introspection (`agents_list`, `tasks_list`, `users_list`),
     and conversational replies (`task_reply`).
   - `propose` — post mutating tool calls for human review
     (`proposeChange`).
   - `subtask` — file follow-up tasks for other agents or humans
     (`createSubtask`).
4. Restart `pnpm dev`; the agent appears in the AgentPicker on `/cms/ai`
   and in the task assignee dropdown.

## Why birds

Blinkk's logo is a bird. The Flock metaphor keeps the role hierarchy
intuitive: the project manager (Flamingo) is the loudest of the bunch,
the QA (Eagle) has the sharpest eye, the translator (Swan) glides
between languages, and so on.
