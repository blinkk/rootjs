import {defineGallery} from '../../dev/gallery/types.js';
import {Spinner} from './Spinner.js';

export const SpinnerGallery = defineGallery({
  id: 'spinner',
  name: 'Spinner',
  group: 'Primitives',
  stories: {
    Sizes: () => (
      <div className="flex items-center gap-4 text-muted">
        <Spinner size="sm" />
        <Spinner size="md" />
        <Spinner size="lg" />
      </div>
    ),
    'Inherits the text color': () => (
      <div className="flex items-center gap-4">
        <span className="text-link">
          <Spinner />
        </span>
        <span className="text-danger">
          <Spinner />
        </span>
        <span className="flex items-center gap-2 text-sm text-muted">
          <Spinner size="sm" label={null} /> Loading documents…
        </span>
      </div>
    ),
  },
});
