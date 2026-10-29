import {useLexicalComposerContext} from '@lexical/react/LexicalComposerContext';
import {
  LexicalTypeaheadMenuPlugin,
  MenuOption,
  MenuTextMatch,
} from '@lexical/react/LexicalTypeaheadMenuPlugin';
import {$createTextNode, TextNode} from 'lexical';
import {createContext} from 'preact';
import {createPortal} from 'preact/compat';
import {useCallback, useContext, useMemo, useState} from 'preact/hooks';
import {joinClassNames} from '../../../../../../utils/classes.js';
import {
  ProjectUser,
  useProjectUsers,
} from '../../../../../users/useProjectUsers.js';
import {UserAvatar} from '../../../../../users/UserAvatar/UserAvatar.js';
import {$createMentionNode} from '../nodes/MentionNode.js';

/** Max number of users shown in the suggestions menu. */
const MAX_SUGGESTIONS = 8;

/** Max length of the text after `@` that still triggers the menu. */
const MAX_QUERY_LENGTH = 64;

/**
 * Emails of users related to the current context (e.g. a task's creator,
 * assignee, cc list, and commenters). These are suggested alongside project
 * users, even if they aren't project members, and ranked ahead of other users
 * with an equally good match.
 *
 * Example:
 *   <MentionSuggestionsContext.Provider value={['alex@example.com']}>
 *     <CommentEditor ... />
 *   </MentionSuggestionsContext.Provider>
 */
export const MentionSuggestionsContext = createContext<string[]>([]);

/** A user shown in the mentions menu. */
class MentionOption extends MenuOption {
  user: ProjectUser;

  constructor(user: ProjectUser) {
    super(user.email);
    this.user = user;
  }
}

/**
 * Matches an `@<query>` token immediately before the caret. The `@` must be
 * at the start of the text or preceded by whitespace so that emails typed
 * inline (e.g. `me@example.com`) don't open the menu. The query may contain
 * a single `@` so that full emails can be typed to narrow the results.
 */
export function matchMentionTrigger(text: string): MenuTextMatch | null {
  const match = /(^|\s)@([^\s@]*(?:@[^\s@]*)?)$/.exec(text);
  if (!match) {
    return null;
  }
  const query = match[2];
  if (query.length > MAX_QUERY_LENGTH) {
    return null;
  }
  return {
    leadOffset: match.index + match[1].length,
    matchingString: query,
    replaceableString: `@${query}`,
  };
}

/** Scores how well a user matches a mention query (higher is better). */
function scoreUser(user: ProjectUser, query: string): number {
  if (!query) {
    return 1;
  }
  const email = user.email.toLowerCase();
  const name = (user.displayName || '').toLowerCase();
  if (email.startsWith(query) || name.startsWith(query)) {
    return 4;
  }
  if (name.split(/\s+/).some((word) => word.startsWith(query))) {
    return 3;
  }
  if (email.includes(query) || name.includes(query)) {
    return 2;
  }
  return 0;
}

/** Ranks and trims the list of users for a mention query. */
export function rankMentionUsers(
  users: ProjectUser[],
  query: string,
  options?: {
    /** Emails to rank ahead of other users with an equal score. */
    preferred?: string[];
    max?: number;
  }
): ProjectUser[] {
  const q = query.trim().toLowerCase();
  const preferred = new Set(options?.preferred || []);
  return users
    .map((user) => ({
      user,
      score: scoreUser(user, q),
      preferred: preferred.has(user.email),
    }))
    .filter(({score}) => score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      if (a.preferred !== b.preferred) {
        return a.preferred ? -1 : 1;
      }
      const aLabel = (a.user.displayName || a.user.email).toLowerCase();
      const bLabel = (b.user.displayName || b.user.email).toLowerCase();
      return aLabel.localeCompare(bLabel);
    })
    .slice(0, options?.max ?? MAX_SUGGESTIONS)
    .map(({user}) => user);
}

/**
 * Merges suggested emails into the list of project users, skipping duplicates
 * and anything that doesn't look like an email address. Returns the merged
 * list and the normalized suggested emails.
 */
export function mergeMentionSuggestions(
  users: ProjectUser[],
  suggestions: string[]
): {users: ProjectUser[]; preferred: string[]} {
  const preferred = Array.from(
    new Set(
      suggestions
        .map((email) => email.trim().toLowerCase())
        .filter((email) => /^[^\s@]+@[^\s@]+$/.test(email))
    )
  );
  const known = new Set(users.map((user) => user.email));
  const extra = preferred
    .filter((email) => !known.has(email))
    .map((email) => ({email}));
  return {users: [...users, ...extra], preferred};
}

/**
 * Adds `@mention` autocomplete to the editor. Typing `@` followed by part of
 * a user's name or email opens a menu of matching project users (plus any
 * users from {@link MentionSuggestionsContext}); selecting one inserts a
 * {@link MentionNode}.
 */
export function MentionsPlugin() {
  const [editor] = useLexicalComposerContext();
  const {users: projectUsers} = useProjectUsers();
  const suggestions = useContext(MentionSuggestionsContext);
  const [query, setQuery] = useState<string | null>(null);

  const {users, preferred} = useMemo(
    () => mergeMentionSuggestions(projectUsers, suggestions),
    [projectUsers, suggestions]
  );

  const options = useMemo(() => {
    if (query === null) {
      return [];
    }
    return rankMentionUsers(users, query, {preferred}).map(
      (user) => new MentionOption(user)
    );
  }, [users, preferred, query]);

  const onSelectOption = useCallback(
    (
      option: MentionOption,
      nodeToReplace: TextNode | null,
      closeMenu: () => void
    ) => {
      editor.update(() => {
        const label = option.user.displayName || option.user.email;
        const mentionNode = $createMentionNode(option.user.email, `@${label}`);
        if (nodeToReplace) {
          nodeToReplace.replace(mentionNode);
        }
        // Add a trailing space so the user can keep typing after the mention.
        const spaceNode = $createTextNode(' ');
        mentionNode.insertAfter(spaceNode);
        spaceNode.select();
        closeMenu();
      });
    },
    [editor]
  );

  const triggerFn = useCallback(
    (text: string) => matchMentionTrigger(text),
    []
  );

  return (
    <LexicalTypeaheadMenuPlugin<MentionOption>
      onQueryChange={setQuery}
      onSelectOption={onSelectOption}
      triggerFn={triggerFn}
      options={options}
      // Above pinned comment threads, at the old z-index of 300.
      anchorClassName="MentionsPlugin__anchor z-(--cms-z-toast)"
      menuRenderFn={(
        anchorElementRef,
        {selectedIndex, selectOptionAndCleanUp, setHighlightedIndex}
      ) => {
        if (!anchorElementRef.current || options.length === 0) {
          return null;
        }
        return createPortal(
          <ul
            className="MentionsPlugin__menu m-0 mt-1 max-h-60 w-65 list-none overflow-y-auto rounded-lg border border-solid border-border bg-surface p-1 shadow-md"
            role="listbox"
            aria-label="User mention suggestions"
          >
            {options.map((option, index) => (
              <MentionMenuItem
                key={option.key}
                option={option}
                active={index === selectedIndex}
                onSelect={() => selectOptionAndCleanUp(option)}
                onHover={() => setHighlightedIndex(index)}
              />
            ))}
          </ul>,
          anchorElementRef.current
        );
      }}
    />
  );
}

interface MentionMenuItemProps {
  option: MentionOption;
  active: boolean;
  onSelect: () => void;
  onHover: () => void;
}

function MentionMenuItem(props: MentionMenuItemProps) {
  const {option} = props;
  const {user} = option;
  return (
    <li
      ref={(el) => option.setRefElement(el)}
      role="option"
      aria-selected={props.active}
      className={joinClassNames(
        'MentionsPlugin__item',
        props.active && 'MentionsPlugin__item--active',
        'flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-surface-active aria-selected:bg-surface-active'
      )}
      // Use mousedown so selection happens before the editor loses focus.
      onMouseDown={(e) => {
        e.preventDefault();
        props.onSelect();
      }}
      onMouseEnter={props.onHover}
    >
      <UserAvatar
        email={user.email}
        profile={{
          email: user.email,
          displayName: user.displayName,
          photoURL: user.photoURL,
        }}
        size={24}
        withTooltip={false}
      />
      <div className="MentionsPlugin__item__text flex min-w-0 flex-col gap-px">
        {user.displayName && (
          <div className="MentionsPlugin__item__name truncate text-sm font-medium text-fg">
            {user.displayName}
          </div>
        )}
        <div className="MentionsPlugin__item__email truncate text-xs text-muted">
          {user.email}
        </div>
      </div>
    </li>
  );
}
