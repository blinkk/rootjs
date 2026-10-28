import {
  IconBold,
  IconDotsVertical,
  IconExternalLink,
  IconPlus,
  IconTable,
  IconTrash,
} from '@tabler/icons-preact';
import {defineGallery} from '../../dev/gallery/types.js';
import {IconButton} from './IconButton.js';

export const IconButtonGallery = defineGallery({
  id: 'icon-button',
  name: 'IconButton',
  group: 'Primitives',
  stories: {
    Variants: () => (
      <div className="flex flex-wrap items-center gap-2">
        <IconButton label="More actions">
          <IconDotsVertical />
        </IconButton>
        <IconButton label="Add" variant="default">
          <IconPlus />
        </IconButton>
        <IconButton label="Add" variant="primary">
          <IconPlus />
        </IconButton>
      </div>
    ),
    Colors: () => (
      <div className="flex flex-wrap items-center gap-2">
        <IconButton label="Open spreadsheet" variant="green">
          <IconTable />
        </IconButton>
        <IconButton label="Add" variant="blue">
          <IconPlus />
        </IconButton>
        <IconButton label="Add" variant="blue-light">
          <IconPlus />
        </IconButton>
        <IconButton label="Delete" variant="danger">
          <IconTrash />
        </IconButton>
        <IconButton label="Delete" variant="danger-outline">
          <IconTrash />
        </IconButton>
        <IconButton label="Delete" variant="danger-subtle">
          <IconTrash />
        </IconButton>
        <IconButton label="Open spreadsheet" variant="green" disabled>
          <IconTable />
        </IconButton>
      </div>
    ),
    Sizes: () => (
      <div className="flex flex-wrap items-center gap-2">
        <IconButton label="Add" variant="default" size="xs">
          <IconPlus />
        </IconButton>
        <IconButton label="Add" variant="default" size="sm">
          <IconPlus />
        </IconButton>
        <IconButton label="Add" variant="default" size="md">
          <IconPlus />
        </IconButton>
        <IconButton label="Add" variant="default" size="sm" round>
          <IconPlus />
        </IconButton>
      </div>
    ),
    States: () => (
      <div className="flex flex-wrap items-center gap-2">
        <IconButton label="Bold" pressed>
          <IconBold />
        </IconButton>
        <IconButton label="Bold" pressed={false}>
          <IconBold />
        </IconButton>
        <IconButton label="Delete" variant="default" loading>
          <IconTrash />
        </IconButton>
        <IconButton label="Delete" variant="default" disabled>
          <IconTrash />
        </IconButton>
        <IconButton label="Open in a new tab" href="#preview" target="_blank">
          <IconExternalLink />
        </IconButton>
      </div>
    ),
  },
});
