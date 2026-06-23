import {schema} from '@blinkk/root-cms';

export interface ConditionsFieldOptions extends Partial<
  Omit<schema.ArrayField, 'type' | 'of'>
> {
  /**
   * Condition schema names to exclude from the dropdown, e.g.
   * `{exclude: ['IsFeatureFlag']}`.
   */
  exclude?: string[];
}

/**
 * Reusable "Conditions" array field. Each item is one of the condition schemas
 * defined in `/conditions/<Name>/<Name>.schema.ts`. All conditions must pass
 * for the parent to be considered "enabled" (see
 * `/conditions/conditions.ts#testAllConditions`).
 */
export function conditionsField(options: ConditionsFieldOptions = {}) {
  const {exclude, ...arrayOptions} = options;
  return schema.array({
    id: 'conditions',
    label: 'Conditions',
    preview: [
      '{_type}: {internalDesc}',
      '{_type}: {description}',
      '{_type}: {flag}',
      '{_type}',
    ],
    ...arrayOptions,
    of: schema.oneOf({
      types: schema.glob(
        '/conditions/*/*.schema.ts',
        exclude ? {exclude} : undefined
      ),
    }),
  });
}

// This default export exists so that a `ConditionsFields` type is added to
// `root-cms.d.ts`. It is not meant to be used as a collection directly.
export default schema.define({
  name: 'Conditions',
  preview: {
    title: ['{_type}: {internalDesc}', '{_type}: {flag}', '{_type}'],
  },
  fields: [conditionsField()],
});
