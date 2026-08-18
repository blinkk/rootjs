# Design: Task Manager Parity with Asana-style Trackers

Status: in progress — v1 covers §5.1–§5.7. See `ui/utils/tasks.ts` for the
data layer, `ui/components/TaskManager/` for the list/board, and
`ui/pages/TaskPage/` for the detail view.
Author: root-cms team

## 1. Overview

The CMS ships a lightweight task manager at `/cms/tasks`. It is good enough
for "leave a note for a teammate", but teams that run their content intake
in a dedicated tracker (Asana, Jira, Linear, Trello) cannot move that
workflow into the CMS without losing structure. In practice the missing
pieces force people to flatten a structured request — its request type,
target surface, device scope, blocked state — into free text at the top of
the description, which then cannot be filtered, sorted, or reported on.

This document inventories the gap against an Asana-style tracker, decides
what belongs in a CMS task manager and what does not, and specifies the
data model and UI for closing it.

### Goals

- Represent a structured intake request without stuffing metadata into the
  description: project-defined **custom fields** with typed values.
- Support the hierarchy and relationships real work has: **subtasks** and
  **dependencies**.
- Let more than one person be attached to a task: **followers** in addition
  to the single assignee.
- Make the list usable at scale: **search**, **sorting**, and **custom
  field columns**.
- Preserve provenance for tasks migrated in from another tracker: an
  **external source** link and importable author/timestamp.

### Non-goals

Some Asana surface area is deliberately out of scope — it belongs to a
project-management product, not to a CMS:

- Timeline/Gantt views, portfolios, workload and capacity planning.
- Rules/automation builders, intake forms, approval workflows.
- Recurring tasks, goals/OKRs, time tracking, invoicing.
- Cross-project task multi-homing (a task living in several projects).

A CMS task is scoped to one CMS project; that is the intended boundary.

## 2. What exists today

| Capability | Where |
| --- | --- |
| Task doc (`title`, `description`, `assignee`, `priority`, `status`, `targetLaunchDate`, `attachments`) | `Projects/<pid>/Tasks/<id>` |
| Auto-incrementing numeric task ids | `Counters/tasks` + `runTransaction` in `createTask` |
| Rich-text comments, one level of replies, `@email` mentions, edit/delete with history | `Tasks/<id>/Comments/*` |
| Metadata change log (title, assignee, priority, status, target date) | `Tasks/<id>/Events/*` |
| Table view, board-by-status view, compact list | `TaskManager.tsx` |
| Filters: active / assigned-to-me / created-by-me / closed / all | `filterTasks()` |
| Project-level default assignee | `Projects/<pid>.settings.defaultAssignee` |
| Task-level file attachments (GCS) | `addTaskAttachment()` |

## 3. Gap analysis

| # | Asana capability | Root CMS today | Verdict |
| --- | --- | --- | --- |
| 1 | Custom fields (select, multi-select, text, number, date) surfaced as list columns | none — metadata is flattened into the description | **close** |
| 2 | Subtasks | none | **close** |
| 3 | Multiple collaborators / followers | single `assignee` | **close** |
| 4 | Due date *with time*, plus a start date | date-only `targetLaunchDate` | **close** |
| 5 | Tags / labels | none | **close** |
| 6 | Dependencies ("blocked by" / "blocking") | none | **close** |
| 7 | Inline completion toggle from the list | must open the task and change a `<Select>` | **close** |
| 8 | Full-text search across tasks | none | **close** |
| 9 | Sortable list columns | fixed `createdAt` desc | **close** |
| 10 | Rich-text task description | plain `<Textarea>` (comments *are* rich text) | **close** |
| 11 | Attachments on comments | task-level only | **close** |
| 12 | Task permalink into the originating tracker | none — URL buried in description prose | **close** |
| 13 | Import preserving original author + timestamp | `serverTimestamp()` and the signed-in user are always stamped | **close** |
| 14 | Drag-and-drop between board columns | board is read-only | defer (v2) |
| 15 | Comment reactions | none | defer (v2) |
| 16 | Delivered notifications for `@mentions` | mentions are stored but never delivered | defer (v2) |
| 17 | Sections / grouping within a project | none | defer (v2) |
| 18 | Timeline, portfolios, rules, forms, workload, recurring tasks | none | out of scope (§1) |

### Why 13 matters

`createTask()` and `addTaskComment()` unconditionally write
`serverTimestamp()` and `window.firebase.user.email`. There is no supported
path to import a thread from another tracker with its real authors and
dates, so a migration either loses the history or is hand-written straight
into Firestore, bypassing every validation in the data layer. Attribution
then reads as though one person wrote a year of discussion in an afternoon.

## 4. Data model

All additions are optional fields on the existing docs, so existing tasks
keep working and no migration is required.

### 4.1 Custom field definitions

Definitions are project-level so a field can be shown as a list column and
reused across tasks. Stored on the project doc under
`settings.taskFields` as an ordered array:

```ts
interface TaskFieldDef {
  id: string;                  // stable key, used in Task.fields
  label: string;
  type: 'text' | 'number' | 'date' | 'select' | 'multiselect' | 'checkbox';
  options?: TaskFieldOption[]; // select/multiselect only
  showInList?: boolean;        // render as a table column
}

interface TaskFieldOption {
  value: string;
  label: string;
  color?: string;              // badge color, mirrors Asana's colored chips
}
```

### 4.2 Task additions

```ts
interface Task {
  // ...existing fields
  fields?: Record<string, TaskFieldValue>;  // keyed by TaskFieldDef.id
  tags?: string[];
  followers?: string[];                     // emails, deduped + lowercased
  parentId?: string | null;                 // subtask -> parent task id
  blockedBy?: string[];                     // task ids
  startDate?: Timestamp | null;
  dueDate?: Timestamp | null;               // supersedes targetLaunchDate
  source?: TaskSource | null;
  descriptionBody?: RichTextData | null;    // rich text; `description` kept
                                            // as the plain-text projection
}

type TaskFieldValue = string | number | boolean | string[] | Timestamp | null;

interface TaskSource {
  provider: string;   // e.g. 'asana', 'jira', 'linear'
  url?: string;
  id?: string;
}
```

`targetLaunchDate` is retained and kept in sync with `dueDate` so existing
queries and the existing column keep working; `dueDate` is the field new
code reads.

### 4.3 Comment additions

```ts
interface TaskComment {
  // ...existing fields
  attachments?: TaskAttachment[];
  importedAuthor?: string | null;  // display name from the source tracker
}
```

### 4.4 Import affordance

`createTask()` and `addTaskComment()` gain an optional `imported` block,
accepted only when the caller supplies it explicitly:

```ts
interface TaskImportOptions {
  createdAt?: Date | Timestamp;  // original creation time
  author?: string;               // original author's display name
  source?: TaskSource;
}
```

When present, `createdAt` is written as a concrete `Timestamp` instead of
`serverTimestamp()`, and `importedAuthor` is rendered in place of the
account email, suffixed with the provider (e.g. "Dana Ruiz · via Asana").
`createdBy` still records the *authenticated* account that performed the
import, so the audit trail is not falsifiable — the imported name is
presentational only.

## 5. Implementation plan

- **5.1 Data layer** — extend `ui/utils/tasks.ts` with the fields in §4,
  plus `updateTaskFields`, `updateTaskTags`, `updateTaskFollowers`,
  `updateTaskDependencies`, `setTaskParent`, and custom-field CRUD on the
  project settings doc. Every mutation continues to write a `Tasks/<id>/
  Events` entry so the timeline stays complete.
- **5.2 Custom fields UI** — a definitions editor in task settings, typed
  inputs in the detail page's metadata panel, and colored badges in the
  list.
- **5.3 Subtasks** — a subtask list on the detail page and a progress
  indicator (`3/5`) on the parent's list row; subtasks are ordinary tasks
  with `parentId` set, so they reuse the whole detail page.
- **5.4 Followers, tags, dependencies** — chip inputs in the metadata
  panel; a "blocked" badge in the list derived from `blockedBy` entries
  whose status is still open.
- **5.5 Dates** — `datetime-local` inputs for `startDate`/`dueDate`, with
  overdue styling in the list.
- **5.6 List usability** — a search box (client-side over title,
  description, tags, id), sortable column headers, custom field columns,
  and an inline completion checkbox.
- **5.7 Rich text + comment attachments** — reuse `TaskCommentEditor` for
  the description; reuse `uploadFileToGCS` for comment attachments.
- **5.8 (v2)** — board drag-and-drop, reactions, mention notifications,
  sections.

## 6. Firestore considerations

Subtasks, followers, and dependencies all add fan-out reads if implemented
naively. The list view already subscribes to the whole `Tasks` collection
via `subscribeTasks()`, so subtask rollups and "blocked by" resolution are
computed client-side from that single snapshot rather than issuing
per-task reads. Custom field *definitions* live on the project doc, which
the UI already loads, so rendering a list column costs no extra read.
