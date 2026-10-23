import './LocalizedValuesPanel.css';

import {ActionIcon, Select, Tooltip} from '@mantine/core';
import {IconTrash, IconWorld, IconX} from '@tabler/icons-preact';
import {ComponentChildren} from 'preact';
import {useEffect, useMemo, useState} from 'preact/hooks';
import * as schema from '../../../core/schema.js';
import {resolveLocaleFallbacks} from '../../../shared/locale-fallbacks.js';
import {
  getLocalizedValueLocales,
  testFieldLocalizable,
} from '../../../shared/localized-values.js';
import {useDraftDoc} from '../../hooks/useDraftDoc.js';
import {joinClassNames} from '../../utils/classes.js';
import {cloneData} from '../../utils/objects.js';
import {testFieldEmpty} from '../../utils/test-field-empty.js';

/**
 * Returns whether the localized values UI is enabled for a field. Localized
 * values require a site with multiple locales and a field with an id. They're
 * not supported for array items (which have no `@<id>` metadata key), fields
 * within a localized value, or fields outside of the doc's `fields` (e.g.
 * rich text blocks, which are resolved as-is).
 */
export function testLocalizedValuesEnabled(
  field: schema.Field,
  deepKey: string,
  isArrayChild?: boolean
): boolean {
  const i18nLocales = window.__ROOT_CTX.rootConfig.i18n?.locales || ['en'];
  if (
    i18nLocales.length <= 1 ||
    isArrayChild ||
    !deepKey.startsWith('fields.')
  ) {
    return false;
  }
  if (deepKey.split('.').some((part) => part.startsWith('@'))) {
    return false;
  }
  return testFieldLocalizable(field);
}

/** Returns the draft doc key of a field's localized values map. */
export function getLocalizedValuesKey(deepKey: string): string {
  const parts = deepKey.split('.');
  const last = parts.pop();
  return [...parts, `@${last}`, 'localizedValues'].join('.');
}

/**
 * Subscribes to a field's localized values and the doc's enabled locales.
 */
function useLocalizedValues(deepKey: string) {
  const {controller} = useDraftDoc();
  const key = getLocalizedValuesKey(deepKey);
  const [localizedValues, setLocalizedValues] = useState<Record<string, any>>(
    () => ({...controller.getValue(key)})
  );
  const [docLocales, setDocLocales] = useState<string[]>(
    () => controller.getValue('sys.locales') || ['en']
  );

  useEffect(() => {
    // The store mutates values in place, so copy the map to re-render.
    return controller.subscribeSubtree(key, (value: any) => {
      setLocalizedValues({...value});
    });
  }, [controller, key]);

  useEffect(() => {
    return controller.subscribe('sys.locales', (value: string[]) => {
      setDocLocales(value || ['en']);
    });
  }, [controller]);

  const i18nConfig = window.__ROOT_CTX.rootConfig.i18n || {};
  const defaultLocale = i18nConfig.defaultLocale || 'en';
  const locales = getLocalizedValueLocales(localizedValues);
  // Locales that can be localized: the doc's enabled locales, excluding the
  // default locale (which uses the field's default value).
  const availableLocales = docLocales.filter(
    (locale) =>
      locale.toLowerCase() !== defaultLocale.toLowerCase() &&
      !locales.some((l) => l.toLowerCase() === locale.toLowerCase())
  );
  return {
    controller,
    key,
    localizedValues,
    locales,
    docLocales,
    availableLocales,
  };
}

export interface LocalizedValuesButtonProps {
  deepKey: string;
  opened: boolean;
  onToggle: () => void;
}

/**
 * Field header button that toggles the field's localized values panel. Shows
 * the number of locales with a localized value.
 */
export function LocalizedValuesButton(props: LocalizedValuesButtonProps) {
  const {locales, availableLocales} = useLocalizedValues(props.deepKey);
  if (locales.length === 0 && availableLocales.length === 0) {
    return null;
  }
  const label =
    locales.length > 0
      ? `Localized for ${locales.join(', ')}`
      : 'Localize for specific locales';
  return (
    <Tooltip label={label} withArrow>
      <button
        type="button"
        className={joinClassNames(
          'LocalizedValuesButton',
          locales.length > 0 && 'LocalizedValuesButton--hasValues',
          props.opened && 'LocalizedValuesButton--active'
        )}
        aria-label={label}
        aria-expanded={props.opened || locales.length > 0}
        onClick={(e: MouseEvent) => {
          // The header may live inside a <summary>; keep the click from
          // toggling the drawer.
          e.preventDefault();
          e.stopPropagation();
          props.onToggle();
        }}
      >
        <IconWorld size={14} strokeWidth="1.8" />
        {locales.length > 0 && (
          <span className="LocalizedValuesButton__count">{locales.length}</span>
        )}
      </button>
    </Tooltip>
  );
}

export interface LocalizedValuesPanelProps {
  field: schema.Field;
  deepKey: string;
  /** Whether the panel was opened from the field header. */
  opened: boolean;
  onClose: () => void;
  /** Schema types, for testing whether one-of values are empty. */
  types: Record<string, schema.Schema>;
  /** Renders the field's editor for a localized value's deep key. */
  renderField: (deepKey: string) => ComponentChildren;
}

/**
 * Lists a field's localized values, i.e. the field's value overrides for
 * specific locales, with an editor for each. The panel is always shown when
 * the field has localized values, so that they're visible to editors (and
 * deeplinks to them resolve), and otherwise only when opened.
 */
export function LocalizedValuesPanel(props: LocalizedValuesPanelProps) {
  const {
    controller,
    key,
    localizedValues,
    locales,
    docLocales,
    availableLocales,
  } = useLocalizedValues(props.deepKey);
  // Locales added in this session that don't have a stored value yet (e.g.
  // because the default value was empty), so they still render an editor.
  const [pendingLocales, setPendingLocales] = useState<string[]>([]);

  const rowLocales = useMemo(() => {
    const rows = [...locales];
    for (const locale of pendingLocales) {
      if (!rows.includes(locale)) {
        rows.push(locale);
      }
    }
    return rows;
  }, [locales, pendingLocales]);

  if (rowLocales.length === 0 && !props.opened) {
    return null;
  }

  const addLocale = (locale: string | null) => {
    if (!locale) {
      return;
    }
    // Start from a copy of the default value, which is usually a closer
    // starting point (e.g. the same image with a different crop) than empty.
    const defaultValue = controller.getValue(props.deepKey);
    if (!testFieldEmpty(props.field, defaultValue, props.types)) {
      controller.updateKey(`${key}.${locale}`, cloneData(defaultValue));
    }
    setPendingLocales((current) => [...current, locale]);
  };

  const removeLocale = (locale: string) => {
    setPendingLocales((current) => current.filter((l) => l !== locale));
    const remaining = locales.filter((l) => l !== locale);
    if (remaining.length === 0) {
      // Remove the whole map (including any `@<locale>` metadata).
      controller.removeKey(key);
    } else {
      controller.updateKeys({
        [`${key}.${locale}`]: undefined,
        [`${key}.@${locale}`]: undefined,
      });
    }
  };

  const inherited = getInheritedLocales(docLocales, rowLocales);

  return (
    <div className="LocalizedValuesPanel">
      <div className="LocalizedValuesPanel__header">
        <div className="LocalizedValuesPanel__header__title">
          <IconWorld size={14} strokeWidth="1.8" />
          Localized values
        </div>
        <div className="LocalizedValuesPanel__header__actions">
          {availableLocales.length > 0 && (
            <Select
              className="LocalizedValuesPanel__addLocale"
              size="xs"
              placeholder="Add locale"
              searchable
              value={null}
              data={availableLocales.map((locale) => ({
                value: locale,
                label: getLocaleLabel(locale),
              }))}
              onChange={addLocale}
            />
          )}
          {props.opened && (
            <Tooltip label="Close" withArrow>
              <ActionIcon size="xs" onClick={() => props.onClose()}>
                <IconX size={14} />
              </ActionIcon>
            </Tooltip>
          )}
        </div>
      </div>
      {rowLocales.length === 0 ? (
        <div className="LocalizedValuesPanel__empty">
          Override this field's value for specific locales. Locales without a
          localized value use the default value above.
        </div>
      ) : (
        <div className="LocalizedValuesPanel__rows">
          {rowLocales.map((locale) => (
            <div className="LocalizedValuesPanel__row" key={locale}>
              <div className="LocalizedValuesPanel__row__header">
                <div className="LocalizedValuesPanel__row__locale">
                  {locale}
                  {!docLocales.includes(locale) && (
                    <span className="LocalizedValuesPanel__row__warning">
                      Locale is not enabled for this doc
                    </span>
                  )}
                  {localizedValues[locale] === null && (
                    <span className="LocalizedValuesPanel__row__warning">
                      Hidden for this locale
                    </span>
                  )}
                </div>
                <Tooltip label={`Remove the ${locale} value`} withArrow>
                  <ActionIcon size="xs" onClick={() => removeLocale(locale)}>
                    <IconTrash size={14} />
                  </ActionIcon>
                </Tooltip>
              </div>
              <div className="LocalizedValuesPanel__row__field">
                {props.renderField(`${key}.${locale}`)}
              </div>
            </div>
          ))}
        </div>
      )}
      {inherited.length > 0 && (
        <div className="LocalizedValuesPanel__inherited">
          {inherited
            .map(({locale, from}) => `${locale} uses ${from}`)
            .join(', ')}
          .
        </div>
      )}
    </div>
  );
}

/**
 * Returns the doc locales without a localized value that inherit one through
 * their fallback chain (`i18n.fallbacks`), e.g. `en-CA` from `en-GB`.
 */
function getInheritedLocales(docLocales: string[], localized: string[]) {
  const i18nConfig = window.__ROOT_CTX.rootConfig.i18n || {};
  const localizedByLower = new Map(localized.map((l) => [l.toLowerCase(), l]));
  const results: Array<{locale: string; from: string}> = [];
  for (const locale of docLocales) {
    if (localizedByLower.has(locale.toLowerCase())) {
      continue;
    }
    const chain = resolveLocaleFallbacks(i18nConfig, locale);
    for (const fallback of chain.slice(1)) {
      const from = localizedByLower.get(fallback.toLowerCase());
      if (from) {
        results.push({locale, from});
        break;
      }
    }
  }
  return results;
}

function getLocaleLabel(locale: string) {
  try {
    const langNames = new Intl.DisplayNames(['en'], {type: 'language'});
    const langName = langNames.of(locale.replace('_', '-'));
    if (langName && langName !== locale) {
      return `${langName} (${locale})`;
    }
  } catch {
    // Ignore invalid locale codes.
  }
  return locale;
}
