import {TokensGallery} from './TokensGallery.js';
import type {GalleryEntry} from './types.js';

/**
 * Every gallery entry, in sidebar order within each group. Each primitive
 * defines its entry in a colocated `<Name>.gallery.tsx` and is added here.
 */
export const GALLERY_ENTRIES: GalleryEntry[] = [TokensGallery];
