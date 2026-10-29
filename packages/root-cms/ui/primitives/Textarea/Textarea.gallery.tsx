import {defineGallery} from '../../dev/gallery/types.js';
import {Textarea} from './Textarea.js';

const LONG_TEXT = Array.from(
  {length: 12},
  (_, i) => `Line ${i + 1} of a long note.`
).join('\n');

export const TextareaGallery = defineGallery({
  id: 'textarea',
  name: 'Textarea',
  group: 'Primitives',
  stories: {
    Sizes: () => (
      <div className="flex max-w-sm flex-col gap-3">
        <Textarea size="xs" aria-label="Extra small" placeholder="xs" />
        <Textarea size="sm" aria-label="Small" placeholder="sm" />
        <Textarea size="md" aria-label="Medium" placeholder="md" />
      </div>
    ),
    Autosize: () => (
      <div className="flex max-w-sm flex-col gap-4">
        <Textarea
          label="Alt text"
          description="Grows from one row as you type."
          autosize
          minRows={1}
          defaultValue="A sunset over the bay"
        />
        <Textarea
          label="Notes"
          description="Capped at 4 rows, then scrolls."
          autosize
          minRows={2}
          maxRows={4}
          defaultValue={LONG_TEXT}
        />
        <Textarea
          label="Fixed height"
          minRows={4}
          placeholder="Resizable by hand."
        />
      </div>
    ),
    States: () => (
      <div className="flex max-w-sm flex-col gap-4">
        <Textarea
          label="Headers"
          required
          defaultValue="Authorization Bearer"
          error="Format as `HeaderName: Value`, one per line."
        />
        <Textarea label="Disabled" defaultValue="Can't edit" disabled />
        <Textarea label="Read-only" defaultValue="Read me" readOnly />
      </div>
    ),
  },
});
