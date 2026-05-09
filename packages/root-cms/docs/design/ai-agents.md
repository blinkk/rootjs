# Root AI: Agents and Task Manager Integration

Status: Draft.
Targets: rootjs `alpha` channel (post v3.0).

## Context

Root v3 introduces two new surfaces in parallel:

- **Root AI chat**, built on Vercel AI SDK v6 (`packages/root-cms/core/ai-chat.ts`), with browser-executed CMS tools so writes go through the user's Firebase auth.
- **Task Manager** (`packages/root-cms/ui/components/TaskManager`, `ui/utils/tasks.ts`), introduced in #1065 / #1081 and recently moved to experimental in #1104, with tasks, comments, mentions, events, and assignees.

Today these are disconnected. This design unifies them so Root CMS becomes the entrypoint for ideating and executing big website projects with clients: a chat session can graduate to a long-running Task, and Tasks can be assigned to AI agents defined per-site.

The shape is deliberately narrow. Agents read and propose; humans approve and apply. Agents do not write code, do not have direct mutating authority over the CMS, and run only with the same project scope the site itself has.

## Goals

- A site-defined agent registry under `<root>/agents/`, discoverable by Root AI and the Task Manager.
- Tasks can be assigned to agents (in addition to humans) and agents post comments, reactions, and proposals as they work.
- Read-only operations auto-approve; mutating operations are posted as proposals that a human applies.
- "Convert chat to task" hand-off from Root AI to the Task Manager.
- Background workers run agent loops without introducing new third-party infrastructure to a Root deployment.

## Non-goals

- Autonomous code editing. Agents advise; engineers edit code.
- Multi-day stateful workflows beyond simple subtask hand-offs.
- New 3p infrastructure (Cloud Tasks, Pub/Sub, Redis, LangGraph runtime, etc.).
- Service-account writes. Mutations always run under a human's Firebase auth via the Apply flow.

## Architecture

### Agent registry (`agents/`)

Agents live next to other site code in `<root>/agents/`. Each agent is a TypeScript file that calls `defineAgent()`, optionally importing a co-located Markdown file as its system prompt:

```ts
// agents/content-manager.ts
import {defineAgent} from '@blinkk/root-cms';
import systemPrompt from './content-manager.md?raw';

export default defineAgent({
  name: 'content-manager',
  icon: '📝',
  description: 'Manages CMS content updates across collections.',
  systemPrompt,
  allowedTools: ['read', 'propose', 'subtask'],
  model: 'anthropic/claude-sonnet-4-6', // Optional override.
  maxTokensPerTask: 200_000,             // Optional override.
});
```

Discovery uses a new Vite virtual module `virtual:root/agents`, modelled on the existing `virtual:root/schemas` plugin (`packages/root/src/node/pods-vite-plugin.ts:16-96`). The plugin walks `agents/`, generates a module that imports each definition, and exposes a typed registry to both server (worker, API) and client (UI).

`allowedTools` uses *bundle keys* rather than individual tool names so site authors don't accidentally grant dangerous capabilities and the bundles can grow over time:

| Bundle     | Purpose                                                      |
| ---------- | ------------------------------------------------------------ |
| `read`     | Search docs, list collections, get doc, schema introspection |
| `propose`  | Post structured proposals as comments on the current task    |
| `subtask`  | Create child tasks assigned to other agents or humans        |

### Task data model additions

The existing `Task` and `TaskComment` shapes (`packages/root-cms/ui/utils/tasks.ts:23-91`) need additive changes; nothing existing breaks.

`Task`:
- `assignee?: string` — already freeform. Agent assignees use `agent:<name>` (e.g. `agent:content-manager`).
- `parentTaskId?: string` — new, links subtasks to their parent.
- `sourceChatId?: string` — new, links a Task back to the chat it originated from.
- `agentRun?: AgentRunMetadata` — new. Tracks `{leasedBy, leasedAt, tokensUsed, tokensCap, status: 'idle' | 'running' | 'errored', lastError?}`. Workers update via Firestore transaction.

`TaskComment`:
- `reactions?: {[emoji: string]: string[]}` — new. Tight emoji set: `👀 🤔 💬 ✅ ⚠️ ❌`. Keys are reactor identifiers (`createdBy` or `agent:<name>`).
- `proposal?: TaskProposal` — new (only present on proposal comments). Shape: `{tool, input, rationale, diffSummary, status: 'pending' | 'applied' | 'rejected' | 'expired', appliedBy?, appliedAt?}`.

Schema changes are purely additive. No migration required for existing tasks.

### Server-side tool execution

Today every tool call round-trips through the browser via `executeCmsTool` (`packages/root-cms/ui/pages/AIPage/cmsToolHandlers.ts:540`). For background agents the tab isn't open, so the *read* bundle gets a server-side execution layer.

- `packages/root-cms/core/agents/tools-server.ts` — server execute functions for the read bundle, all routed through `RootCMSClient` so per-project access checks still apply.
- The same tool *names* as the existing chat tools, just with server-side `execute` wired up. The agent code calls them identically.
- The chat handler keeps the existing schema-only registration so user-driven mutations stay in the browser.

The mutating tool surface is **not** ported. Agents never get a server-side `update_doc` or similar. Mutations exist only as proposals.

### Proposal + apply flow

When an agent wants to mutate the CMS, it calls a single tool:

```
proposeChange({
  tool: 'update_doc',                         // The mutating tool to invoke.
  input: { docId: '...', fields: {...} },     // Input to that tool.
  rationale: 'Updated hero copy per brief.',
  diffSummary: '...'                          // Human-readable diff for the comment.
})
```

`proposeChange` posts a structured comment on the active task with `proposal: {...status: 'pending'}`. The agent never directly applies the change.

When a human views the task and clicks **Apply**:

1. UI hits `/cms/api/proposal.apply?commentId=<id>` with the user's Firebase auth.
2. Server validates the proposal (status still `pending`, target doc still exists, optional staleness check on the source state).
3. Server returns the proposal payload to the browser, which executes it via the existing `executeCmsTool` path under the user's auth.
4. On success, server marks the comment `status: 'applied'`, records `appliedBy` / `appliedAt`, and writes a `TaskEvent`.
5. Audit reads cleanly: *User X approved Agent Y's proposal Z, applied by User X*.

Proposal comments render with a distinct affordance (icon + diff summary + Apply / Reject buttons), modelled in `ProposalComment.tsx`.

### Worker

The agent loop must run somewhere a browser isn't. The constraint is no new 3p infrastructure, but Root sites already deploy on Firebase / App Engine / Cloud Run, so platform-native triggers and listeners are fair game.

Two implementations sit behind one `AgentWorker` interface:

**Persistent worker** (Cloud Run with `min-instances: 1`, App Engine Flex, GKE, VMs):
- In-process Firestore `onSnapshot` listener filtered to tasks with `assignee` matching `agent:*` and `agentRun.status: 'idle'`.
- Claims tasks with a transactional lease (`leasedBy: <instanceId>`, `leasedAt: <ts>`). Lease expires after N minutes so a dead replica releases its claim.
- Runs the agent loop to completion; updates tokens used; posts comments and reactions as it goes.

**Triggered worker** (Firebase Functions, App Engine Standard):
- Firestore-trigger 2nd-gen Cloud Function on `Projects/{p}/Tasks/{t}` writes.
- Wakes when a task's `agentRun.status` flips to `idle` with an agent assignee.
- Runs the agent loop within the function's timeout (9 min for v2 background functions).
- If the run exceeds the timeout, the task is marked `errored` and a human re-trigger is required.

Both implementations share the same loop body in `packages/root-cms/core/agents/runner.ts` (a thin wrapper around `ToolLoopAgent`). The harness is selected by `root.config` (`agents.worker: 'persistent' | 'triggered' | 'auto'`); `auto` detects the platform.

For v0 we ship the **persistent** worker only. Triggered worker is a later add.

### Resume policy

Failed runs require **human re-trigger** (option (c)). No checkpointing.

If a worker dies mid-run:
- Lease expires after the lease TTL.
- Task surfaces with `agentRun.status: 'errored'` and `lastError` set.
- UI shows a "Retry" button on the task; clicking it resets `status` to `idle` so the worker re-claims.
- Each retry runs from scratch. Already-posted proposals remain visible.

### Subagents within a run vs. subtasks across runs

Two patterns, kept separate to avoid coupling:

- **Tool-call subagent** (in-run): The active agent invokes another agent via a tool whose `execute` calls a child `ToolLoopAgent`. ai-sdk v6's subagent pattern with `toModelOutput` for context isolation. No new task is created; the subagent's work is reflected in the parent's transcript only as a summary.
- **Subtask** (cross-run): The active agent calls `createSubtask({title, description, assignee, ...})` to file a new `Task` with `parentTaskId` set. **Fire-and-forget** — the parent agent does not wait. The child task wakes the worker on its own. Parents post a "Filed subtask: ..." comment on themselves so the human can follow the thread.

The rule of thumb: if a human needs to see or approve the intermediate step, it's a subtask. Otherwise it's a tool-call subagent.

### Reactions

Tight emoji set used by agents to communicate progress without flooding the comment thread:

| Emoji | Meaning                                   |
| ----- | ----------------------------------------- |
| 👀    | Acknowledged, starting work.              |
| 🤔    | Working / mid-research.                   |
| 💬    | Posted a proposal or substantive comment. |
| ✅    | Done.                                     |
| ⚠️    | Needs human input (e.g., ambiguous).      |
| ❌    | Errored / cannot complete.                |

Stored as `Comment.reactions[emoji]: string[]`. The first comment in an agent run gets the `👀`; subsequent reactions are added to existing comments rather than spawning new ones where possible, to keep the thread terse.

### Token budget + kill switch

- Per-agent default `maxTokensPerTask` set in `defineAgent`. Per-task override allowed.
- Worker tracks cumulative input + output tokens across all steps and subagents in the current run.
- Exceeding the cap halts the run, posts a `❌ Token budget exceeded` reaction, and marks `agentRun.status: 'errored'`.
- Kill switch on the task UI: a **Cancel run** button sets `agentRun.status: 'cancelled'`. Worker checks this between steps and exits cleanly.

### Chat → Task conversion

A "Convert to Task" button in `ChatPanel.tsx`:

1. Calls `/cms/api/chat.convertToTask` with the active chat ID.
2. Server creates a new Task. The chat's first user message becomes the task title (truncated). The full conversation is rendered as the seed comment (markdown, with tool calls collapsed).
3. The user is offered an assignee picker (humans + available agents) on conversion. If an agent is selected, the task starts with `agentRun.status: 'idle'` and the worker picks it up.
4. The original chat is preserved with `Task.sourceChatId` linking back to it.

### `@`-mentions and agent visibility in chat

Agents are first-class mention targets in the chat input alongside humans. `TaskCommentInput`'s mention parser (`extractMentions.ts`) extends to recognize `@<agent-name>`.

For discoverability, the chat header shows an **Agents** button that opens a popover listing every agent in the project (icon + name + description). Selecting one inserts an `@`-mention. This both teaches the user what agents exist and provides a mouse-driven path; `@` autocomplete remains the keyboard path.

`@`-mentioning an agent in the chat does **not** start an agent run on its own — the chat is still a synchronous, browser-executed session. It does pre-select the agent as the suggested assignee for "Convert to Task."

## File-level changes

New:
- `packages/root-cms/core/agents/types.ts` — types for `Agent`, `AgentRunMetadata`, `TaskProposal`, `ToolBundle`.
- `packages/root-cms/core/agents/define.ts` — `defineAgent()` API.
- `packages/root-cms/core/agents/registry.ts` — virtual module loader and runtime registry.
- `packages/root-cms/core/agents/runner.ts` — agent loop using `ToolLoopAgent`.
- `packages/root-cms/core/agents/tools-server.ts` — server-side `execute` for read bundle.
- `packages/root-cms/core/agents/tools-propose.ts` — `proposeChange`, `createSubtask` definitions.
- `packages/root-cms/core/agents/worker-persistent.ts` — in-process listener implementation.
- `packages/root-cms/core/agents/budget.ts` — token tracking and cap enforcement.
- `packages/root/src/node/agents-vite-plugin.ts` — `virtual:root/agents`.
- `packages/root-cms/ui/components/AgentPicker/` — list/select agents.
- `packages/root-cms/ui/components/AgentMention/` — `@` autocomplete extension.
- `packages/root-cms/ui/components/ProposalComment/` — proposal renderer + Apply / Reject.
- `packages/root-cms/ui/components/CommentReactions/` — emoji reactions row.

Modified:
- `packages/root-cms/ui/utils/tasks.ts` — schema additions (`reactions`, `proposal`, `parentTaskId`, `sourceChatId`, `agentRun`).
- `packages/root-cms/core/api.ts` — endpoints: `chat.convertToTask`, `proposal.apply`, `proposal.reject`, `task.cancelRun`, `task.retryRun`.
- `packages/root-cms/core/ai-tools.ts` — split server vs schema-only registrations for the read bundle.
- `packages/root-cms/ui/components/AiEditModal/ChatPanel.tsx` — Convert to Task button, agent picker integration.
- `packages/root-cms/ui/pages/TaskPage/TaskPage.tsx` — agent assignee rendering, kill switch, retry button, proposal comment rendering.
- `packages/root-cms/ui/components/TaskCommentInput/extractMentions.ts` — agent name recognition.

## Verification

- E2E: convert a chat to a task with `agent:content-manager` assigned. Observe `👀` reaction, then a `proposeChange` comment with diff. Click Apply; verify the doc is updated and the comment marks `status: 'applied'` with the user as `appliedBy`.
- Unit: `tools-server.test.ts` covers read bundle execute paths against a mocked `RootCMSClient`. `runner.test.ts` covers loop control, budget enforcement, and lease handling.
- Integration: stand up the persistent worker against a Firestore emulator; assign a task; assert the lease is taken, comments accumulate, and on completion `agentRun.status: 'idle'`.
- Permissions: an agent attempting a mutation directly (rather than via `proposeChange`) is rejected at the tool layer because mutating tools have no server-side `execute`.
- Token cap: configure `maxTokensPerTask: 1_000`; assert the run halts and `❌ Token budget exceeded` reaction appears.

## Migration / rollout

- Behind `experimental.aiAgents` flag in `root.config`.
- Schema additions are all optional — existing tasks and comments work unchanged.
- Worker starts only when the flag is on and at least one agent is registered.
- Existing chat sessions and existing tasks are unaffected.

## Open questions / future work

Out of scope for v0:
- Triggered (Firebase Functions) worker implementation.
- Multi-step proposals that apply atomically (transactional batch).
- Agent learning / feedback loop from approved vs. rejected proposals.
- Cross-project agent sharing.
- Voice / audio input on tasks.

## Resolved decisions

| Question                                  | Decision                                            |
| ----------------------------------------- | --------------------------------------------------- |
| Agents write code?                        | No. Agents advise; engineers edit code.             |
| Read-only auto-approves?                  | Yes.                                                |
| Mutating ops?                             | Posted as proposals; humans apply under their auth. |
| Where does the worker run?                | In-process listener for v0; trigger function later. |
| Resume policy on worker death?            | Human re-trigger; no automatic resume.              |
| Reaction set?                             | `👀 🤔 💬 ✅ ⚠️ ❌`.                              |
| Agent definition format?                  | TS file + Markdown body imported as `?raw`.         |
| Tool surface granularity?                 | Bundles (`read`, `propose`, `subtask`).             |
| Subtask blocking?                         | Fire-and-forget. Parents do not wait.               |
| `@`-mention?                              | Yes, plus an agent list popover in the chat header. |
| Token cap?                                | Per-task, configurable in `defineAgent`.            |
| Kill switch?                              | Cancel-run button on the task UI.                   |
| Configured by whom?                       | Repo developers only. No CMS-managed agents in v0.  |
| Project scope?                            | Scoped per project (one CMS per site).              |
