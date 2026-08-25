import {ProjectUser} from '../../hooks/useProjectUsers.js';
import {UserProfile} from '../../utils/user-profile.js';

/** A single option in the user dropdown. */
export interface UserSelectItem {
  /** The email address, used as the option's value. */
  value: string;
  /** The text shown in the input (display name when known, else the email). */
  label: string;
  /** The user's email. */
  email: string;
  /** The user's display name, when known. */
  displayName?: string;
  /** The user's profile photo, when known. */
  photoURL?: string;
  /** True when the option was typed in rather than sourced from the project. */
  freeValue?: boolean;
}

/**
 * Loose email check used to decide whether a typed value can be added. Keeps
 * pace with the rest of the CMS, which only requires an `@` in an address.
 */
const EMAIL_RE = /^[^\s@*][^\s@]*@[^\s@]+$/;

/** Returns true if the value looks like an email address. */
export function isEmailLike(value: string): boolean {
  return EMAIL_RE.test(value.trim());
}

/** Builds a dropdown option for a user in the project's user list. */
export function toUserItem(user: ProjectUser): UserSelectItem {
  return {
    value: user.email,
    label: user.displayName || user.email,
    email: user.email,
    displayName: user.displayName,
    photoURL: user.photoURL,
  };
}

/** Builds a dropdown option for an email that isn't a project user. */
export function toFreeValueItem(email: string): UserSelectItem {
  const value = email.trim().toLowerCase();
  return {value: value, label: value, email: value, freeValue: true};
}

/**
 * Builds the dropdown options from the project's user list, plus any values
 * typed in by hand and any selected values that aren't project users, so their
 * labels still render.
 */
export function buildUserSelectData(options: {
  users: ProjectUser[];
  created: UserSelectItem[];
  selected: string[];
}): UserSelectItem[] {
  const itemsByValue = new Map<string, UserSelectItem>();
  options.users.forEach((user) => {
    itemsByValue.set(user.email, toUserItem(user));
  });
  options.created.forEach((item) => {
    if (!itemsByValue.has(item.value)) {
      itemsByValue.set(item.value, item);
    }
  });
  options.selected.forEach((value) => {
    const key = (value || '').trim().toLowerCase();
    if (key && !itemsByValue.has(key)) {
      itemsByValue.set(key, toFreeValueItem(key));
    }
  });
  return Array.from(itemsByValue.values());
}

/**
 * Returns the profile to render for an item, or `null` for free values (which
 * have no profile to look up, so the avatar falls back to initials).
 */
export function toProfile(item: UserSelectItem): UserProfile | null {
  if (item.freeValue) {
    return null;
  }
  return {
    email: item.email,
    displayName: item.displayName,
    photoURL: item.photoURL,
  };
}

/** Matches the search query against both the display name and the email. */
export function matchesQuery(query: string, item: UserSelectItem): boolean {
  const q = query.trim().toLowerCase();
  if (!q) {
    return true;
  }
  return (
    (item.label || '').toLowerCase().includes(q) ||
    (item.email || '').toLowerCase().includes(q)
  );
}

/** Only offer to add a typed value when it looks like an email address. */
export function shouldCreateItem(
  query: string,
  data: UserSelectItem[]
): boolean {
  const value = query.trim().toLowerCase();
  if (!isEmailLike(value)) {
    return false;
  }
  return !data.some((item) => item.value.toLowerCase() === value);
}
