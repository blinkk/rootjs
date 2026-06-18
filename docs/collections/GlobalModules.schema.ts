import {schema} from '@blinkk/root-cms';
import {conditionsField} from '@/conditions/Conditions.schema.js';

/**
 * Global config docs (e.g. feature flags) that aren't tied to a single page.
 *
 * Create a doc with the slug `flags` (`GlobalModules/flags`) to define the
 * site's feature flags. The `IsFeatureFlag` condition sources its pick-list of
 * options from the `flags` field of that doc — see
 * `/conditions/IsFeatureFlag/IsFeatureFlag.schema.ts`.
 */
export default schema.collection({
  name: 'GlobalModules',
  description: 'Global config docs (feature flags, etc.). Preview only.',
  group: 'Global',
  url: '/global-modules/[...slug]',
  preview: {
    title: ['{internalDesc}', 'Global Modules'],
  },
  fields: [
    schema.string({
      id: 'internalDesc',
      label: '[INTERNAL] Description',
      help: 'Internal description for this doc (not shown publicly).',
      variant: 'textarea',
    }),
    schema.array({
      id: 'flags',
      label: 'Flags',
      help: 'Feature flags for the site. A flag is enabled when all of its conditions are met.',
      preview: ['{name}: {description}', '{name}'],
      of: schema.object({
        fields: [
          schema.string({
            id: 'name',
            label: 'Name',
            help: 'Unique flag id, e.g. EnableFooBar.',
          }),
          schema.string({
            id: 'description',
            label: 'Description',
            variant: 'textarea',
          }),
          conditionsField({
            help: 'The flag is enabled when all of these conditions pass.',
          }),
        ],
      }),
    }),
  ],
});
