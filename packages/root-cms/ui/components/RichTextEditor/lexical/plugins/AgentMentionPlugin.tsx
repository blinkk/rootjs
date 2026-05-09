import {useLexicalComposerContext} from '@lexical/react/LexicalComposerContext';
import {
  LexicalTypeaheadMenuPlugin,
  MenuOption,
  useBasicTypeaheadTriggerMatch,
} from '@lexical/react/LexicalTypeaheadMenuPlugin';
import {
  $createTextNode,
  $getSelection,
  $isRangeSelection,
  TextNode,
} from 'lexical';
import {createPortal} from 'preact/compat';
import {useCallback, useMemo, useState} from 'preact/hooks';
import {useAgents, type AgentSummary} from '../../../../hooks/useAgents.js';
import {joinClassNames} from '../../../../utils/classes.js';
import {AgentAvatar} from '../../../AgentAvatar/AgentAvatar.js';

import './AgentMentionPlugin.css';

class AgentMentionOption extends MenuOption {
  agent: AgentSummary;
  constructor(agent: AgentSummary) {
    super(agent.name);
    this.agent = agent;
  }
}

/**
 * Lexical plugin that adds `@agent` typeahead to the comment editor. Uses
 * the registry surfaced by `useAgents` so it picks up site-defined agents
 * automatically.
 *
 * Mention selection inserts plain text (`@<name> `) rather than a custom
 * node — keeps comment serialization simple and matches the mention parser
 * in `extractAgentMentions`.
 */
export function AgentMentionPlugin() {
  const [editor] = useLexicalComposerContext();
  const {agents} = useAgents();
  const [query, setQuery] = useState<string | null>(null);

  // Match `@<word>` triggered by typing `@`. `allowWhitespace: false` keeps
  // the menu closed once the user has moved past the slug.
  const checkForMention = useBasicTypeaheadTriggerMatch('@', {
    minLength: 0,
  });

  const options = useMemo(() => {
    if (query === null) {
      return [];
    }
    const normalized = query.toLowerCase();
    return agents
      .filter((a) => a.name.toLowerCase().startsWith(normalized))
      .slice(0, 8)
      .map((agent) => new AgentMentionOption(agent));
  }, [query, agents]);

  const onSelectOption = useCallback(
    (
      selectedOption: AgentMentionOption,
      nodeToReplace: TextNode | null,
      closeMenu: () => void
    ) => {
      editor.update(() => {
        const insert = `@${selectedOption.agent.name} `;
        const textNode = $createTextNode(insert);
        if (nodeToReplace) {
          nodeToReplace.replace(textNode);
        } else {
          const selection = $getSelection();
          if ($isRangeSelection(selection)) {
            selection.insertNodes([textNode]);
          }
        }
        textNode.select();
        closeMenu();
      });
    },
    [editor]
  );

  return (
    <LexicalTypeaheadMenuPlugin<AgentMentionOption>
      options={options}
      triggerFn={checkForMention}
      onQueryChange={setQuery}
      onSelectOption={onSelectOption}
      menuRenderFn={(
        anchorElementRef,
        {selectedIndex, selectOptionAndCleanUp, setHighlightedIndex}
      ) => {
        if (!anchorElementRef.current || options.length === 0) {
          return null;
        }
        return createPortal(
          <div className="AgentMentionMenu" role="listbox">
            {options.map((option, index) => (
              <button
                key={option.agent.name}
                type="button"
                ref={option.setRefElement}
                className={joinClassNames(
                  'AgentMentionMenu__item',
                  index === selectedIndex && 'AgentMentionMenu__item--active'
                )}
                onMouseEnter={() => setHighlightedIndex(index)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  selectOptionAndCleanUp(option);
                }}
              >
                <AgentAvatar
                  name={option.agent.name}
                  iconUrl={option.agent.iconUrl}
                  size={22}
                  className="AgentMentionMenu__icon"
                />
                <span className="AgentMentionMenu__body">
                  <span className="AgentMentionMenu__name">
                    @{option.agent.name}
                  </span>
                  <span className="AgentMentionMenu__desc">
                    {option.agent.description}
                  </span>
                </span>
              </button>
            ))}
          </div>,
          anchorElementRef.current
        );
      }}
    />
  );
}
