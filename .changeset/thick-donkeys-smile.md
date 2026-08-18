---
'@blinkk/root-cms': minor
---

feat: bring the task manager closer to Asana-style tracker parity

Tasks now support project-defined custom fields (text, number, date,
select, multi-select, checkbox) that can be surfaced as list columns,
subtasks, followers, tags, dependencies ("blocked by"), start and due
dates, a rich-text description, and comment attachments. The task list
gains search, sortable columns, and a one-click completion toggle.

`createTask()` and `addTaskComment()` also accept an optional `imported`
block so a thread migrated from another tracker keeps its original author
name and timestamps; `createdBy` still records the authenticated account
that performed the import.

`targetLaunchDate` is superseded by `dueDate` but is kept in sync, so
existing tasks and callers keep working with no migration.
