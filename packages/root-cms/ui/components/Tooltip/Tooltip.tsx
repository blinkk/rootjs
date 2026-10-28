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
  /** Ignored: the tooltip always has an arrow. */
  withArrow?: boolean;
}

/**
 * The `Tooltip` primitive, accepting the Mantine props that call sites still
 * pass (`position`, `transition`, `withArrow`). New code should import
 * `primitives/Tooltip/Tooltip.js` directly.
 */
export function Tooltip(props: TooltipProps) {
  const {position, transition, withArrow, ...rest} = props;
  void transition;
  void withArrow;
  return <BaseTooltip placement={position} {...rest} />;
}
