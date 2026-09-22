import './MentionsPlugin.css';

import {useLexicalComposerContext} from '@lexical/react/LexicalComposerContext';
import {
  LexicalTypeaheadMenuPlugin,
  MenuOption,
  MenuTextMatch,
} from '@lexical/react/LexicalTypeaheadMenuPlugin';
import {$createTextNode, TextNode} from 'lexical';
import {createPortal} from 'preact/compat';
import {useCallback, useMemo, useState} from 'preact/hooks';
import {
  ProjectUser,
  useProjectUsers,
} from '../../../../hooks/useProjectUsers.js';
import {joinClassNames} from '../../../../utils/classes.js';
import {UserAvatar} from '../../../UserAvatar/UserAvatar.js';
import {$createMentionNode} from '../nodes/MentionNode.js';

/** Max number of users shown in the suggestions menu. */
const MAX_SUGGESTIONS = 8;

/** Max length of the text after `@` that still triggers the menu. */
const MAX_QUERY_LENGTH = 64;

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
  max = MAX_SUGGESTIONS
): ProjectUser[] {
  const q = query.trim().toLowerCase();
  return users
    .map((user) => ({user, score: scoreUser(user, q)}))
    .filter(({score}) => score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      const aLabel = (a.user.displayName || a.user.email).toLowerCase();
      const bLabel = (b.user.displayName || b.user.email).toLowerCase();
      return aLabel.localeCompare(bLabel);
    })
    .slice(0, max)
    .map(({user}) => user);
}

/**
 * Adds `@mention` autocomplete to the editor. Typing `@` followed by part of
 * a user's name or email opens a menu of matching project users; selecting
 * one inserts a {@link MentionNode}.
 */
export function MentionsPlugin() {
  const [editor] = useLexicalComposerContext();
  const {users} = useProjectUsers();
  const [query, setQuery] = useState<string | null>(null);

  const options = useMemo(() => {
    if (query === null) {
      return [];
    }
    return rankMentionUsers(users, query).map(
      (user) => new MentionOption(user)
    );
  }, [users, query]);

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
      anchorClassName="MentionsPlugin__anchor"
      menuRenderFn={(
        anchorElementRef,
        {selectedIndex, selectOptionAndCleanUp, setHighlightedIndex}
      ) => {
        if (!anchorElementRef.current || options.length === 0) {
          return null;
        }
        return createPortal(
          <ul
            className="MentionsPlugin__menu"
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
        props.active && 'MentionsPlugin__item--active'
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
      <div className="MentionsPlugin__item__text">
        {user.displayName && (
          <div className="MentionsPlugin__item__name">{user.displayName}</div>
        )}
        <div className="MentionsPlugin__item__email">{user.email}</div>
      </div>
    </li>
  );
}
