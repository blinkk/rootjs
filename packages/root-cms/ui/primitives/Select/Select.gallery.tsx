import {IconWorld} from '@tabler/icons-preact';
import type {ComponentChildren} from 'preact';
import {useState} from 'preact/hooks';
import {defineGallery} from '../../dev/gallery/types.js';
import {Avatar} from '../Avatar/Avatar.js';
import {Button} from '../Button/Button.js';
import {Dialog} from '../Dialog/Dialog.js';
import {PortalContainer} from '../floating/Portal.js';
import {Select, type SelectOption} from './Select.js';

/**
 * Renders a story's dropdowns inside its `<main>` rather than at the end of
 * `<body>`, so axe's "content in landmarks" rule passes in the visual test.
 */
function inStory(render: () => ComponentChildren) {
  return () => <PortalContainer>{render()}</PortalContainer>;
}

const ROLES = [
  {value: 'ADMIN', label: 'Admin'},
  {value: 'EDITOR', label: 'Editor'},
  {value: 'CONTRIBUTOR', label: 'Contributor'},
  {value: 'VIEWER', label: 'Viewer'},
];

const LOCALES: SelectOption[] = [
  {value: 'en', label: 'English (default)'},
  {value: 'de', label: 'German', group: 'Europe'},
  {value: 'fr', label: 'French', group: 'Europe'},
  {value: 'it', label: 'Italian', group: 'Europe', disabled: true},
  {value: 'ja', label: 'Japanese', group: 'Asia'},
  {value: 'ko', label: 'Korean', group: 'Asia'},
  {value: 'zh-TW', label: 'Chinese (Traditional)', group: 'Asia'},
];

const NAMING_MODES: SelectOption[] = [
  {
    value: 'hash',
    label: 'Hash the file name',
    description:
      "The filename will be hashed so the file's original name won't be exposed.",
  },
  {
    value: 'hash-path',
    label: 'Use a hashed path with the original file name',
    description:
      'Use the original file name, but put it inside a hashed directory.',
  },
  {
    value: 'clean',
    label: 'Use the original file name only',
    description:
      'The file will be uploaded to the bucket as-is, without a hashed directory.',
  },
];

interface UserOption extends SelectOption {
  email: string;
}

const USERS: UserOption[] = [
  {value: 'grogu@example.com', label: 'Grogu', email: 'grogu@example.com'},
  {value: 'din@example.com', label: 'Din Djarin', email: 'din@example.com'},
  {value: 'cara@example.com', label: 'Cara Dune', email: 'cara@example.com'},
];

/** A Select inside an open modal Dialog: its dropdown portals into the dialog. */
function SelectInDialog() {
  const [open, setOpen] = useState(true);
  return (
    <>
      <Button onClick={() => setOpen(true)}>Share</Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Share doc">
        <div className="min-h-64">
          <Select label="Role" data={ROLES} defaultValue="EDITOR" defaultOpen />
        </div>
      </Dialog>
    </>
  );
}

export const SelectGallery = defineGallery({
  id: 'select',
  name: 'Select',
  group: 'Primitives',
  screenshot: 'viewport',
  stories: {
    'Sizes and states': inStory(() => (
      <div className="flex max-w-sm flex-col gap-3">
        <Select
          size="xs"
          aria-label="Sort, xs"
          data={ROLES}
          placeholder="xs, 24px"
        />
        <Select
          size="sm"
          aria-label="Sort, sm"
          data={ROLES}
          defaultValue="EDITOR"
        />
        <Select
          size="md"
          aria-label="Sort, md"
          data={ROLES}
          placeholder="md, 36px"
        />
        <Select
          label="Role"
          description="What members of the group can do."
          data={ROLES}
          defaultValue="ADMIN"
          required
        />
        <Select
          aria-label="Locale"
          size="xs"
          data={LOCALES}
          defaultValue="ja"
          leftSection={<IconWorld />}
        />
        <Select
          label="Timezone"
          data={['America/Los_Angeles', 'Europe/London']}
          defaultValue="America/Los_Angeles"
          searchable
          clearable
        />
        <Select
          label="Collection"
          data={ROLES}
          placeholder="Select"
          error="Choose a collection."
        />
        <Select label="Disabled" data={ROLES} defaultValue="VIEWER" disabled />
      </div>
    )),
    'Open, with groups': inStory(() => (
      <div className="min-h-96 max-w-sm">
        <Select label="Locale" data={LOCALES} defaultValue="fr" defaultOpen />
      </div>
    )),
    'Searchable, long list': inStory(() => (
      <div className="min-h-96 max-w-sm">
        <Select
          label="Timezone"
          data={Intl.supportedValuesOf('timeZone')}
          defaultValue="America/New_York"
          searchable
          clearable
          defaultOpen
          size="xs"
        />
      </div>
    )),
    'Descriptions and custom options': inStory(() => (
      <div className="flex min-h-96 max-w-sm flex-col gap-4">
        <Select
          label="Assignee"
          data={USERS}
          placeholder="Search or enter an email"
          searchable
          creatable
          size="xs"
          renderOption={(option) => (
            <span className="flex items-center gap-2">
              <Avatar size="sm">{option.label.slice(0, 1)}</Avatar>
              <span className="min-w-0">
                <span className="block truncate">{option.label}</span>
                <span className="block truncate text-xs text-muted">
                  {option.email}
                </span>
              </span>
            </span>
          )}
        />
        <Select
          label="File name options"
          data={NAMING_MODES}
          defaultValue="hash"
          defaultOpen
          size="xs"
        />
      </div>
    )),
    'Nothing found': inStory(() => (
      <div className="min-h-48 max-w-sm">
        <Select
          label="Source string"
          data={[]}
          placeholder="Select a source string"
          nothingFound="No matching strings"
          searchable
          defaultOpen
          size="xs"
        />
      </div>
    )),
    'Inside a dialog': inStory(() => <SelectInDialog />),
  },
});
