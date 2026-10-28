import {IconTrash} from '@tabler/icons-preact';
import type {ComponentChildren} from 'preact';
import {defineGallery} from '../../dev/gallery/types.js';
import {Button} from '../Button/Button.js';
import {PortalContainer} from '../floating/Portal.js';
import {IconButton} from '../IconButton/IconButton.js';
import {Tooltip} from './Tooltip.js';

/**
 * Renders a story's overlays inside its `<main>` rather than at the end of
 * `<body>`, so axe's "content in landmarks" rule passes in the visual test.
 */
function inStory(render: () => ComponentChildren) {
  return () => <PortalContainer>{render()}</PortalContainer>;
}

export const TooltipGallery = defineGallery({
  id: 'tooltip',
  name: 'Tooltip',
  group: 'Primitives',
  screenshot: 'viewport',
  stories: {
    Placements: inStory(() => (
      <div className="flex flex-col items-center gap-12 py-8">
        <Tooltip label="Above" defaultOpen>
          <Button>Top</Button>
        </Tooltip>
        <Tooltip label="Below" placement="bottom" defaultOpen>
          <Button>Bottom</Button>
        </Tooltip>
        <Tooltip label="To the right" placement="right" defaultOpen>
          <Button>Right</Button>
        </Tooltip>
        <Tooltip label="To the left" placement="left" defaultOpen>
          <Button>Left</Button>
        </Tooltip>
      </div>
    )),
    'Long label': inStory(() => (
      <div className="flex min-h-40 items-end">
        <Tooltip
          label="Restore the items in the release to their state before the release was published"
          defaultOpen
        >
          <IconButton label="Roll back" variant="default">
            <IconTrash />
          </IconButton>
        </Tooltip>
      </div>
    )),
    'Disabled trigger': inStory(() => (
      <div className="flex min-h-24 items-end justify-end">
        <Tooltip
          label="You don't have access to publish this document"
          defaultOpen
        >
          <Button variant="primary" disabled>
            Publish
          </Button>
        </Tooltip>
      </div>
    )),
  },
});
