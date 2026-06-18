import {schema} from '@blinkk/root-cms';
import {conditionsField} from '@/conditions/Conditions.schema.js';

/**
 * Conditionally renders nested modules based on a set of conditions.
 *
 * This is a convenient place to exercise the `IsFeatureFlag` condition (and its
 * document-sourced flag picker): add an `If` module to a page, open its
 * Conditions, add `IsFeatureFlag`, and pick a flag defined in
 * `GlobalModules/flags`.
 */
export default schema.define({
  name: 'If',
  description: 'Conditionally render nested modules based on conditions.',
  preview: {
    title: ['If: {internalDesc}', 'If'],
  },
  fields: [
    schema.string({
      id: 'internalDesc',
      label: '[INTERNAL] Description',
      help: 'e.g. "Show hero only when the EnableNewHero flag is on".',
      variant: 'textarea',
    }),
    conditionsField({
      help: 'Nested modules render only when all of these conditions pass.',
    }),
    schema.array({
      id: 'modulesIfTrue',
      label: 'Modules (if TRUE)',
      help: 'Rendered when all conditions are satisfied.',
      of: schema.oneOf({
        types: schema.glob('/templates/*/*.schema.ts', {
          exclude: ['If', 'Section'],
        }),
      }),
      preview: ['{_type} (#{id})', '{_type}', '(empty)'],
    }),
    schema.array({
      id: 'modulesIfFalse',
      label: 'Modules (if FALSE)',
      help: 'Rendered when the conditions are NOT satisfied.',
      of: schema.oneOf({
        types: schema.glob('/templates/*/*.schema.ts', {
          exclude: ['If', 'Section'],
        }),
      }),
      preview: ['{_type} (#{id})', '{_type}', '(empty)'],
    }),
  ],
});
