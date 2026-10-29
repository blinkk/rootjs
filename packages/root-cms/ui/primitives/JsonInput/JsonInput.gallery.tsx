import {defineGallery} from '../../dev/gallery/types.js';
import {JsonInput} from './JsonInput.js';

const DATA = JSON.stringify(
  {title: 'Hello', tags: ['news', 'launch'], meta: {draft: true}},
  null,
  2
);

export const JsonInputGallery = defineGallery({
  id: 'json-input',
  name: 'JsonInput',
  group: 'Primitives',
  stories: {
    Basic: () => (
      <div className="flex max-w-md flex-col gap-4">
        <JsonInput
          label="Data"
          description="Formatted when you leave the field."
          formatOnBlur
          autosize
          minRows={4}
          maxRows={12}
          defaultValue={DATA}
        />
        <JsonInput
          aria-label="Read-only data"
          readOnly
          value={DATA}
          minRows={6}
        />
      </div>
    ),
    States: () => (
      <div className="flex max-w-md flex-col gap-4">
        <JsonInput
          label="Invalid"
          defaultValue='{"title": "Hello",}'
          error="Invalid JSON."
          minRows={2}
        />
        <JsonInput label="Disabled" value={DATA} disabled minRows={2} />
      </div>
    ),
  },
});
