import {schema} from '@blinkk/root-cms';

/**
 * Keys of the curated icons rendered by `components/FeatureIcon`. Keys are
 * stored in content, so avoid renaming them.
 */
export const FEATURE_ICON_KEYS = [
  'ai',
  'assets',
  'bolt',
  'brain',
  'checks',
  'cloud',
  'code',
  'comments',
  'components',
  'data',
  'history',
  'i18n',
  'key',
  'lock',
  'palette',
  'plug',
  'preview',
  'proposal',
  'release',
  'rocket',
  'route',
  'schema',
  'search',
  'server',
  'sidebar',
  'sitemap',
  'terminal',
  'translate',
  'users',
] as const;

export type FeatureIconKey = (typeof FEATURE_ICON_KEYS)[number];

/** A select field for picking one of the curated feature icons. */
export function featureIconField(
  options?: Partial<Omit<schema.SelectField, 'type'>>
): schema.SelectField {
  return schema.select({
    id: 'icon',
    label: 'Icon',
    help: 'Optional. Icon shown above the title.',
    options: FEATURE_ICON_KEYS.map((value) => ({value})),
    ...options,
  });
}
