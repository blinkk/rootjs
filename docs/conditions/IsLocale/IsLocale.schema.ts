import {schema} from '@blinkk/root-cms';

/**
 * Example non-flag condition: passes when the current request locale is one of
 * the selected locales. Useful for gating a feature flag to specific locales.
 */
export default schema.define({
  name: 'IsLocale',
  preview: {
    title: ['IsLocale: {locales}', 'IsLocale'],
  },
  fields: [
    schema.string({
      id: 'internalDesc',
      label: '[INTERNAL] Description',
      variant: 'textarea',
    }),
    schema.multiselect({
      id: 'locales',
      label: 'Locale(s)',
      help: 'Locales to match, e.g. "en", "de". Leave empty to match all.',
      creatable: true,
    }),
  ],
});
