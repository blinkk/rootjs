import {
  IconArrowsTransferDown,
  IconExternalLink,
  IconInfoCircle,
  IconRobot,
} from '@tabler/icons-preact';
import {useEffect, useId, useState} from 'preact/hooks';
import {Heading} from '../../../../components/Heading/Heading.js';
import {
  GoogleSheetId,
  getSpreadsheetUrl,
} from '../../../../integrations/gsheets.js';
import {Button} from '../../../../primitives/Button/Button.js';
import {Checkbox} from '../../../../primitives/Checkbox/Checkbox.js';
import {IconButton} from '../../../../primitives/IconButton/IconButton.js';
import {
  type ContextModalProps,
  useModals,
} from '../../../../primitives/modals/ModalsProvider.js';
import {Spinner} from '../../../../primitives/Spinner/Spinner.js';
import {
  Tab,
  TabList,
  TabPanel,
  Tabs,
} from '../../../../primitives/Tabs/Tabs.js';
import {Textarea} from '../../../../primitives/Textarea/Textarea.js';
import {
  showNotification,
  updateNotification,
} from '../../../../primitives/Toast/toastStore.js';
import {Tooltip} from '../../../../primitives/Tooltip/Tooltip.js';
import {cn} from '../../../../utils/classes.js';
import {notifyErrors} from '../../../../utils/notifications.js';
import {withTimeout} from '../../../../utils/with-timeout.js';
import {testAiEnabled} from '../../../ai/ai.js';
import {
  CsvTranslation,
  cmsDocImportTranslations,
} from '../../../documents/doc.js';
import {DraftDocContext} from '../../../documents/useDraftDoc.js';
import {
  batchSaveTranslations,
  getTranslationByHash,
  getTranslationForLanguage,
  isLocaleExcludedFromTranslations,
  loadTranslations,
  sourceHash,
  toLocaleTranslations,
  toTranslationLanguages,
} from '../../l10n.js';
import {FieldHistory} from '../FieldHistory/FieldHistory.js';
import {usePortTranslationsModal} from '../PortTranslationsModal/PortTranslationsModal.js';

const MODAL_ID = 'EditTranslationsModal';

export interface EditTranslationsModalProps {
  [key: string]: unknown;
  /** Doc associated with the translations. */
  docId: string;
  /** The strings to show. */
  strings: string[];
  /** A linked Google Sheet associated with the doc, if any. */
  l10nSheet?: GoogleSheetId;
  /** The field for which translations are being edited. */
  field?: {id: string; deepKey: string};
  /** Draft controller for saving field metadata. */
  draft?: DraftDocContext;
}

export function useEditTranslationsModal() {
  const modals = useModals();
  return {
    open: (props: EditTranslationsModalProps) => {
      modals.openContextModal(MODAL_ID, {
        innerProps: props,
        size: '900px',
        title: 'Edit translations',
        overflow: 'inside',
        className: 'EditTranslationsModalWrap',
      });
    },
    close: () => {
      modals.closeModal(MODAL_ID);
    },
  };
}

export function EditTranslationsModal(
  modalProps: ContextModalProps<EditTranslationsModalProps>
) {
  const {innerProps: props, context, id} = modalProps;
  const strings = props.strings || [];
  const i18nConfig = window.__ROOT_CTX.rootConfig.i18n || {};
  // Edits are keyed by "translation language", which may be shared by
  // multiple root locales (per the `i18n.translationLanguages` config).
  const i18nLocales = toTranslationLanguages(i18nConfig.locales || ['en']);
  const [translationsMap, setTranslationsMap] = useState<
    Record<string, Record<string, string>>
  >({});
  const [changedKeys, setChangedKeys] = useState<string[]>([]);
  const [hasChanges, setHasChanges] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [doNotTranslate, setDoNotTranslate] = useState(false);
  const [description, setDescription] = useState('');
  const [aiGenerating, setAiGenerating] = useState(false);
  const [activeTab, setActiveTab] = useState<'translations' | 'history'>(
    'translations'
  );
  const portModal = usePortTranslationsModal();
  const descriptionId = useId();

  // Use draft from props (passed from DocEditor).
  const draft = props.draft || null;

  // Load translation metadata from the document.
  useEffect(() => {
    if (props.field?.deepKey && draft?.controller) {
      const metadataKey = getMetadataKey(props.field.deepKey);
      const metadata = draft.controller.getValue(metadataKey) || {};
      setDoNotTranslate(metadata.translate === false);
      setDescription(metadata.description || '');
    }
  }, [props.field?.deepKey, draft?.controller]);

  useEffect(() => {
    const init = async () => {
      await notifyErrors(async () => {
        const res = await withTimeout(
          loadTranslations({tags: [props.docId]}),
          undefined,
          'loading translations'
        );
        const translationsMap: Record<string, Record<string, string>> = {};
        Object.values(res).forEach((row) => {
          // Re-key rows from root locales to translation languages so edits
          // and saves apply to every root locale that shares the language.
          const langRow: Record<string, string> = {source: row.source};
          i18nLocales.forEach((lang) => {
            const value = getTranslationForLanguage(row, lang);
            if (value) {
              langRow[lang] = value;
            }
          });
          translationsMap[row.source] = langRow;
        });
        setTranslationsMap(translationsMap);
      });
      setLoading(false);
    };
    init();
  }, [props.docId]);

  async function onSave() {
    setSaving(true);
    await notifyErrors(async () => {
      const notificationId = `edit-translations-${props.docId}`;
      showNotification({
        id: notificationId,
        loading: true,
        title: 'Saving translations',
        message: `Updating for ${props.docId}...`,
        autoClose: false,
        disallowClose: true,
      });

      // Save translation metadata if field is provided.
      if (props.field?.deepKey && draft?.controller) {
        const metadataKey = getMetadataKey(props.field.deepKey);
        const metadata = draft.controller.getValue(metadataKey) || {};
        // Only store non-default values to avoid superfluous data.
        if (doNotTranslate) {
          metadata.translate = false;
        } else {
          delete metadata.translate;
        }
        if (description) {
          metadata.description = description;
        } else {
          delete metadata.description;
        }
        if (Object.keys(metadata).length > 0) {
          await draft.controller.updateKey(metadataKey, metadata);
        } else {
          await draft.controller.removeKey(metadataKey);
        }
        // Ensure the metadata is saved immediately.
        await draft.controller.flush();
      }

      // Only save translations if not marked as "do not translate".
      if (!doNotTranslate && changedKeys.length > 0) {
        const changes: CsvTranslation[] = [];
        changedKeys.forEach((changedKey) => {
          const row = translationsMap[changedKey] as CsvTranslation;
          changes.push(row);
        });
        await cmsDocImportTranslations(props.docId, changes);
      }

      updateNotification({
        id: notificationId,
        title: 'Saved translations',
        message: `Updated translations for ${props.docId}!`,
        autoClose: false,
      });
    });
    setSaving(false);
  }

  function onChange(row: Record<string, string>) {
    setTranslationsMap((current) => {
      const newValue = {...current};
      newValue[row.source] = row;
      return newValue;
    });
    setChangedKeys((current) => {
      const newValue = new Set(current);
      newValue.add(row.source);
      return Array.from(newValue);
    });
    setHasChanges(true);
  }

  function openPortModal(source: string) {
    const targetRow = translationsMap[source] || {source};
    portModal.open({
      id: props.docId,
      targetSource: source,
      targetTranslations: toLocaleTranslations(targetRow),
      languages: toTranslationLanguages(
        (i18nConfig.locales || ['en']).filter(
          (locale: string) => !isLocaleExcludedFromTranslations(locale)
        )
      ),
      // Candidates are the strings tagged with the doc, which include the
      // field's previous source strings.
      loadCandidates: async () =>
        Object.values(translationsMap).map((row) => ({
          source: row.source,
          translations: toLocaleTranslations(row),
          label: strings.includes(row.source) ? undefined : 'unused',
        })),
      lookupSource: async (lookupSource) => {
        const translation = await getTranslationByHash(
          await sourceHash(lookupSource)
        );
        const translations = toLocaleTranslations(translation);
        return Object.keys(translations).length > 0 ? translations : null;
      },
      onSave: async (translations) => {
        await batchSaveTranslations([{source, locales: translations}], {
          tags: [props.docId],
        });
        // The ported translations are already saved, so they're merged in
        // without being marked as changed.
        setTranslationsMap((current) => ({
          ...current,
          [source]: {...(current[source] || {}), ...translations, source},
        }));
      },
    });
  }

  async function generateAiTranslations() {
    if (strings.length === 0) return;

    setAiGenerating(true);
    try {
      await notifyErrors(async () => {
        // For each source string, call AI API.
        for (const source of strings) {
          const existingRow = translationsMap[source] || {source};
          const existingTranslations: Record<string, string> = {};

          // Collect existing translations for this string.
          i18nLocales.forEach((locale) => {
            if (existingRow[locale]) {
              existingTranslations[locale] = existingRow[locale];
            }
          });

          // Find locales that need translation (blank fields only).
          // AI will NOT overwrite existing translations.
          const targetLocales = i18nLocales.filter(
            (locale) => !existingRow[locale]
          );

          if (targetLocales.length === 0) continue;

          const res = await window.fetch('/cms/api/ai.translate', {
            method: 'POST',
            headers: {'content-type': 'application/json'},
            body: JSON.stringify({
              sourceText: source,
              targetLocales,
              description: description || undefined,
              existingTranslations,
            }),
          });

          if (res.status !== 200) {
            const err = await res.text();
            throw new Error(`Translation failed: ${err}`);
          }

          const data = await res.json();
          if (data.success && data.translations) {
            // Update the translations map with AI-generated translations.
            const updatedRow = {...existingRow};
            Object.entries(data.translations).forEach(
              ([locale, translation]) => {
                updatedRow[locale] = translation as string;
              }
            );
            onChange(updatedRow);
          }
        }

        showNotification({
          message: 'Finished generating AI translations',
          color: 'green',
        });
      });
    } finally {
      setAiGenerating(false);
    }
  }

  function shouldShowAiButton() {
    if (!testAiEnabled()) return false;

    // Check if any translation fields are blank.
    for (const source of strings) {
      const row = translationsMap[source] || {};
      for (const locale of i18nLocales) {
        if (!row[locale]) {
          return true; // Found at least one blank field.
        }
      }
    }

    return false;
  }

  const translationsContent = (
    <>
      <div className="EditTranslationsModal__controls mb-8 flex flex-col gap-4 rounded-sm border border-solid border-border bg-surface-hover p-4 md:p-5">
        <div className="EditTranslationsModal__controlsDoNotTranslate flex items-center gap-1.5">
          <Checkbox
            label="Do not translate"
            checked={doNotTranslate}
            onChange={(e) => {
              setDoNotTranslate(e.currentTarget.checked);
              setHasChanges(true);
            }}
          />
          <InfoTooltip label="Prevent the string from being included for translation" />
        </div>

        <div className="EditTranslationsModal__controlsDescription text-base">
          <div className="EditTranslationsModal__controlsDescriptionLabel mb-2 flex items-center gap-1.5 font-semibold">
            <label htmlFor={descriptionId}>Description</label>
            <InfoTooltip label="Translator notes may be included when the string is extracted and sent for translation" />
          </div>
          <Textarea
            id={descriptionId}
            autosize
            minRows={1}
            maxRows={6}
            value={description}
            placeholder="Add context or notes for translators..."
            onInput={(e) => {
              setDescription(e.currentTarget.value);
              setHasChanges(true);
            }}
          />
        </div>
      </div>

      {!doNotTranslate && (
        <table className="EditTranslationsModal__table block w-full border-collapse md:table">
          <thead className="EditTranslationsModal__tableHead hidden md:table-header-group">
            <tr>
              <th className="w-2/5 py-4 pr-2.5 pl-2.5 text-left align-middle">
                <Heading size="h4" weight="semi-bold">
                  SOURCE
                </Heading>
              </th>
              <th className="py-4 pr-2.5 pl-10 text-left">
                {/* Fixed height, so the AI button doesn't shift the layout. */}
                <div className="flex h-control-md items-center justify-between">
                  <Heading size="h4" weight="semi-bold">
                    TRANSLATIONS
                  </Heading>
                  {shouldShowAiButton() && (
                    <IconButton
                      className="EditTranslationsModal__aiButton"
                      label="Generate quick translations using AI"
                      tooltipPlacement="left"
                      variant="default"
                      onClick={generateAiTranslations}
                      loading={aiGenerating}
                    >
                      <IconRobot stroke={1.5} />
                    </IconButton>
                  )}
                </div>
              </th>
            </tr>
          </thead>
          <tbody className="block md:table-row-group">
            {strings.map((source) => (
              <tr
                key={source}
                className="EditTranslationsModal__tableRow block border-0 border-t border-solid border-border py-4 md:table-row md:py-0"
              >
                <td className="block pb-3 align-top md:table-cell md:w-2/5 md:px-2.5 md:py-5">
                  <div className="EditTranslationsModal__tableSource group sticky top-0 w-full whitespace-pre-wrap rounded-sm border border-solid border-border bg-surface-hover p-2.5 pr-10 text-sm leading-normal">
                    {source}
                    <span className="EditTranslationsModal__tableSourcePort absolute top-1 right-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 pointer-coarse:opacity-100">
                      <IconButton
                        className="EditTranslationsModal__tableSourcePortButton"
                        size="xs"
                        variant="default"
                        label="Port translations from another string"
                        onClick={() => openPortModal(source)}
                      >
                        <IconArrowsTransferDown />
                      </IconButton>
                    </span>
                  </div>
                </td>
                <td className="block md:table-cell md:py-5 md:pr-2.5 md:pl-10">
                  <EditTranslationsModal.StringsEditor
                    source={source}
                    locales={i18nLocales}
                    translations={translationsMap[source] || {}}
                    onChange={onChange}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {!doNotTranslate && shouldShowAiButton() && (
        <div className="EditTranslationsModal__aiMobile mb-4 md:hidden">
          <Button
            icon={<IconRobot stroke={1.5} />}
            loading={aiGenerating}
            onClick={generateAiTranslations}
          >
            Generate translations with AI
          </Button>
        </div>
      )}
    </>
  );

  return (
    <div className="EditTranslationsModal">
      {loading ? (
        <Spinner />
      ) : props.field?.deepKey ? (
        <Tabs
          className="EditTranslationsModal__tabs"
          value={activeTab}
          onChange={(value) =>
            setActiveTab(value as 'translations' | 'history')
          }
        >
          <TabList className="mb-2" aria-label="Translation views">
            <Tab value="translations">Translations</Tab>
            <Tab value="history">History</Tab>
          </TabList>
          <TabPanel value="translations">{translationsContent}</TabPanel>
          <TabPanel value="history">
            <FieldHistory
              docId={props.docId}
              deepKey={props.field.deepKey}
              translatable={true}
            />
          </TabPanel>
        </Tabs>
      ) : (
        translationsContent
      )}

      <div className="EditTranslationsModal__footer sticky -bottom-5 z-10 -mb-5 mt-5 pb-5 flex flex-col gap-4 border-0 border-t border-solid border-border bg-surface px-2.5 pt-5 md:flex-row md:items-start md:justify-between md:gap-5">
        <div className="EditTranslationsModal__footerLeft flex flex-col items-start gap-3">
          <Button
            href={`/cms/translations/${props.docId}`}
            target="_blank"
            iconRight={<IconExternalLink />}
          >
            Open Translations Editor
          </Button>
          {props.l10nSheet && (
            <div className="EditTranslationsModal__footerGsheet text-base leading-normal">
              <strong>NOTE:</strong> Translations for this doc are managed in{' '}
              <a
                className="text-link"
                href={getSpreadsheetUrl(props.l10nSheet)}
                target="_blank"
                rel="noopener noreferrer"
              >
                Google Sheets
              </a>
            </div>
          )}
        </div>
        <div className="EditTranslationsModal__footerButtons flex shrink-0 justify-end gap-3">
          <Button type="button" onClick={() => context.closeModal(id)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={() => onSave()}
            disabled={!hasChanges}
            loading={saving}
          >
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}

/** An info icon that explains a control in a tooltip. */
function InfoTooltip(props: {label: string}) {
  return (
    <Tooltip label={props.label} placement="right">
      <span
        className="EditTranslationsModal__info inline-flex rounded-sm text-muted focus-visible:outline-2 focus-visible:outline-focus"
        role="img"
        aria-label={props.label}
        tabIndex={0}
      >
        <IconInfoCircle size={14} />
      </span>
    </Tooltip>
  );
}

EditTranslationsModal.StringsEditor = (props: {
  source: string;
  locales: string[];
  translations: Record<string, string>;
  onChange: (row: Record<string, string>) => void;
}) => {
  const locales = props.locales;
  const [translations, setTranslations] = useState<Record<string, string>>(
    props.translations || {}
  );
  const [hasChanges, setHasChanges] = useState(false);
  const baseId = useId();

  // Update local state when props.translations changes (e.g., from AI)
  useEffect(() => {
    setTranslations(props.translations || {});
  }, [props.translations]);

  function updateTranslation(locale: string, value: string) {
    setHasChanges(true);
    setTranslations((current) => {
      const newTranslations: Record<string, string> = {
        ...current,
        source: props.source,
      };
      newTranslations[locale] = value;
      return newTranslations;
    });
  }

  useEffect(() => {
    if (hasChanges) {
      props.onChange(translations);
    }
  }, [hasChanges, translations]);

  return (
    <div className="EditTranslationsModal__stringsEditor flex flex-col gap-2.5">
      {locales.map((locale) => (
        <div
          key={locale}
          className="EditTranslationsModal__stringsEditorRow flex items-start gap-3 md:gap-5"
        >
          <label
            htmlFor={`${baseId}-${locale}`}
            className="EditTranslationsModal__stringsEditorRowLocale flex min-h-control-sm w-12 shrink-0 items-center justify-end break-all text-right text-sm font-semibold"
          >
            {locale}
          </label>
          <div
            className={cn(
              'EditTranslationsModal__stringsEditorRowTranslation min-w-0 flex-1',
              translations[locale]
                ? 'EditTranslationsModal__stringsEditorRowTranslation--hasValue'
                : 'EditTranslationsModal__stringsEditorRowTranslation--empty'
            )}
          >
            <Textarea
              id={`${baseId}-${locale}`}
              inputClassName={cn(!translations[locale] && 'bg-danger-soft')}
              autosize
              minRows={1}
              maxRows={10}
              value={translations[locale] || ''}
              onInput={(e) => {
                updateTranslation(locale, e.currentTarget.value);
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
};
EditTranslationsModal.id = MODAL_ID;

function getMetadataKey(key: string) {
  const parts = key.split('.');
  const last = parts.pop();
  return [...parts, `@${last}`].join('.');
}
