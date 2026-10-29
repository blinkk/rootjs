import {
  IconCheck,
  IconChevronDown,
  IconCopy,
  IconDotsVertical,
  IconExternalLink,
  IconLock,
  IconPhoto,
  IconTable,
  IconTrash,
} from '@tabler/icons-preact';
import type {ComponentChildren} from 'preact';
import {useState} from 'preact/hooks';
import {defineGallery} from '../../dev/gallery/types.js';
import {Button} from '../Button/Button.js';
import {Dialog} from '../Dialog/Dialog.js';
import {PortalContainer} from '../floating/Portal.js';
import {IconButton} from '../IconButton/IconButton.js';
import {TextInput} from '../TextInput/TextInput.js';
import {Menu, MenuDivider, MenuGroup, MenuItem} from './Menu.js';

/**
 * Renders a story's overlays inside its `<main>` rather than at the end of
 * `<body>`, so axe's "content in landmarks" rule passes in the visual test.
 */
function inStory(render: () => ComponentChildren) {
  return () => <PortalContainer>{render()}</PortalContainer>;
}

/**
 * A Menu inside an open modal Dialog. The menu portals into the dialog (the
 * top layer), so it shows above it and stays clickable.
 */
function MenuInDialog() {
  const [open, setOpen] = useState(true);
  return (
    <>
      <Button onClick={() => setOpen(true)}>Edit field</Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Edit field">
        <div className="flex min-h-48 items-start justify-between gap-2">
          <p className="m-0">Hero image</p>
          <Menu
            placement="bottom-end"
            defaultOpen
            trigger={
              <IconButton label="Field actions">
                <IconDotsVertical />
              </IconButton>
            }
          >
            <MenuItem icon={<IconCopy />}>Duplicate</MenuItem>
            <MenuItem icon={<IconTrash />} danger>
              Remove
            </MenuItem>
          </Menu>
        </div>
      </Dialog>
    </>
  );
}

const FRUITS = [
  'Apple',
  'Apricot',
  'Banana',
  'Blueberry',
  'Cherry',
  'Grape',
  'Kiwi',
  'Lemon',
  'Mango',
  'Orange',
  'Peach',
  'Pear',
];

/**
 * A menu with a filter input that takes focus on open (`data-autofocus`),
 * capped at 240px tall so the items scroll.
 */
function FilterMenu() {
  const [query, setQuery] = useState('');
  const items = FRUITS.filter((fruit) =>
    fruit.toLowerCase().includes(query.trim().toLowerCase())
  );
  return (
    <Menu
      defaultOpen
      maxHeight={240}
      onOpenChange={(open) => !open && setQuery('')}
      header={
        <TextInput
          data-autofocus
          aria-label="Filter fruit"
          placeholder="Filter…"
          size="xs"
          value={query}
          onInput={(e) => setQuery(e.currentTarget.value)}
        />
      }
      trigger={<Button iconRight={<IconChevronDown />}>Fruit</Button>}
    >
      {items.map((fruit) => (
        <MenuItem key={fruit}>{fruit}</MenuItem>
      ))}
    </Menu>
  );
}

export const MenuGallery = defineGallery({
  id: 'menu',
  name: 'Menu',
  group: 'Primitives',
  screenshot: 'viewport',
  stories: {
    Actions: inStory(() => (
      <div className="flex min-h-80 justify-end">
        <Menu
          placement="bottom-end"
          defaultOpen
          trigger={
            <IconButton label="More actions">
              <IconDotsVertical />
            </IconButton>
          }
        >
          <MenuItem icon={<IconCopy />} hint="⌘D">
            Duplicate
          </MenuItem>
          <MenuItem icon={<IconExternalLink />} href="#preview" target="_blank">
            Open preview
          </MenuItem>
          <MenuItem icon={<IconLock />} disabled>
            Lock publishing
          </MenuItem>
          <MenuDivider />
          <MenuItem icon={<IconTrash />} danger>
            Delete
          </MenuItem>
        </Menu>
      </div>
    )),
    Groups: inStory(() => (
      <div className="min-h-80">
        <Menu
          defaultOpen
          trigger={<Button iconRight={<IconChevronDown />}>Insert</Button>}
        >
          <MenuGroup label="Blocks">
            <MenuItem icon={<IconTable />}>Table</MenuItem>
            <MenuItem icon={<IconPhoto />}>Image</MenuItem>
          </MenuGroup>
          <MenuDivider />
          <MenuGroup label="View">
            <MenuItem hint={<IconCheck />}>Compact</MenuItem>
            <MenuItem>Comfortable, with extra space between rows</MenuItem>
          </MenuGroup>
        </Menu>
      </div>
    )),
    'Filter and max height': inStory(() => (
      <div className="min-h-80">
        <FilterMenu />
      </div>
    )),
    'Inside a dialog': inStory(() => <MenuInDialog />),
  },
});
