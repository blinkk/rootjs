import {
  IconChevronDown,
  IconPlus,
  IconRocket,
  IconTrash,
} from '@tabler/icons-preact';
import {defineGallery} from '../../dev/gallery/types.js';
import {Button} from './Button.js';

export const ButtonGallery = defineGallery({
  id: 'button',
  name: 'Button',
  group: 'Primitives',
  stories: {
    Variants: () => (
      <div className="flex flex-wrap items-center gap-2">
        <Button>Default</Button>
        <Button variant="primary">Primary</Button>
        <Button variant="danger">Danger</Button>
        <Button variant="subtle">Subtle</Button>
      </div>
    ),
    Sizes: () => (
      <div className="flex flex-wrap items-center gap-2">
        <Button size="xs">Extra small</Button>
        <Button size="sm">Small</Button>
        <Button size="md">Medium</Button>
      </div>
    ),
    'With icons': () => (
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" icon={<IconRocket />}>
          Publish
        </Button>
        <Button icon={<IconPlus />} size="xs">
          Add
        </Button>
        <Button iconRight={<IconChevronDown />}>Options</Button>
        <Button variant="danger" icon={<IconTrash />} size="md">
          Delete
        </Button>
      </div>
    ),
    States: () => (
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" loading>
          Saving
        </Button>
        <Button loading icon={<IconPlus />}>
          Loading
        </Button>
        <Button disabled>Disabled</Button>
        <Button variant="primary" disabled>
          Disabled
        </Button>
      </div>
    ),
    'As a link': () => (
      <div className="flex flex-wrap items-center gap-2">
        <Button href="#releases" variant="subtle">
          All releases
        </Button>
        <Button href="#docs" disabled>
          Disabled link
        </Button>
      </div>
    ),
    'Full width, long label': () => (
      <div className="flex max-w-xs flex-col gap-2">
        <Button variant="primary" fullWidth>
          Full width
        </Button>
        <Button icon={<IconPlus />}>
          A very long label that truncates instead of wrapping onto a new line
        </Button>
      </div>
    ),
  },
});
