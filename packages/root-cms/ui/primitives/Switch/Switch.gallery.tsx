import {defineGallery} from '../../dev/gallery/types.js';
import {Switch} from './Switch.js';

export const SwitchGallery = defineGallery({
  id: 'switch',
  name: 'Switch',
  group: 'Primitives',
  stories: {
    States: () => (
      <div className="flex flex-col gap-3">
        <Switch label="Off" />
        <Switch label="On" defaultChecked />
        <Switch label="Disabled" disabled />
        <Switch label="Disabled, on" disabled defaultChecked />
      </div>
    ),
    Sizes: () => (
      <div className="flex flex-col gap-3">
        <Switch size="sm" label="Small" defaultChecked />
        <Switch size="md" label="Medium" defaultChecked />
      </div>
    ),
    'Label position and help text': () => (
      <div className="flex max-w-sm flex-col gap-4">
        <Switch label="Show archived:" labelPosition="left" />
        <Switch
          label="Monospace font"
          description="Shows the task description in a monospace font."
          defaultChecked
        />
      </div>
    ),
  },
});
