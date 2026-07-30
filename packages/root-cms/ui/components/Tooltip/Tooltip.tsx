import './Tooltip.css';

import {Tooltip as MantineTooltip, TooltipProps} from '@mantine/core';
import {joinClassNames} from '../../utils/classes.js';

export type {TooltipProps};

/**
 * Drop-in replacement for Mantine's `<Tooltip>` that keeps the wrapper element
 * layout-neutral.
 *
 * Mantine wraps a tooltip's child in an `inline-block` div. That div
 * establishes a line box, so it ends up a few pixels taller than its child
 * (the line box reserves room for the font's descender). Whenever a
 * tooltip-wrapped element sits next to one without a tooltip, the extra space
 * knocks the two out of alignment. Making the wrapper a flex box removes the
 * line box so it shrink-wraps its child exactly.
 *
 * Example:
 *   <Tooltip label="Open doc">
 *     <Button>Open</Button>
 *   </Tooltip>
 */
export function Tooltip(props: TooltipProps) {
  return (
    <MantineTooltip
      {...props}
      className={joinClassNames(props.className, 'Tooltip')}
    />
  );
}
