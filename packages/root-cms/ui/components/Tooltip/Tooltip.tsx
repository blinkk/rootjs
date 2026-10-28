import type {Placement} from '../../primitives/floating/useFloating.js';
import {
  Tooltip as BaseTooltip,
  type TooltipProps as BaseTooltipProps,
} from '../../primitives/Tooltip/Tooltip.js';

export interface TooltipProps extends BaseTooltipProps {
  /** Mantine's name for `placement`. */
  position?: Placement;
  /** Ignored (Mantine only). */
  transition?: string;
}

/**
 * The `Tooltip` primitive, accepting the Mantine props that call sites still
 * pass (`position`, `transition`). New code should import
 * `primitives/Tooltip/Tooltip.js` directly.
 */
export function Tooltip(props: TooltipProps) {
  const {position, transition, ...rest} = props;
  void transition;
  return <BaseTooltip placement={position} {...rest} />;
}
