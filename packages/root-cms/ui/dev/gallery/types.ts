import type {ComponentChildren} from 'preact';

/**
 * A set of examples shown in the UI gallery (`/cms/_ui`, dev server only) and
 * rendered by the component's visual test.
 *
 * ```tsx
 * // ui/primitives/Button/Button.gallery.tsx
 * export const ButtonGallery = defineGallery({
 *   id: 'button',
 *   name: 'Button',
 *   group: 'Primitives',
 *   stories: {
 *     Variants: () => <Button variant="primary">Save</Button>,
 *   },
 * });
 * ```
 */
export interface GalleryEntry {
  /** URL-safe id, e.g. `button`. */
  id: string;
  /** Display name, e.g. `Button`. */
  name: string;
  /** Sidebar group. */
  group: 'Foundations' | 'Primitives' | 'Components';
  /**
   * Named examples, in display order. Each should cover a meaningful variant
   * or state, and lay itself out sensibly from 375px wide up.
   */
  stories: Record<string, () => ComponentChildren>;
}

/** Declares a gallery entry; see `GalleryEntry`. */
export function defineGallery(entry: GalleryEntry): GalleryEntry {
  return entry;
}
