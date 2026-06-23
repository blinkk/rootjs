import {schema} from '@blinkk/root-cms';

/**
 * Condition that passes when a named feature flag is enabled.
 *
 * The `flag` field demonstrates a document-sourced select: instead of typing a
 * free-form flag name, the editor picks from the flags defined in the
 * `GlobalModules/flags` doc (or types a new one, since `creatable` is on). The
 * options come from each `flags[].name`, with `flags[].description` shown as
 * help text beneath each option.
 */
export default schema.define({
  name: 'IsFeatureFlag',
  preview: {
    title: ['IsFeatureFlag: {flag}', 'IsFeatureFlag'],
  },
  fields: [
    schema.string({
      id: 'internalDesc',
      label: '[INTERNAL] Description',
      variant: 'textarea',
    }),
    schema.select({
      id: 'flag',
      label: 'Flag',
      help: 'Pick a flag defined in GlobalModules/flags, or type a new one.',
      creatable: true,
      source: {
        doc: 'GlobalModules/flags',
        field: 'flags',
        valueKey: 'name',
        helpKey: 'description',
      },
    }),
  ],
});
