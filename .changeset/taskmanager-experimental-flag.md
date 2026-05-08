---
'@blinkk/root-cms': patch
---

chore: gate task manager behind `experiments.taskManager` opt-in

The task manager is now an opt-in experimental feature. To enable it, set
`experiments: {taskManager: true}` in the CMS plugin config. The previous
mechanism of hiding `'tasks'` via `sidebar.hiddenBuiltInTools` no longer
applies.
