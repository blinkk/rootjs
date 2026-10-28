import {defineGallery} from '../../dev/gallery/types.js';
import {Skeleton} from './Skeleton.js';

export const SkeletonGallery = defineGallery({
  id: 'skeleton',
  name: 'Skeleton',
  group: 'Primitives',
  stories: {
    Shapes: () => (
      <div className="flex max-w-md flex-col gap-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton variant="text" lines={3} />
        <div className="flex items-center gap-2">
          <Skeleton variant="circle" />
          <Skeleton className="w-32" />
        </div>
      </div>
    ),
    'A loading list': () => (
      <div
        className="flex max-w-md flex-col gap-3"
        aria-busy="true"
        aria-label="Loading documents"
        role="status"
      >
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="flex items-center gap-3 rounded-lg border border-solid border-border bg-surface p-3"
          >
            <Skeleton className="size-10 shrink-0" />
            <Skeleton variant="text" lines={2} />
          </div>
        ))}
      </div>
    ),
  },
});
