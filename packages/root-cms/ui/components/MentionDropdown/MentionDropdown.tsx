import './MentionDropdown.css';

import type {MentionItem} from '../../hooks/useMentionAutocomplete.js';
import {joinClassNames} from '../../utils/classes.js';
import {AgentAvatar} from '../AgentAvatar/AgentAvatar.js';

export interface MentionDropdownProps {
  items: MentionItem[];
  activeIndex: number;
  onSelect: (item: MentionItem) => void;
  className?: string;
}

/**
 * Floating list of @-mention suggestions. Positioning is the caller's
 * responsibility — render this inside a relatively-positioned wrapper around
 * the input.
 */
export function MentionDropdown(props: MentionDropdownProps) {
  if (props.items.length === 0) {
    return null;
  }
  return (
    <div
      className={joinClassNames('MentionDropdown', props.className)}
      role="listbox"
      aria-label="Mention suggestions"
    >
      {props.items.map((item, idx) => (
        <button
          key={item.value}
          type="button"
          className={joinClassNames(
            'MentionDropdown__item',
            idx === props.activeIndex && 'MentionDropdown__item--active'
          )}
          // Use mousedown so the click fires before the input loses focus.
          onMouseDown={(e) => {
            e.preventDefault();
            props.onSelect(item);
          }}
        >
          <AgentAvatar
            name={item.value}
            iconUrl={item.iconUrl}
            size={22}
            className="MentionDropdown__icon"
          />
          <div className="MentionDropdown__body">
            <div className="MentionDropdown__value">@{item.value}</div>
            {item.description && (
              <div className="MentionDropdown__desc">{item.description}</div>
            )}
          </div>
        </button>
      ))}
    </div>
  );
}
