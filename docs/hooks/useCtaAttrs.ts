import {useModuleInfo} from '@/hooks/useModuleInfo.js';

/** Data attributes that mark an element as a CTA for click tracking. */
export interface CtaAttrs {
  /** Name of the CTA, typically its untranslated label. */
  'data-cta': string;
  /** The tracking ID of the module the CTA is rendered in. */
  'data-cta-module'?: string;
  /** The template name of the module the CTA is rendered in. */
  'data-cta-template'?: string;
}

/**
 * Returns data attributes that mark an element as a CTA. Clicks on these
 * elements are reported to Google Analytics as `cta_click` events by
 * `bundles/main.ts`.
 *
 * Usage:
 *
 * ```tsx
 * const ctaAttrs = useCtaAttrs(props.label);
 * return <a {...ctaAttrs} href={props.href}>{t(props.label)}</a>;
 * ```
 */
export function useCtaAttrs(label?: string): CtaAttrs {
  const moduleInfo = useModuleInfo();
  return {
    'data-cta': label || '',
    'data-cta-module': moduleInfo?.id || undefined,
    'data-cta-template': moduleInfo?.name || undefined,
  };
}
