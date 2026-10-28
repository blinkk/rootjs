import {defineGallery} from '../../dev/gallery/types.js';
import {ColorInput} from './ColorInput.js';

const SWATCHES = [
  '#25262b',
  '#868e96',
  '#fa5252',
  '#e64980',
  '#be4bdb',
  '#7950f2',
  '#4c6ef5',
  '#228be6',
  '#15aabf',
  '#12b886',
  '#40c057',
  '#82c91e',
];

export const ColorInputGallery = defineGallery({
  id: 'color-input',
  name: 'ColorInput',
  group: 'Primitives',
  stories: {
    Basic: () => (
      <div className="flex max-w-sm flex-col gap-4">
        <ColorInput
          name="backgroundColor"
          label="Background color"
          defaultValue="#868e96"
          swatches={SWATCHES}
        />
        <ColorInput size="xs" aria-label="Text color" defaultValue="#1f1f1f" />
        <ColorInput
          size="md"
          aria-label="Accent color"
          defaultValue="#d9a6c8"
        />
      </div>
    ),
    States: () => (
      <div className="flex max-w-sm flex-col gap-4">
        <ColorInput
          label="Invalid"
          defaultValue="#12"
          error="Use a hex color like #ff8800."
        />
        <ColorInput label="Disabled" defaultValue="#4c6ef5" disabled />
      </div>
    ),
  },
});
