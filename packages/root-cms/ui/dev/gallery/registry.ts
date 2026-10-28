import {AccordionGallery} from '../../primitives/Accordion/Accordion.gallery.js';
import {AvatarGallery} from '../../primitives/Avatar/Avatar.gallery.js';
import {BadgeGallery} from '../../primitives/Badge/Badge.gallery.js';
import {BreadcrumbsGallery} from '../../primitives/Breadcrumbs/Breadcrumbs.gallery.js';
import {ButtonGallery} from '../../primitives/Button/Button.gallery.js';
import {DividerGallery} from '../../primitives/Divider/Divider.gallery.js';
import {IconButtonGallery} from '../../primitives/IconButton/IconButton.gallery.js';
import {KbdGallery} from '../../primitives/Kbd/Kbd.gallery.js';
import {LoadingOverlayGallery} from '../../primitives/LoadingOverlay/LoadingOverlay.gallery.js';
import {PaginationGallery} from '../../primitives/Pagination/Pagination.gallery.js';
import {SkeletonGallery} from '../../primitives/Skeleton/Skeleton.gallery.js';
import {SpinnerGallery} from '../../primitives/Spinner/Spinner.gallery.js';
import {TableGallery} from '../../primitives/Table/Table.gallery.js';
import {TabsGallery} from '../../primitives/Tabs/Tabs.gallery.js';
import {TokensGallery} from './TokensGallery.js';
import type {GalleryEntry} from './types.js';

/**
 * Every gallery entry, in sidebar order within each group. Each primitive
 * defines its entry in a colocated `<Name>.gallery.tsx` and is added here.
 */
export const GALLERY_ENTRIES: GalleryEntry[] = [
  TokensGallery,
  AccordionGallery,
  AvatarGallery,
  BadgeGallery,
  BreadcrumbsGallery,
  ButtonGallery,
  DividerGallery,
  IconButtonGallery,
  KbdGallery,
  LoadingOverlayGallery,
  PaginationGallery,
  SkeletonGallery,
  SpinnerGallery,
  TableGallery,
  TabsGallery,
];
