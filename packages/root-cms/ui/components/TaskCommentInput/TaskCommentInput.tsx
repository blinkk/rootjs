import {ActionIcon, Loader, Tooltip} from '@mantine/core';
import {IconSend2} from '@tabler/icons-preact';
import {useEffect, useMemo, useRef, useState} from 'preact/hooks';
import {useAllUserProfiles} from '../../hooks/useUserProfile.js';
import {joinClassNames} from '../../utils/classes.js';
import {UserProfile} from '../../utils/user-profile.js';
import {UserAvatar} from '../UserAvatar/UserAvatar.js';
import './TaskCommentInput.css';

export interface TaskCommentInputProps {
  /** Initial value of the comment input. */
  initialValue?: string;
  /** Placeholder text. */
  placeholder?: string;
  /** Called when a comment is submitted. */
  onSubmit: (content: string, mentions: string[]) => void | Promise<void>;
  /** Called when the user cancels editing. */
  onCancel?: () => void;
  /** Disables the input while pending. */
  disabled?: boolean;
  /** Optional className for the wrapping element. */
  className?: string;
  /** Custom label for the submit button (defaults to "Comment"). */
  submitLabel?: string;
  /** Auto-focuses the input on mount. */
  autoFocus?: boolean;
}

interface MentionState {
  /** Current `@<query>` token before the caret, or null when not mentioning. */
  query: string;
  /** Index in the textarea where the `@` token starts. */
  tokenStart: number;
  /** Index of the highlighted suggestion (0-based). */
  selectedIndex: number;
}

const MAX_SUGGESTIONS = 6;

/**
 * Input for adding/editing a task comment with `@mention` autocomplete.
 *
 * Mentioned emails are extracted from the final content and returned via
 * `onSubmit(content, mentions)` so the caller can persist them alongside the
 * comment for notifications, etc.
 */
export function TaskCommentInput(props: TaskCommentInputProps) {
  const {profiles} = useAllUserProfiles();
  const [value, setValue] = useState(props.initialValue || '');
  const [mention, setMention] = useState<MentionState | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-grow the textarea as the user types.
  useEffect(() => {
    if (!textareaRef.current) {
      return;
    }
    textareaRef.current.style.height = 'auto';
    textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
  }, [value]);

  useEffect(() => {
    if (props.autoFocus && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [props.autoFocus]);

  const suggestions = useMemo(() => {
    if (!mention) {
      return [];
    }
    const q = mention.query.toLowerCase();
    const score = (p: UserProfile): number => {
      const email = (p.email || '').toLowerCase();
      const name = (p.displayName || '').toLowerCase();
      if (!q) {
        return 1;
      }
      if (email.startsWith(q) || name.startsWith(q)) {
        return 3;
      }
      if (email.includes(q) || name.includes(q)) {
        return 2;
      }
      return 0;
    };
    return profiles
      .map((p) => ({profile: p, s: score(p)}))
      .filter(({s}) => s > 0)
      .sort((a, b) => {
        if (b.s !== a.s) {
          return b.s - a.s;
        }
        const ae = (a.profile.email || '').toLowerCase();
        const be = (b.profile.email || '').toLowerCase();
        return ae.localeCompare(be);
      })
      .slice(0, MAX_SUGGESTIONS)
      .map((x) => x.profile);
  }, [profiles, mention]);

  // Clamp selectedIndex when suggestions shrink.
  useEffect(() => {
    if (!mention) {
      return;
    }
    if (mention.selectedIndex >= suggestions.length && suggestions.length > 0) {
      setMention({...mention, selectedIndex: 0});
    }
  }, [mention, suggestions]);

  function updateMentionFromCaret(text: string, caret: number) {
    // Walk back from the caret to find the start of the current `@<token>`.
    let i = caret - 1;
    while (i >= 0) {
      const ch = text[i];
      if (ch === '@') {
        const prev = i > 0 ? text[i - 1] : '';
        if (i === 0 || /\s/.test(prev)) {
          const query = text.slice(i + 1, caret);
          // Reject if the query contains whitespace.
          if (/\s/.test(query)) {
            setMention(null);
            return;
          }
          setMention((prev) => ({
            query,
            tokenStart: i,
            selectedIndex: prev?.tokenStart === i ? prev.selectedIndex : 0,
          }));
          return;
        }
        setMention(null);
        return;
      }
      if (/\s/.test(ch)) {
        setMention(null);
        return;
      }
      i--;
    }
    setMention(null);
  }

  function onInput(e: Event) {
    const el = e.target as HTMLTextAreaElement;
    const next = el.value;
    setValue(next);
    updateMentionFromCaret(next, el.selectionStart || next.length);
  }

  function applySuggestion(profile: UserProfile) {
    if (!mention) {
      return;
    }
    const before = value.slice(0, mention.tokenStart);
    const after = value.slice(
      textareaRef.current?.selectionStart ?? value.length
    );
    const inserted = `@${profile.email} `;
    const next = `${before}${inserted}${after}`;
    setValue(next);
    setMention(null);
    // Restore caret position after the inserted mention.
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) {
        return;
      }
      const newCaret = before.length + inserted.length;
      el.focus();
      el.setSelectionRange(newCaret, newCaret);
    });
  }

  function onKeyDown(e: KeyboardEvent) {
    if (mention && suggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMention({
          ...mention,
          selectedIndex: (mention.selectedIndex + 1) % suggestions.length,
        });
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMention({
          ...mention,
          selectedIndex:
            (mention.selectedIndex - 1 + suggestions.length) %
            suggestions.length,
        });
        return;
      }
      if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
        e.preventDefault();
        applySuggestion(suggestions[mention.selectedIndex]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setMention(null);
        return;
      }
    }

    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      submit();
      return;
    }

    if (e.key === 'Escape' && props.onCancel) {
      e.preventDefault();
      props.onCancel();
    }
  }

  async function submit() {
    const trimmed = value.trim();
    if (!trimmed || submitting || props.disabled) {
      return;
    }
    setSubmitting(true);
    try {
      await props.onSubmit(trimmed, extractMentions(trimmed));
      setValue('');
      setMention(null);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className={joinClassNames('TaskCommentInput', props.className)}
      data-disabled={props.disabled || submitting ? 'true' : 'false'}
    >
      <div className="TaskCommentInput__field">
        <textarea
          ref={textareaRef}
          className="TaskCommentInput__textarea"
          placeholder={props.placeholder || 'Add a comment. Use @ to mention.'}
          rows={1}
          value={value}
          onInput={onInput}
          onKeyDown={onKeyDown}
          onBlur={() => {
            // Delay closing so a click on a suggestion still fires.
            setTimeout(() => setMention(null), 150);
          }}
          disabled={props.disabled || submitting}
        />
        <div className="TaskCommentInput__actions">
          {props.onCancel && (
            <button
              type="button"
              className="TaskCommentInput__cancel"
              onClick={props.onCancel}
              disabled={submitting}
            >
              Cancel
            </button>
          )}
          <Tooltip
            label={props.submitLabel || 'Comment (Cmd+Enter)'}
            position="top"
            withArrow
          >
            <ActionIcon
              variant="filled"
              color="dark"
              radius="xl"
              onClick={submit}
              disabled={!value.trim() || submitting || props.disabled}
            >
              {submitting ? <Loader size={14} /> : <IconSend2 size={16} />}
            </ActionIcon>
          </Tooltip>
        </div>
      </div>
      {mention && suggestions.length > 0 && (
        <ul
          className="TaskCommentInput__suggestions"
          role="listbox"
          aria-label="User mention suggestions"
        >
          {suggestions.map((profile, index) => (
            <li
              key={profile.email}
              role="option"
              aria-selected={index === mention.selectedIndex}
              className={joinClassNames(
                'TaskCommentInput__suggestion',
                index === mention.selectedIndex &&
                  'TaskCommentInput__suggestion--active'
              )}
              // Use mousedown so this fires before the textarea's blur handler.
              onMouseDown={(e) => {
                e.preventDefault();
                applySuggestion(profile);
              }}
              onMouseEnter={() =>
                setMention((prev) =>
                  prev ? {...prev, selectedIndex: index} : prev
                )
              }
            >
              <UserAvatar
                email={profile.email}
                profile={profile}
                size={24}
                withTooltip={false}
              />
              <div className="TaskCommentInput__suggestion__text">
                {profile.displayName && (
                  <div className="TaskCommentInput__suggestion__name">
                    {profile.displayName}
                  </div>
                )}
                <div className="TaskCommentInput__suggestion__email">
                  {profile.email}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Extracts unique `@<email>` mentions from a comment body. Only matches
 * tokens that start at a word boundary so escaped emails (e.g. inside an URL)
 * aren't picked up.
 */
export function extractMentions(content: string): string[] {
  const result = new Set<string>();
  // Email-shaped token preceded by start-of-string or whitespace.
  const re = /(^|\s)@([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(content)) !== null) {
    result.add(match[2].toLowerCase());
  }
  return Array.from(result);
}
