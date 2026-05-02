---
'@blinkk/root-cms': minor
---

Add user profile avatars and `@mention` autocomplete for task comments.

- User display names and profile photos are persisted to
  `Projects/<projectId>/UserProfiles/<email>` on login.
- New `<UserAvatar>` and `<UserAvatarGroup>` components show a profile photo
  (or initials fallback) with a hover tooltip displaying the user's display
  name and email.
- New `useUserProfile`, `useUserProfiles`, and `useAllUserProfiles` hooks
  provide cached, lazy-loaded access to user profiles.
- New `<TaskCommentInput>` component supports `@<email>` autocomplete; mentions
  are persisted alongside task comments.
