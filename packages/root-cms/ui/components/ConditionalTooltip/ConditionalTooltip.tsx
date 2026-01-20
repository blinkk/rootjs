import {Tooltip} from '@mantine/core';
import {ComponentChildren} from 'preact';

interface ConditionalTooltipProps {
  label: string;
  condition: boolean;
  children: ComponentChildren;
  className?: string;
  style?: any;
}

/**
 * Wraps a component in a Tooltip if it meets a certain condition (e.g. disabled).
 *
 * This helps showing tooltips on disabled buttons, which usually have
 * `pointer-events: none`.
 */
export function ConditionalTooltip(props: ConditionalTooltipProps) {
  if (!props.condition) {
    return <>{props.children}</>;
  }
  return (
    <Tooltip label={props.label}>
      <div
        className={props.className}
        style={{
          display: 'inline-block',
          cursor: 'not-allowed',
          ...props.style,
        }}
      >
        <div style={{pointerEvents: 'none'}}>{props.children}</div>
      </div>
    </Tooltip>
  );
}
