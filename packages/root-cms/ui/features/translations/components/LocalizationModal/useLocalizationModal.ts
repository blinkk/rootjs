import {useModals} from '../../../../primitives/modals/ModalsProvider.js';
import type {LocalizationModalProps} from './LocalizationModal.js';

export const LOCALIZATION_MODAL_ID = 'LocalizationModal';

/** Hook for opening the localization modal. */
export function useLocalizationModal() {
  const modals = useModals();
  return {
    open: (innerProps: LocalizationModalProps) => {
      // Add modal param to URL.
      const params = new URLSearchParams(window.location.search);
      params.set('modal', 'localization');
      window.history.replaceState(
        null,
        '',
        `${window.location.pathname}?${params}`
      );

      modals.openContextModal(LOCALIZATION_MODAL_ID, {
        innerProps: innerProps,
        size: 'clamp(80%, 1024px, 1280px)',
        // The panes run to the bottom of the body, and from `md` up each
        // scrolls on its own.
        classNames: {body: 'pb-0'},
        onClose: () => {
          // Flush any pending draft changes (e.g. locale toggles) without
          // triggering the iframe reload that normally follows a flush.
          innerProps.draft?.flush({quiet: true});
          // Remove modal param from URL.
          const params = new URLSearchParams(window.location.search);
          params.delete('modal');
          const newUrl = params.toString()
            ? `${window.location.pathname}?${params}`
            : window.location.pathname;
          window.history.replaceState(null, '', newUrl);
        },
      });
    },
  };
}
