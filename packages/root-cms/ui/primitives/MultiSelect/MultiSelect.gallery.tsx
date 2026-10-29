import {IconTag, IconWorld} from '@tabler/icons-preact';
import type {ComponentChildren} from 'preact';
import {useState} from 'preact/hooks';
import {defineGallery} from '../../dev/gallery/types.js';
import {Avatar} from '../Avatar/Avatar.js';
import {Button} from '../Button/Button.js';
import {Dialog} from '../Dialog/Dialog.js';
import {PortalContainer} from '../floating/Portal.js';
import type {SelectOption} from '../Select/Select.js';
import {MultiSelect} from './MultiSelect.js';

/**
 * Renders a story's dropdowns inside its `<main>` rather than at the end of
 * `<body>`, so axe's "content in landmarks" rule passes in the visual test.
 */
function inStory(render: () => ComponentChildren) {
  return () => <PortalContainer>{render()}</PortalContainer>;
}

const LOCALES = [
  'en',
  'de',
  'fr',
  'es',
  'it',
  'ja',
  'ko',
  'pt-BR',
  'zh-CN',
  'zh-TW',
];

const TAGS: SelectOption[] = [
  {value: 'homepage', label: 'homepage', group: 'Pages'},
  {value: 'pricing', label: 'pricing', group: 'Pages'},
  {value: 'legal', label: 'legal', group: 'Pages', disabled: true},
  {value: 'cta', label: 'cta', group: 'Components'},
  {value: 'footer', label: 'footer', group: 'Components'},
  {value: 'nav', label: 'nav', group: 'Components'},
];

interface UserOption extends SelectOption {
  email: string;
}

const USERS: UserOption[] = [
  {value: 'grogu@example.com', label: 'Grogu', email: 'grogu@example.com'},
  {value: 'din@example.com', label: 'Din Djarin', email: 'din@example.com'},
  {value: 'cara@example.com', label: 'Cara Dune', email: 'cara@example.com'},
  {
    value: 'greef@example.com',
    label: 'Greef Karga',
    email: 'greef@example.com',
  },
];

/** A MultiSelect inside an open modal Dialog. */
function MultiSelectInDialog() {
  const [open, setOpen] = useState(true);
  const [tags, setTags] = useState(['homepage']);
  return (
    <>
      <Button onClick={() => setOpen(true)}>Add tags</Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Add tags">
        <div className="min-h-72">
          <MultiSelect
            label="Tags"
            data={TAGS}
            value={tags}
            onValueChange={setTags}
            placeholder="Select or create tags"
            creatable
            defaultOpen
          />
        </div>
      </Dialog>
    </>
  );
}

export const MultiSelectGallery = defineGallery({
  id: 'multi-select',
  name: 'MultiSelect',
  group: 'Primitives',
  screenshot: 'viewport',
  stories: {
    'Sizes and states': inStory(() => (
      <div className="flex max-w-sm flex-col gap-3">
        <MultiSelect
          size="xs"
          aria-label="Locales, xs"
          data={LOCALES}
          defaultValue={['en', 'de']}
        />
        <MultiSelect
          size="sm"
          aria-label="Locales, sm"
          data={LOCALES}
          placeholder="All locales"
          leftSection={<IconWorld />}
        />
        <MultiSelect
          size="md"
          aria-label="Locales, md"
          data={LOCALES}
          defaultValue={['fr', 'ja']}
        />
        <MultiSelect
          label="Collections"
          description="Leave empty to apply project-wide."
          data={['pages', 'blog', 'products', 'press-releases']}
          defaultValue={['pages', 'blog', 'products', 'press-releases']}
          clearable
          size="xs"
        />
        <MultiSelect
          label="Locales"
          data={LOCALES}
          defaultValue={LOCALES}
          leftSection={<IconWorld />}
          clearable
        />
        <MultiSelect
          label="Reviewers"
          data={['grogu', 'din']}
          placeholder="Add reviewers"
          error="Add at least one reviewer."
          required
        />
        <MultiSelect
          label="Disabled"
          data={TAGS}
          defaultValue={['cta', 'nav']}
          disabled
        />
      </div>
    )),
    'Open, with groups': inStory(() => (
      <div className="min-h-96 max-w-sm">
        <MultiSelect
          label="Tags"
          data={TAGS}
          defaultValue={['pricing']}
          leftSection={<IconTag />}
          clearable
          defaultOpen
        />
      </div>
    )),
    'Selected options listed': inStory(() => (
      <div className="min-h-96 max-w-sm">
        <MultiSelect
          label="Locales"
          data={LOCALES}
          defaultValue={['en', 'fr']}
          hideSelected={false}
          maxDropdownHeight={200}
          defaultOpen
          size="xs"
        />
      </div>
    )),
    'Custom chips and options': inStory(() => (
      <div className="min-h-96 max-w-sm">
        <MultiSelect
          label="CC"
          data={USERS}
          defaultValue={['grogu@example.com']}
          placeholder="Search or enter an email"
          creatable
          defaultOpen
          size="xs"
          renderValue={(option) => (
            <span className="flex items-center gap-1">
              <Avatar size="xs" className="size-4">
                {option.label.slice(0, 1)}
              </Avatar>
              {option.label}
            </span>
          )}
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
      </div>
    )),
    'Inside a dialog': inStory(() => <MultiSelectInDialog />),
  },
});
