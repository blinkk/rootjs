import {IconLink, IconSearch} from '@tabler/icons-preact';
import {defineGallery} from '../../dev/gallery/types.js';
import {IconButton} from '../IconButton/IconButton.js';
import {TextInput} from './TextInput.js';

export const TextInputGallery = defineGallery({
  id: 'text-input',
  name: 'TextInput',
  group: 'Primitives',
  stories: {
    Sizes: () => (
      <div className="flex max-w-sm flex-col gap-3">
        <TextInput size="xs" aria-label="Extra small" placeholder="xs, 24px" />
        <TextInput size="sm" aria-label="Small" placeholder="sm, 28px" />
        <TextInput size="md" aria-label="Medium" placeholder="md, 36px" />
      </div>
    ),
    'Label and help text': () => (
      <div className="flex max-w-sm flex-col gap-4">
        <TextInput
          label="Release ID"
          description="Unique identifier for the release. Use alphanumeric characters and dashes only."
          placeholder="grogus-favorite-meals"
          required
        />
        <TextInput label="Name" size="md" defaultValue="Spring launch" />
      </div>
    ),
    Sections: () => (
      <div className="flex max-w-sm flex-col gap-3">
        <TextInput
          size="xs"
          aria-label="Search assets"
          placeholder="Search by name"
          leftSection={<IconSearch />}
        />
        <TextInput
          aria-label="Search docs"
          placeholder="Search"
          leftSection={<IconSearch />}
        />
        <TextInput
          size="md"
          aria-label="Link URL"
          defaultValue="https://example.com/a/very/long/path/that/keeps/going/and/going"
          leftSection={<IconLink />}
          rightSection={
            <IconButton label="Search" size="xs">
              <IconSearch />
            </IconButton>
          }
        />
      </div>
    ),
    States: () => (
      <div className="flex max-w-sm flex-col gap-4">
        <TextInput
          label="Slug"
          defaultValue="Not A Slug"
          error="Use lowercase letters, numbers and dashes."
        />
        <TextInput aria-label="Invalid, no message" defaultValue="Bad" error />
        <TextInput label="Disabled" defaultValue="Can't edit" disabled />
        <TextInput label="Read-only" defaultValue="Read me" readOnly />
      </div>
    ),
  },
});
