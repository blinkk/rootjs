import {defineGallery} from '../../dev/gallery/types.js';
import {Checkbox} from './Checkbox.js';

export const CheckboxGallery = defineGallery({
  id: 'checkbox',
  name: 'Checkbox',
  group: 'Primitives',
  stories: {
    States: () => (
      <div className="flex flex-col gap-3">
        <Checkbox label="Unchecked" />
        <Checkbox label="Checked" defaultChecked />
        <Checkbox label="Indeterminate" indeterminate />
        <Checkbox label="Disabled" disabled />
        <Checkbox label="Disabled, checked" disabled defaultChecked />
        <div className="flex items-center gap-2">
          <Checkbox aria-label="Select row" defaultChecked />
          <span className="text-sm text-muted">No label (aria-label)</span>
        </div>
      </div>
    ),
    Sizes: () => (
      <div className="flex flex-col gap-3">
        <Checkbox size="sm" label="Small (16px)" defaultChecked />
        <Checkbox size="md" label="Medium (20px)" defaultChecked />
      </div>
    ),
    Colors: () => (
      <div className="flex flex-col gap-3">
        <Checkbox label="Primary (default)" defaultChecked />
        <Checkbox color="blue" label="Blue" defaultChecked />
        <Checkbox color="blue" label="Blue, indeterminate" indeterminate />
        <Checkbox color="blue" label="Blue, disabled" disabled defaultChecked />
        <Checkbox color="subtle" label="Subtle, unchecked" />
        <Checkbox color="subtle" label="Subtle" defaultChecked />
        <Checkbox color="subtle" label="Subtle, indeterminate" indeterminate />
      </div>
    ),
    'Help text and error': () => (
      <div className="flex max-w-sm flex-col gap-4">
        <Checkbox
          label="Keep original filenames"
          description="Uploaded files keep their original filename at the end of the file URL."
          defaultChecked
        />
        <Checkbox
          label="I've reviewed the changes"
          required
          error="Confirm before publishing."
        />
        <Checkbox label="A very long label that wraps onto a second line when the screen is narrow" />
      </div>
    ),
  },
});
