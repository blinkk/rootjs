import {defineGallery} from '../../dev/gallery/types.js';
import {Divider} from './Divider.js';

export const DividerGallery = defineGallery({
  id: 'divider',
  name: 'Divider',
  group: 'Primitives',
  stories: {
    Horizontal: () => (
      <div className="flex flex-col gap-3 text-sm">
        <span>Above the rule</span>
        <Divider />
        <span>Below the rule</span>
        <Divider strong />
        <span>Below a strong rule</span>
      </div>
    ),
    'With a label': () => (
      <div className="flex max-w-sm flex-col gap-3 text-sm">
        <span>Sign in with Google</span>
        <Divider label="or" />
        <span>Sign in with email</span>
      </div>
    ),
    Vertical: () => (
      <div className="flex h-8 items-center gap-2 text-sm">
        <span>Bold</span>
        <Divider orientation="vertical" />
        <span>Italic</span>
        <Divider orientation="vertical" strong />
        <span>Link</span>
      </div>
    ),
  },
});
