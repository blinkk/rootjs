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
    'Date and time': () => (
      <div className="flex max-w-sm flex-col gap-4">
        <div className="flex gap-2">
          <TextInput
            className="min-w-0 flex-1"
            label="Date"
            type="date"
            defaultValue="2026-10-27"
          />
          <TextInput
            className="w-28 shrink-0"
            label="Time"
            type="time"
            defaultValue="19:00"
          />
        </div>
        <TextInput
          label="Publish at"
          type="datetime-local"
          defaultValue="2026-10-27T19:00"
        />
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span>Run every day at</span>
          <TextInput
            className="w-28"
            aria-label="Time"
            type="time"
            defaultValue="09:30"
          />
        </div>
        <TextInput label="Disabled" type="time" defaultValue="12:00" disabled />
      </div>
    ),
    'Section content': () => (
      // Icons in a section are sized by the input; other content keeps its
      // own size, e.g. a 20px avatar.
      <div className="flex max-w-sm flex-col gap-3">
        <TextInput
          aria-label="Assignee"
          defaultValue="ada@example.com"
          leftSection={
            <span className="flex size-5 items-center justify-center rounded-full bg-info text-2xs font-semibold text-inverse">
              A
            </span>
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
