import {ComponentChildren} from 'preact';
import {Tooltip} from '../../primitives/Tooltip/Tooltip.js';
import {cn} from '../../utils/classes.js';

interface ConditionalTooltipProps {
  label: string;
  condition: boolean;
  children: ComponentChildren;
  className?: string;
  style?: any;
}

/**
 * Wraps a component in a Tooltip if it meets a certain condition (e.g.
 * disabled), explaining why. The child is wrapped in an element that takes
 * the hover, since disabled buttons usually have `pointer-events: none`.
 */
export function ConditionalTooltip(props: ConditionalTooltipProps) {
  if (!props.condition) {
    return <>{props.children}</>;
  }
  return (
    <Tooltip label={props.label}>
      <div
        className={cn(
          'ConditionalTooltip inline-block cursor-not-allowed',
          props.className
        )}
        style={props.style}
      >
        <div className="ConditionalTooltip__content pointer-events-none">
          {props.children}
        </div>
      </div>
    </Tooltip>
  );
}
