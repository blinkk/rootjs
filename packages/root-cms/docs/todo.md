# Root CMS: todo

Known bugs and loose ends that haven't been fixed yet. Add items as you find
them, and delete them as they land.

## Bugs

- `ui/features/translations/pages/DocTranslationsPage`: the "Import from
  Sheet" and "Export to Sheet" buttons (shown when a doc has a linked sheet)
  have no click handlers. Needs the import/export flow wired up, or the
  buttons removed.

## Cleanup

- Replace `window.confirm` with the confirm dialog from
  `ui/primitives/modals/` (bottom sheet on mobile) in RootAIChat (delete
  chat), CommentThread and TaskPage (delete comment, remove person), and
  PermissionGroupsBox/SettingsPage. `ui/app/navigation-guard.ts` must stay
  synchronous, so it keeps `window.confirm`.
- `PinnedCommentThreads` portal to `document.body` on purpose, so an open
  dialog doesn't capture them. Revisit if it causes stacking issues with
  dialogs.

## Needs manual verification

Flows from the Mantine → Tailwind UI rewrite that couldn't be opened without
changing shared CMS data. A static review found no regressions; verify them by
hand on a test project:

- Release rollback confirm; LockPublishingModal's edit-lock and unlock
  variants; PublishChecksModal blocked and warnings states; ChecksPanel in the
  doc page's Checks panel.
- TranslationsManagerPage Publish and Delete confirms.
- Assets: SyncProgressModal (starts a real sync), the Rename and
  Disable-alt-text dialogs.
- Tasks: choosing a person in the assignee/CC popovers (UserSelect inside
  Popover) keeps the popover open and saves.
- ErrorLogsPage with real error reports (only the empty state was seen).
- Doc editor: the preview's "follow doc" confirm; a single `schema.reference`
  field; Edit with AI and AI alt text; FileField's overwrite warning,
  naming-mode Select, upload states and delete-from-GCS dialog.
