import './AgentPicker.css';

import {Loader, Menu} from '@mantine/core';
import {IconRobot} from '@tabler/icons-preact';
import {AgentSummary, useAgents} from '../../hooks/useAgents.js';
import {joinClassNames} from '../../utils/classes.js';
import {AgentAvatar} from '../AgentAvatar/AgentAvatar.js';

export interface AgentPickerProps {
  /** Callback fired when the user picks an agent. Pass `null` to clear. */
  onSelect: (agent: AgentSummary | null) => void;
  /** Optional currently-selected agent name shown as the trigger label. */
  selectedAgent?: string | null;
  /**
   * Optional label shown in the trigger when no agent is selected.
   * Defaults to "Pick an agent".
   */
  placeholder?: string;
  /** Optional "no assignee" item label. When omitted, the option is hidden. */
  noAssigneeLabel?: string;
  className?: string;
}

/**
 * Dropdown picker listing available agents in the project. Used by the
 * chat → task conversion flow and anywhere else the user needs to assign
 * an agent. Reads from `/cms/api/agents.list` via `useAgents`.
 */
export function AgentPicker(props: AgentPickerProps) {
  const {agents, loading, error} = useAgents();
  const selected = props.selectedAgent
    ? agents.find((a) => a.name === props.selectedAgent)
    : null;

  return (
    <Menu
      withinPortal
      control={
        <button
          type="button"
          className={joinClassNames('AgentPicker__trigger', props.className)}
        >
          <span className="AgentPicker__triggerIcon">
            {selected ? (
              <AgentAvatar
                name={selected.name}
                iconUrl={selected.iconUrl}
                size={18}
              />
            ) : (
              <IconRobot size={16} />
            )}
          </span>
          <span>
            {selected ? selected.name : props.placeholder || 'Pick an agent'}
          </span>
        </button>
      }
    >
      {loading && (
        <Menu.Item disabled>
          <Loader size="xs" /> Loading agents…
        </Menu.Item>
      )}
      {error && (
        <Menu.Item disabled>
          <span className="AgentPicker__error">Error: {error}</span>
        </Menu.Item>
      )}
      {!loading && !error && agents.length === 0 && (
        <Menu.Item disabled>No agents registered</Menu.Item>
      )}
      {props.noAssigneeLabel && (
        <Menu.Item onClick={() => props.onSelect(null)}>
          {props.noAssigneeLabel}
        </Menu.Item>
      )}
      {agents.map((agent) => (
        <Menu.Item key={agent.name} onClick={() => props.onSelect(agent)}>
          <div className="AgentPicker__option">
            <AgentAvatar
              name={agent.name}
              iconUrl={agent.iconUrl}
              size={20}
              className="AgentPicker__optionIcon"
            />
            <span className="AgentPicker__optionName">{agent.name}</span>
          </div>
        </Menu.Item>
      ))}
    </Menu>
  );
}
