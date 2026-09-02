# Field Comments

Status: implemented — see `shared/comments.ts` for the shared types and
helpers, `ui/utils/comments.ts` for the firestore access,
`ui/hooks/useFieldComments.tsx` for the client-side state,
`ui/components/CommentThread/` and `ui/components/CommentsPanel/` for the
UI, and `core/services-notifications-comments.ts` for email notifications.

## Overview

Field comments let editors leave comments on individual fields of a doc,
similar to comments in Google Docs or Figma. Each field has a single thread:
a flat, chronological history of comments with no nested replies. Threads
can be resolved and are reopened automatically when someone comments again.

Comments support `@mentions`. Typing `@` followed by part of a user's name or
email in the comment box opens an autocomplete of the project's users.
Mentions are stored in the comment body as flagged `mailto:` links
(`<a href="mailto:me@example.com" data-mention="me@example.com">@Me</a>`) so
they survive sanitization and can be extracted server-side.

## Editor UI

- **Field header button.** Hovering a field label reveals a comment button.
  Clicking it opens a popover with the field's thread and a minimal comment
  box (no toolbar; formatting is available via the floating toolbar when
  text is selected). Fields with open comments show the button permanently
  with a count.
- **Comments panel.** The "Comments" button in the doc status bar toggles a
  right-hand panel listing every thread on the doc, filterable by open,
  resolved, or all. Clicking a thread's field label scrolls the editor to
  the field. The popover's "Open in comments panel" action focuses the
  thread in the panel.
- **Resolving.** Anyone with edit access can mark a thread as resolved or
  reopen it. Authors can edit or delete their own comments.

The comment box is the same `CommentEditor` component used by the task
manager (`ui/components/CommentEditor/`). Tasks use its default variant
(with toolbar); field comments use `variant="minimal"`.

## Data model

Threads are stored per draft doc:

```
Projects/{projectId}/Collections/{collectionId}/Drafts/{slug}/Comments/{threadId}
```

`threadId` is derived from the field's deep key (e.g. `fields.hero.title`):
a readable prefix (the last segment of the key) plus a truncated SHA-256 of
the full key, e.g. `title-3f9a0c1d2e…`. Hashing keeps ids well under
firestore's 1,500-byte doc id limit no matter how deeply a field is nested,
while staying deterministic so a thread can be fetched without a query.
Array items are keyed by their stable item key, so they keep their comments
when reordered. Each thread doc holds:

```ts
{
  id: 'title-3f9a0c1d2e4f6a8b0c2d4e6f',
  docId: 'Pages/foo',
  fieldKey: 'fields.hero.title',
  fieldLabel: 'Hero › Title',
  status: 'open' | 'resolved',
  comments: [
    {id, type: 'comment', body, content, mentions, createdAt, createdBy},
    {id, type: 'resolved', createdAt, createdBy},
    {id, type: 'reopened', createdAt, createdBy},
  ],
  participants: ['a@example.com', 'b@example.com'],
  createdAt, createdBy, updatedAt, updatedBy, resolvedAt, resolvedBy,
}
```

Because threads live under `Drafts/{slug}`, the existing firestore rules
apply: `ADMIN`, `EDITOR`, and `CONTRIBUTOR` users can comment; `VIEWER`
users can read.

## Actions

Comment activity is written to the action log with the following actions.
The metadata shape is `FieldCommentActionMetadata` in `shared/comments.ts`.

| Action               | When                                  |
| -------------------- | ------------------------------------- |
| `doc.comment.add`    | A comment is added to a thread.       |
| `doc.comment.edit`   | The author edits a comment.           |
| `doc.comment.delete` | The author deletes a comment.         |
| `doc.comment.resolve`| A thread is marked as resolved.       |
| `doc.comment.reopen` | A resolved thread is reopened.        |

## Email notifications

`commentEmailNotifications()` is a notification service that emails the
users `@mentioned` in a comment plus everyone who previously commented on
the same field (excluding the user performing the action). Register it in
`root.config.ts`:

```ts
import {cmsPlugin, commentEmailNotifications} from '@blinkk/root-cms/plugin';

cmsPlugin({
  notifications: [
    commentEmailNotifications({
      // Trigger delivery via the hosted email service right away.
      emailService: true,
    }),
  ],
});
```

Options:

- `actions`: which comment actions send email. Defaults to `add`,
  `resolve`, and `reopen`.
- `notifyMentions` / `notifyParticipants` / `notifySelf`: control the
  default recipient list.
- `to`: extra recipients, static or computed per action (e.g. doc watchers).
- `filter`: skip notifications, e.g. for certain collections.
- `cmsUrl`: base URL used for the "Open in Root CMS" link. Defaults to
  `rootConfig.domain`.
- `template`: `{placeholder}` templates or a function. Placeholders include
  `{summary}`, `{by}`, `{fieldLabel}`, `{content}`, `{docId}`, and `{url}`.
  See `CommentEmailTemplateData` for the full list.

Emails are queued in `Projects/{projectId}/Emails` and delivered by the
Root.js email service, the same as `emailNotifications()`.
