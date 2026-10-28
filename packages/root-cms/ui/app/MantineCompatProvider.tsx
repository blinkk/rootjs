import {MantineProvider} from '@mantine/core';
import type {ComponentChildren} from 'preact';
import {useEffect, useMemo} from 'preact/hooks';
import {useOverlayRoot} from '../primitives/Dialog/dialogStack.js';

/**
 * `MantineProvider` for the Mantine components that haven't been migrated
 * yet. Modals are native `<dialog>`s, which make the rest of the page inert
 * and sit above every z-index, so Mantine's portals (selects, menus,
 * popovers, tooltips, nested Mantine modals) render into the topmost open
 * dialog instead of into `document.body`. Removed with Mantine in Phase 5.
 */
export function MantineCompatProvider(props: {children: ComponentChildren}) {
  const overlayRoot = useOverlayRoot();
  const target = overlayRoot === document.body ? undefined : overlayRoot;
  const defaultProps = useMemo(() => ({Portal: {target}}), [target]);

  useEffect(() => {
    // Escape inside a Mantine modal or an open Mantine dropdown that sits in
    // a dialog closes only that, not the dialog too.
    function onKeyDown(e: KeyboardEvent) {
      const el = e.target instanceof Element ? e.target : null;
      if (
        e.key === 'Escape' &&
        el?.closest('dialog[open]') &&
        (el.closest('.mantine-Modal-root') ||
          el.getAttribute('data-mantine-stop-propagation') === 'true')
      ) {
        e.preventDefault();
      }
    }
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, []);

  return (
    <MantineProvider
      theme={{
        fontFamily: 'Inter, sans-serif',
        fontSizes: {xs: 12, sm: 14, md: 16, lg: 18, xl: 20},
      }}
      defaultProps={defaultProps}
    >
      {props.children}
    </MantineProvider>
  );
}
