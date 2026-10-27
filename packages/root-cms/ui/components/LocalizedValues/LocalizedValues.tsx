import './LocalizedValues.css';

import {ActionIcon, Popover, TextInput, Tooltip} from '@mantine/core';
import {IconPlus, IconWorld, IconX} from '@tabler/icons-preact';
import {ComponentChildren, Fragment} from 'preact';
import {useEffect, useState} from 'preact/hooks';
import * as schema from '../../../core/schema.js';
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
function getLocalizedValuesKey(deepKey: string): string {
  const parts = deepKey.split('.');
  const last = parts.pop();
  return [...parts, `@${last}`, 'localizedValues'].join('.');
}

/**
 * Props shared by the localized values components of a field. The field owns
 * the `pendingLocales` state so that a locale added from the field header's
 * button renders a row in the field body.
 */
export interface LocalizedValuesFieldProps {
  field: schema.Field;
  deepKey: string;
  /** Schema types, for testing whether one-of values are empty. */
  types: Record<string, schema.Schema>;
  /**
   * Locales added in this session that don't have a stored value yet (e.g.
   * because the default value was empty), so they still render an editor.
   */
  pendingLocales: string[];
  setPendingLocales: (update: (locales: string[]) => string[]) => void;
}

/**
 * Subscribes to a field's localized values and the doc's enabled locales.
 */
function useLocalizedValues(props: LocalizedValuesFieldProps) {
  const {controller} = useDraftDoc();
  const key = getLocalizedValuesKey(props.deepKey);
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

  const locales = getLocalizedValueLocales(localizedValues);
  const rowLocales = Array.from(
    new Set([...locales, ...props.pendingLocales])
  ).sort();
  const i18nConfig = window.__ROOT_CTX.rootConfig.i18n || {};
  const defaultLocale = i18nConfig.defaultLocale || 'en';
  // Locales that can be localized: the doc's enabled locales, excluding the
  // default locale (which uses the field's default value).
  const availableLocales = docLocales.filter(
    (locale) =>
      locale.toLowerCase() !== defaultLocale.toLowerCase() &&
      !rowLocales.some((l) => l.toLowerCase() === locale.toLowerCase())
  );

  const addLocale = (locale: string) => {
    // Start from a copy of the default value, which is usually a closer
    // starting point (e.g. the same image with a different crop) than empty.
    const defaultValue = controller.getValue(props.deepKey);
    if (!testFieldEmpty(props.field, defaultValue, props.types)) {
      controller.updateKey(`${key}.${locale}`, cloneData(defaultValue));
    }
    props.setPendingLocales((current) => [...current, locale]);
  };

  const removeLocale = (locale: string) => {
    props.setPendingLocales((current) => current.filter((l) => l !== locale));
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

  return {
    key,
    localizedValues,
    docLocales,
    rowLocales,
    availableLocales,
    addLocale,
    removeLocale,
  };
}

/**
 * Field header button that opens a locale picker to add a localized value.
 * Shows the number of locales with a localized value.
 */
export function LocalizedValuesButton(props: LocalizedValuesFieldProps) {
  const {rowLocales, availableLocales, addLocale} = useLocalizedValues(props);
  if (rowLocales.length === 0 && availableLocales.length === 0) {
    return null;
  }
  const label =
    rowLocales.length > 0
      ? `Localized for ${rowLocales.join(', ')}`
      : 'Localize for specific locales';
  return (
    <LocalePicker
      locales={availableLocales}
      onSelect={addLocale}
      renderTarget={(opened, toggle) => (
        <Tooltip label={label} withArrow disabled={opened}>
          <button
            type="button"
            className={joinClassNames(
              'LocalizedValuesButton',
              rowLocales.length > 0 && 'LocalizedValuesButton--hasValues',
              opened && 'LocalizedValuesButton--active'
            )}
            aria-label={label}
            aria-haspopup="dialog"
            aria-expanded={opened}
            onClick={(e: MouseEvent) => {
              // The header may live inside a <summary>; keep the click from
              // toggling the drawer.
              e.preventDefault();
              e.stopPropagation();
              toggle();
            }}
          >
            <IconWorld size={14} strokeWidth="1.8" />
            {rowLocales.length > 0 && (
              <span className="LocalizedValuesButton__count">
                {rowLocales.length}
              </span>
            )}
          </button>
        </Tooltip>
      )}
    />
  );
}

export interface LocalizedValuesProps extends LocalizedValuesFieldProps {
  /** The field's editor for the default value. */
  children: ComponentChildren;
  /** Renders the field's editor for a localized value's deep key. */
  renderField: (deepKey: string) => ComponentChildren;
}

/**
 * Renders a field's default value editor followed by an editor for each of
 * the field's localized values, i.e. the field's value overrides for specific
 * locales. Fields without localized values render the default editor as-is.
 */
export function LocalizedValues(props: LocalizedValuesProps) {
  const {
    key,
    localizedValues,
    docLocales,
    rowLocales,
    availableLocales,
    addLocale,
    removeLocale,
  } = useLocalizedValues(props);

  if (rowLocales.length === 0) {
    return <>{props.children}</>;
  }

  return (
    <div className="LocalizedValues">
      <div
        className="LocalizedValues__locale LocalizedValues__locale--default"
        title="Used for locales without a localized value"
      >
        All
      </div>
      <div className="LocalizedValues__field">{props.children}</div>
      <div />
      {rowLocales.map((locale) => (
        <Fragment key={locale}>
          <div className="LocalizedValues__locale">{locale}</div>
          <div className="LocalizedValues__field">
            {props.renderField(`${key}.${locale}`)}
            {!docLocales.includes(locale) && (
              <div className="LocalizedValues__warning">
                Locale is not enabled for this doc
              </div>
            )}
            {localizedValues[locale] === null && (
              <div className="LocalizedValues__warning">
                Hidden for this locale
              </div>
            )}
          </div>
          <Tooltip label={`Remove the ${locale} value`} withArrow>
            <ActionIcon
              className="LocalizedValues__remove"
              size="sm"
              aria-label={`Remove the ${locale} value`}
              onClick={() => removeLocale(locale)}
            >
              <IconX size={14} />
            </ActionIcon>
          </Tooltip>
        </Fragment>
      ))}
      {availableLocales.length > 0 && (
        <div className="LocalizedValues__add">
          <LocalePicker
            locales={availableLocales}
            onSelect={addLocale}
            renderTarget={(opened, toggle) => (
              <button
                type="button"
                className="LocalizedValues__add__button"
                aria-haspopup="dialog"
                aria-expanded={opened}
                onClick={() => toggle()}
              >
                <IconPlus size={12} strokeWidth="2.2" />
                Add locale value
              </button>
            )}
          />
        </div>
      )}
    </div>
  );
}

interface LocalePickerProps {
  locales: string[];
  onSelect: (locale: string) => void;
  renderTarget: (opened: boolean, toggle: () => void) => ComponentChildren;
}

/**
 * Popover with a searchable list of locales. Pressing enter in the search
 * input selects the first match.
 */
function LocalePicker(props: LocalePickerProps) {
  const [opened, setOpened] = useState(false);
  const [query, setQuery] = useState('');

  const close = () => {
    setOpened(false);
    setQuery('');
  };
  const select = (locale: string) => {
    close();
    props.onSelect(locale);
  };

  const q = query.trim().toLowerCase();
  const options = props.locales
    .map((locale) => ({locale, name: getLanguageName(locale)}))
    .filter(
      (option) =>
        !q ||
        option.locale.toLowerCase().includes(q) ||
        option.name.toLowerCase().includes(q)
    );

  return (
    <Popover
      opened={opened}
      onClose={close}
      position="bottom"
      placement="end"
      width={240}
      spacing={6}
      shadow="md"
      withinPortal
      zIndex={200}
      target={props.renderTarget(opened, () =>
        opened ? close() : setOpened(true)
      )}
    >
      {props.locales.length === 0 ? (
        <div className="LocalePicker__empty">
          All of the doc's locales have a localized value.
        </div>
      ) : (
        <div className="LocalePicker">
          <div className="LocalePicker__help">
            Override the value for a locale.
          </div>
          <TextInput
            size="xs"
            placeholder="Search locales"
            aria-label="Search locales"
            value={query}
            autoFocus
            onChange={(e: Event) =>
              setQuery((e.currentTarget as HTMLInputElement).value)
            }
            onKeyDown={(e: KeyboardEvent) => {
              if (e.key === 'Enter' && options.length > 0) {
                e.preventDefault();
                select(options[0].locale);
              }
            }}
          />
          <div className="LocalePicker__options">
            {options.map((option) => (
              <button
                key={option.locale}
                type="button"
                className="LocalePicker__option"
                onClick={() => select(option.locale)}
              >
                <span className="LocalePicker__option__locale">
                  {option.locale}
                </span>
                {option.name && (
                  <span className="LocalePicker__option__name">
                    {option.name}
                  </span>
                )}
              </button>
            ))}
            {options.length === 0 && (
              <div className="LocalePicker__empty">No matching locales</div>
            )}
          </div>
        </div>
      )}
    </Popover>
  );
}

/** Returns the language name of a locale, e.g. "German" for "de". */
function getLanguageName(locale: string): string {
  try {
    const langNames = new Intl.DisplayNames(['en'], {type: 'language'});
    const langName = langNames.of(locale.replace('_', '-'));
    if (langName && langName !== locale) {
      return langName;
    }
  } catch {
    // Ignore invalid locale codes.
  }
  return '';
}
