import './LocalizedValues.css';

import {IconPlus, IconWorld, IconX} from '@tabler/icons-preact';
import {ComponentChildren, Fragment, VNode} from 'preact';
import {useEffect, useState} from 'preact/hooks';
import * as schema from '../../../../../core/schema.js';
import {
  getLocalizedValueLocales,
  testFieldLocalizable,
} from '../../../../../shared/localized-values.js';
import {IconButton} from '../../../../primitives/IconButton/IconButton.js';
import {Popover} from '../../../../primitives/Popover/Popover.js';
import {TextInput} from '../../../../primitives/TextInput/TextInput.js';
import {Tooltip} from '../../../../primitives/Tooltip/Tooltip.js';
import {joinClassNames} from '../../../../utils/classes.js';
import {cloneData} from '../../../../utils/objects.js';
import {testFieldEmpty} from '../../../documents/test-field-empty.js';
import {useDraftDoc} from '../../../documents/useDraftDoc.js';

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
      renderTarget={(opened) => (
        <Tooltip label={label} disabled={opened}>
          <button
            type="button"
            className={joinClassNames(
              'LocalizedValuesButton',
              rowLocales.length > 0 && 'LocalizedValuesButton--hasValues',
              'm-0 inline-flex h-4.5 min-w-4.5 cursor-pointer appearance-none items-center justify-center gap-0.5 rounded-sm border-0 bg-transparent px-0.5',
              'hover:bg-surface-hover hover:text-fg aria-expanded:bg-surface-hover aria-expanded:text-fg',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
              'text-muted'
            )}
            aria-label={label}
            onClick={(e: MouseEvent) => {
              // The header may live inside a <summary>; keep the click from
              // toggling the drawer.
              e.preventDefault();
              e.stopPropagation();
            }}
          >
            <IconWorld size={14} strokeWidth="1.8" />
            {rowLocales.length > 0 && (
              <span className="LocalizedValuesButton__count text-2xs font-semibold leading-none">
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

/** Classes shared by the locale chips in the first column. */
const LOCALE_CLASSES =
  'flex h-control-sm min-w-14 items-center justify-center rounded-sm px-2 text-sm';

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
    <div className="LocalizedValues grid items-start gap-1.5">
      <div
        className={joinClassNames(
          'LocalizedValues__locale LocalizedValues__locale--default',
          LOCALE_CLASSES,
          'border border-dashed border-border font-sans font-medium text-muted'
        )}
        title="Used for locales without a localized value"
      >
        All
      </div>
      <div className="LocalizedValues__field min-w-0">{props.children}</div>
      <div />
      {rowLocales.map((locale) => (
        <Fragment key={locale}>
          <div
            className={joinClassNames(
              'LocalizedValues__locale',
              LOCALE_CLASSES,
              'bg-chip font-mono font-semibold text-fg'
            )}
          >
            {locale}
          </div>
          <div className="LocalizedValues__field min-w-0">
            {props.renderField(`${key}.${locale}`)}
            {!docLocales.includes(locale) && (
              <div className="LocalizedValues__warning mt-1 text-sm text-warning">
                Locale is not enabled for this doc
              </div>
            )}
            {localizedValues[locale] === null && (
              <div className="LocalizedValues__warning mt-1 text-sm text-warning">
                Hidden for this locale
              </div>
            )}
          </div>
          <IconButton
            className="LocalizedValues__remove mt-0.5"
            size="xs"
            label={`Remove the ${locale} value`}
            onClick={() => removeLocale(locale)}
          >
            <IconX />
          </IconButton>
        </Fragment>
      ))}
      {availableLocales.length > 0 && (
        <div className="LocalizedValues__add col-start-2">
          <LocalePicker
            locales={availableLocales}
            onSelect={addLocale}
            renderTarget={() => (
              <button
                type="button"
                className="LocalizedValues__addButton m-0 inline-flex cursor-pointer appearance-none items-center gap-1 rounded-sm border-0 bg-transparent p-0 font-sans text-sm font-medium text-link underline-offset-3 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
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
  /**
   * Renders the trigger button. The picker adds the click handler and the
   * `aria-expanded` state to it.
   */
  renderTarget: (opened: boolean) => VNode<any>;
}

/**
 * Popover with a searchable list of locales. Pressing enter in the search
 * input selects the first match.
 */
function LocalePicker(props: LocalePickerProps) {
  const [opened, setOpened] = useState(false);
  const [query, setQuery] = useState('');

  const setOpen = (open: boolean) => {
    setOpened(open);
    if (!open) {
      setQuery('');
    }
  };
  const select = (locale: string) => {
    setOpen(false);
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
      open={opened}
      onOpenChange={setOpen}
      placement="bottom-end"
      width={240}
      className="LocalePicker__dropdown p-2"
      trigger={props.renderTarget(opened)}
    >
      {props.locales.length === 0 ? (
        <div className="LocalePicker__empty px-2 py-1.5 text-sm">
          All of the doc's locales have a localized value.
        </div>
      ) : (
        <div className="LocalePicker flex flex-col gap-1.5">
          <div className="LocalePicker__help px-0.5 pt-0.5 text-sm">
            Override the value for a locale.
          </div>
          <TextInput
            placeholder="Search locales"
            aria-label="Search locales"
            value={query}
            onInput={(e) => setQuery(e.currentTarget.value)}
            onKeyDown={(e: KeyboardEvent) => {
              if (e.key === 'Enter' && options.length > 0) {
                e.preventDefault();
                select(options[0].locale);
              }
            }}
          />
          <div className="LocalePicker__options flex max-h-60 flex-col overflow-y-auto">
            {options.map((option) => (
              <button
                key={option.locale}
                type="button"
                className="LocalePicker__option m-0 flex cursor-pointer appearance-none items-baseline gap-2 rounded-sm border-0 bg-transparent px-2 py-1.5 text-left font-sans text-sm text-fg hover:bg-surface-hover focus-visible:bg-surface-hover focus-visible:outline-none"
                onClick={() => select(option.locale)}
              >
                <span className="LocalePicker__optionLocale font-mono font-semibold">
                  {option.locale}
                </span>
                {option.name && (
                  <span className="LocalePicker__optionName">
                    {option.name}
                  </span>
                )}
              </button>
            ))}
            {options.length === 0 && (
              <div className="LocalePicker__empty px-2 py-1.5 text-sm">
                No matching locales
              </div>
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
