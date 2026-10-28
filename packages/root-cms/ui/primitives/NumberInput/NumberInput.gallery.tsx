import {useState} from 'preact/hooks';
import {defineGallery} from '../../dev/gallery/types.js';
import {NumberInput} from './NumberInput.js';

function Interval() {
  const [value, setValue] = useState<number | undefined>(5);
  return (
    <NumberInput
      label="Interval"
      description="Minutes between syncs."
      min={1}
      value={value}
      onValueChange={setValue}
    />
  );
}

export const NumberInputGallery = defineGallery({
  id: 'number-input',
  name: 'NumberInput',
  group: 'Primitives',
  stories: {
    Basic: () => (
      <div className="flex max-w-sm flex-col gap-4">
        <Interval />
        <div className="flex gap-2">
          <NumberInput
            size="xs"
            aria-label="Aspect ratio width"
            placeholder="Width"
            min={1}
            value={16}
          />
          <NumberInput
            size="xs"
            aria-label="Aspect ratio height"
            placeholder="Height"
            min={1}
            value={9}
          />
        </div>
        <NumberInput
          aria-label="Without controls"
          hideControls
          value={42}
          size="md"
        />
      </div>
    ),
    States: () => (
      <div className="flex max-w-sm flex-col gap-4">
        <NumberInput label="Count" value={0} error="Must be at least 1." />
        <NumberInput label="Disabled" value={3} disabled />
        <NumberInput label="Read-only" value={3} readOnly />
      </div>
    ),
  },
});
