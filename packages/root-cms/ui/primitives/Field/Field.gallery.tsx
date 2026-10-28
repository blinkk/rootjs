import {defineGallery} from '../../dev/gallery/types.js';
import {
  INPUT_BASE_CLASSES,
  INPUT_SIZE_CLASSES,
} from '../TextInput/TextInput.js';
import {Field} from './Field.js';

/** A stand-in for a custom control, styled like an input. */
function DemoControl(props: {id: string; [key: string]: unknown}) {
  return (
    <button
      {...props}
      type="button"
      className={`${INPUT_BASE_CLASSES} ${INPUT_SIZE_CLASSES.sm} cursor-pointer text-left`}
    >
      Choose docs…
    </button>
  );
}

export const FieldGallery = defineGallery({
  id: 'field',
  name: 'Field',
  group: 'Primitives',
  stories: {
    'Label and help text': () => (
      <div className="flex max-w-sm flex-col gap-4">
        <Field
          label="Docs"
          description="Select one or more docs to add to the release. You can edit this list later."
        >
          {(control) => <DemoControl {...control} />}
        </Field>
        <Field label="Lock until" description="Optional." size="md">
          {(control) => <DemoControl {...control} />}
        </Field>
      </div>
    ),
    'Required and error': () => (
      <div className="flex max-w-sm flex-col gap-4">
        <Field label="Reason" required>
          {(control) => <DemoControl {...control} />}
        </Field>
        <Field
          label="Data sources"
          description="Data sources to publish with the release."
          error="Pick at least one data source."
        >
          {(control) => <DemoControl {...control} />}
        </Field>
      </div>
    ),
  },
});
