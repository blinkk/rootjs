import './EditTranslationsModal.css';

import {
  ActionIcon,
  Button,
  Checkbox,
  Loader,
  Textarea,
  Tooltip,
} from '@mantine/core';
import {ContextModalProps, useModals} from '@mantine/modals';
import {showNotification, updateNotification} from '@mantine/notifications';
import {
  IconExternalLink,
  IconInfoCircle,
  IconSparkles,
  IconLoader2,
} from '@tabler/icons-preact';
import {ChangeEvent} from 'preact/compat';
import {useEffect, useState} from 'preact/hooks';
import {DraftDocContext} from '../../hooks/useDraftDoc.js';
import {useModalTheme} from '../../hooks/useModalTheme.js';
import {joinClassNames} from '../../utils/classes.js';
import {CsvTranslation, cmsDocImportTranslations} from '../../utils/doc.js';
import {GoogleSheetId, getSpreadsheetUrl} from '../../utils/gsheets.js';
import {loadTranslations} from '../../utils/l10n.js';
import {notifyErrors} from '../../utils/notifications.js';
import {Heading} from '../Heading/Heading.js';

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
  const modalTheme = useModalTheme();
  return {
    open: (props: EditTranslationsModalProps) => {
      modals.openContextModal(MODAL_ID, {
        ...modalTheme,
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
  const i18nLocales = i18nConfig.locales || ['en'];
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

  // Use draft from props (passed from DocEditor)
  const draft = props.draft || null;

  // Load translation metadata from the document
  useEffect(() => {
    if (props.field?.deepKey && draft?.controller) {
      const metadataKey = getMetadataKey(props.field.deepKey);
      const metadata = draft.controller.getValue(metadataKey) || {};
      const translations = metadata.translations || {};
      setDoNotTranslate(translations.doNotTranslate || false);
      setDescription(translations.description || '');
    }
  }, [props.field?.deepKey, draft?.controller]);

  useEffect(() => {
    loadTranslations({tags: [props.docId]}).then((res) => {
      const translationsMap: Record<string, Record<string, string>> = {};
      Object.values(res).forEach((row) => {
        translationsMap[row.source] = row;
      });
      setTranslationsMap(translationsMap);
      setLoading(false);
    });
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

      // Save translation metadata if field is provided
      if (props.field?.deepKey && draft?.controller) {
        const metadataKey = getMetadataKey(props.field.deepKey);
        const metadata = draft.controller.getValue(metadataKey) || {};
        metadata.translations = {
          doNotTranslate: doNotTranslate,
          description: description,
        };
        await draft.controller.updateKey(metadataKey, metadata);
        // Ensure the metadata is saved immediately
        await draft.controller.flush();
      }

      // Only save translations if not marked as "do not translate"
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

  async function generateAiTranslations() {
    if (strings.length === 0) return;

    setAiGenerating(true);
    try {
      await notifyErrors(async () => {
        // For each source string, call AI API
        for (const source of strings) {
          const existingRow = translationsMap[source] || {source};
          const existingTranslations: Record<string, string> = {};

          // Collect existing translations for this string
          i18nLocales.forEach((locale) => {
            if (existingRow[locale]) {
              existingTranslations[locale] = existingRow[locale];
            }
          });

          // Find locales that need translation (blank fields)
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
            // Update the translations map with AI-generated translations
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
    const experiments = (window as any).__ROOT_CTX?.experiments || {};
    const aiEnabled = !!experiments.ai;

    if (!aiEnabled) return false;

    // Check if any translation fields are blank
    for (const source of strings) {
      const row = translationsMap[source] || {};
      for (const locale of i18nLocales) {
        if (!row[locale]) {
          return true; // Found at least one blank field
        }
      }
    }

    return false;
  }

  return (
    <div className="EditTranslationsModal">
      {loading ? (
        <Loader />
      ) : (
        <>
          <div className="EditTranslationsModal__controls">
            <div className="EditTranslationsModal__controls__doNotTranslate">
              <Checkbox
                label="Do not translate"
                checked={doNotTranslate}
                onChange={(e: ChangeEvent<HTMLInputElement>) => {
                  setDoNotTranslate(e.currentTarget.checked);
                  setHasChanges(true);
                }}
                size="sm"
              />
              <Tooltip
                label="Prevent the string from being included for translation"
                withArrow
                position="right"
              >
                <IconInfoCircle size={14} style={{marginLeft: '6px'}} />
              </Tooltip>
            </div>

            <div className="EditTranslationsModal__controls__description">
              <div className="EditTranslationsModal__controls__description__label">
                <span>Description</span>
                <Tooltip
                  label="Translator notes may be included when the string is extracted and sent for translation"
                  withArrow
                  position="right"
                >
                  <IconInfoCircle size={14} style={{marginLeft: '6px'}} />
                </Tooltip>
              </div>
              <Textarea
                size="sm"
                autosize
                minRows={1}
                maxRows={6}
                value={description}
                placeholder="Add context or notes for translators..."
                onChange={(e: ChangeEvent<HTMLTextAreaElement>) => {
                  setDescription(e.currentTarget.value);
                  setHasChanges(true);
                }}
              />
            </div>
          </div>

          <table className="EditTranslationsModal__table">
            <thead
              style={{display: doNotTranslate ? 'none' : 'table-header-group'}}
            >
              <tr>
                <th>
                  <Heading size="h4" weight="semi-bold">
                    SOURCE
                  </Heading>
                </th>
                <th>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <Heading size="h4" weight="semi-bold">
                      TRANSLATIONS
                    </Heading>
                    {shouldShowAiButton() && (
                      <Tooltip
                        label="Generate quick translations using AI"
                        withArrow
                        position="left"
                      >
                        <ActionIcon
                          variant="light"
                          color="violet"
                          onClick={generateAiTranslations}
                          loading={aiGenerating}
                          disabled={aiGenerating}
                          size="sm"
                        >
                          {aiGenerating ? (
                            <IconLoader2 size={16} />
                          ) : (
                            <IconSparkles size={16} />
                          )}
                        </ActionIcon>
                      </Tooltip>
                    )}
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {strings.map((source) => (
                <tr style={{display: doNotTranslate ? 'none' : 'table-row'}}>
                  <td>
                    <div className="EditTranslationsModal__table__source">
                      {source}
                    </div>
                  </td>
                  <td>
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
        </>
      )}

      <div className="EditTranslationsModal__footer">
        <div className="EditTranslationsModal__footer__left">
          <Button
            component="a"
            href={`/cms/translations/${props.docId}`}
            target="_blank"
            variant="default"
            size="md"
            rightIcon={<IconExternalLink size={14} />}
          >
            Open Translations Editor
          </Button>
          {props.l10nSheet && (
            <div className="EditTranslationsModal__footer__gsheet">
              <strong>NOTE:</strong> Translations for this doc are managed in{' '}
              <a
                href={getSpreadsheetUrl(props.l10nSheet)}
                target="_blank"
                rel="noopener noreferrer"
              >
                Google Sheets
              </a>
            </div>
          )}
        </div>
        <div className="EditTranslationsModal__footer__buttons">
          <Button
            variant="default"
            size="md"
            color="dark"
            type="button"
            onClick={() => context.closeModal(id)}
          >
            Cancel
          </Button>
          <Button
            variant="filled"
            size="md"
            color="dark"
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
    <div className="EditTranslationsModal__StringsEditor">
      {locales.map((locale) => (
        <div className="EditTranslationsModal__StringsEditor__row">
          <div className="EditTranslationsModal__StringsEditor__row__locale">
            {locale}
          </div>
          <div
            className={joinClassNames(
              'EditTranslationsModal__StringsEditor__row__translation',
              translations[locale] ? 'hasValue' : 'empty'
            )}
          >
            <Textarea
              size="xs"
              radius={0}
              autosize
              minRows={1}
              maxRows={10}
              value={translations[locale]}
              onChange={(e: ChangeEvent<HTMLTextAreaElement>) => {
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
