import {defineGallery} from '../../dev/gallery/types.js';
import {Kbd} from './Kbd.js';

export const KbdGallery = defineGallery({
  id: 'kbd',
  name: 'Kbd',
  group: 'Primitives',
  stories: {
    Keys: () => (
      <div className="flex flex-wrap items-center gap-2">
        <Kbd>⌘ K</Kbd>
        <Kbd>Ctrl K</Kbd>
        <Kbd>Esc</Kbd>
        <Kbd>↑</Kbd>
        <Kbd>↓</Kbd>
        <Kbd>Enter</Kbd>
      </div>
    ),
    'In text': () => (
      <p className="m-0 flex flex-wrap items-center gap-1 text-sm text-muted">
        Press <Kbd>⌘</Kbd> <Kbd>Enter</Kbd> to send, or <Kbd>Esc</Kbd> to
        cancel.
      </p>
    ),
  },
});
