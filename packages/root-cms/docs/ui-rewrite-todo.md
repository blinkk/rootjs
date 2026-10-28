# CMS UI rewrite: follow-ups

Bugs and loose ends found during the rewrite (see `ui-rewrite-plan.md`) that
weren't fixed on the spot. Tick items off, or delete them, as they land.

## Bugs (existed before the rewrite)

- [ ] `features/translations/pages/DocTranslationsPage`: the "Import from
      Sheet" and "Export to Sheet" buttons (shown when a doc has a linked
      sheet) have no click handlers. Needs the import/export flow wired up, or
      the buttons removed.

## Phase 4 (document editor)

- [x] `DocumentPage.css` sets `.DocumentPage__ai {flex: 0 0 420px}`, so the
      Root AI panel is clipped at 375px. The doc page header also overflows
      horizontally on mobile.
- [x] `ImagePastePlugin.visual.test.tsx` fails (before the rewrite too).
- [x] `LexicalEditor.css` is unlayered, so `TaskPage.css` and
      `CommentEditor.css` keep unlayered overrides of it, and the
      CommentEditor placeholder stays at 13px to match Lexical's text. Drop the
      overrides once Lexical's CSS is layered.
- [x] `.CommentThread__entries` is targeted from `DocEditor.css`; keep the
      class name or update both together. (Kept, now in `@layer components`
      with a comment pointing at `CommentThread`.)

- [ ] Rich text: typing fast right after select-all + delete can come out
      scrambled (also before the rewrite). Possibly a race between
      `RichTextField`'s value sync and `OnChangePlugin`.
- [ ] Rich text toolbar menus (block type, Components, etc.) return focus to
      their toolbar button after an action rather than to the editor. Decide
      whether the editor should get focus back.
- [ ] `IconButton` can't be shrunk with a `size-*` className: tailwind-merge
      doesn't group the custom `size-control-*` utilities with `size-*`.
      Teach `cn` about them (extend the tailwind-merge config).
- [ ] No token for a dark media background (video, image editor canvas);
      `FileField`/`ImageEditorDialog` use `bg-fg` and an inline `#000`.

## Phase 5 (polish)

- [ ] Replace `window.confirm` with the confirm dialog from
      `primitives/modals/` (bottom sheet on mobile) in RootAIChat (delete
      chat), CommentThread and TaskPage (delete comment, remove person), and
      PermissionGroupsBox/SettingsPage. `app/navigation-guard.ts` must stay
      synchronous, so it keeps `window.confirm`.
- [ ] PinnedCommentThreads portal to `document.body` on purpose, so an open
      dialog doesn't capture them. Revisit if it causes stacking issues with
      dialogs.

## Not checked live yet

Couldn't be opened without changing shared CMS data, so verify by hand on a
test project:

- [ ] Release rollback confirm; LockPublishingModal's edit-lock and unlock
      variants; PublishChecksModal blocked and warnings states; ChecksPanel in
      the doc page's Checks panel.
- [ ] TranslationsManagerPage Publish and Delete confirms.
- [ ] Assets: SyncProgressModal (starts a real sync), the Rename and
      Disable-alt-text dialogs.
- [ ] Tasks: choosing a person in the assignee/CC popovers (UserSelect inside
      Popover) keeps the popover open and saves.
- [ ] ErrorLogsPage with real error reports (only the empty state was seen).
- [ ] Doc editor: the preview's "follow doc" confirm; a single
      `schema.reference` field (no schema in docs uses one); Edit with AI and
      AI alt text (AI isn't enabled there); FileField's overwrite warning,
      naming-mode Select, upload states and delete-from-GCS dialog (need a
      real upload).
