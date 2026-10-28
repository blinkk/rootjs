import {IconMessageCircle, IconUser} from '@tabler/icons-preact';
import type {ComponentChildren} from 'preact';
import {defineGallery} from '../../dev/gallery/types.js';
import {Button} from '../Button/Button.js';
import {PortalContainer} from '../floating/Portal.js';
import {IconButton} from '../IconButton/IconButton.js';
import {Popover} from './Popover.js';

const PEOPLE = ['alex@example.com', 'sam@example.com', 'jordan@example.com'];

/**
 * Renders a story's overlays inside its `<main>` rather than at the end of
 * `<body>`, so axe's "content in landmarks" rule passes in the visual test.
 */
function inStory(render: () => ComponentChildren) {
  return () => <PortalContainer>{render()}</PortalContainer>;
}

export const PopoverGallery = defineGallery({
  id: 'popover',
  name: 'Popover',
  group: 'Primitives',
  screenshot: 'viewport',
  stories: {
    Default: inStory(() => (
      <div className="min-h-64">
        <Popover
          label="Assign task"
          trigger={<Button icon={<IconUser />}>Assign</Button>}
          placement="bottom-start"
          width={280}
          defaultOpen
        >
          <p className="m-0 mb-2 text-sm text-muted">Assign this task to:</p>
          <ul className="m-0 flex list-none flex-col p-0">
            {PEOPLE.map((email) => (
              <li key={email}>
                <Button variant="subtle" fullWidth className="justify-start">
                  {email}
                </Button>
              </li>
            ))}
          </ul>
        </Popover>
      </div>
    )),
    'Wider than the screen': inStory(() => (
      <div className="flex min-h-64 justify-end">
        <Popover
          label="Comments"
          trigger={
            <IconButton label="Comments" variant="default">
              <IconMessageCircle />
            </IconButton>
          }
          placement="left-start"
          width={420}
          defaultOpen
        >
          <h2 className="m-0 mb-1 text-base font-semibold text-strong">
            Comments
          </h2>
          <p className="m-0 mb-3 text-sm text-muted">
            This popover asks for 420px but never grows past the screen: on a
            375px phone it flips below its trigger and narrows to fit.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="subtle">Cancel</Button>
            <Button variant="primary">Comment</Button>
          </div>
        </Popover>
      </div>
    )),
  },
});
