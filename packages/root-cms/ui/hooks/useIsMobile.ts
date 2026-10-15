import {useMediaQuery} from '@mantine/hooks';

/**
 * Media query for viewports that use the mobile layout. Keep in sync with the
 * `@media (max-width: 768px)` rules in the CSS.
 */
export const MOBILE_MEDIA_QUERY = '(max-width: 768px)';

/** Returns whether the viewport is narrow enough to use the mobile layout. */
export function useIsMobile(): boolean {
  return useMediaQuery(MOBILE_MEDIA_QUERY);
}
