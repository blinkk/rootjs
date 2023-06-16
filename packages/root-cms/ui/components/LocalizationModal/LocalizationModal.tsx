import {
  ActionIcon,
  Box,
  Button,
  Checkbox,
  Divider,
  Group,
  Loader,
  Menu,
  Select,
  Stack,
  Text,
  Tooltip,
} from '@mantine/core';
import {ContextModalProps, useModals} from '@mantine/modals';
import {showNotification} from '@mantine/notifications';
import {
  IconChevronDown,
  IconFileDownload,
  IconFileUpload,
  IconLanguage,
  IconMapPin,
  IconTable,
} from '@tabler/icons-preact';
import {doc, getDoc} from 'firebase/firestore';
import {useEffect, useState} from 'preact/hooks';
import * as schema from '../../../core/schema.js';
import {DraftController} from '../../hooks/useDraft.js';
import {useModalTheme} from '../../hooks/useModalTheme.js';
import {cmsDocImportCsv} from '../../utils/doc.js';
import {
  TranslationsMap,
  loadTranslations,
  normalizeString,
} from '../../utils/l10n.js';
import {Heading} from '../Heading/Heading.js';
import './LocalizationModal.css';

const MODAL_ID = 'LocalizationModal';

export interface LocalizationModalProps {
  [key: string]: unknown;
  draft: DraftController;
  collection: schema.Collection;
  docId: string;
}

export function useLocalizationModal(props: LocalizationModalProps) {
  const modals = useModals();
  const modalTheme = useModalTheme();
  return {
    open: () => {
      modals.openContextModal(MODAL_ID, {
        ...modalTheme,
        innerProps: props,
        size: 'clamp(80%, 1024px, 1280px)',
        onClose: () => {
          props.draft.flush();
        },
      });
    },
  };
}

export function LocalizationModal(
  modalProps: ContextModalProps<LocalizationModalProps>
) {
  const props = modalProps.innerProps;
  return (
    <div className="LocalizationModal">
      <div className="LocalizationModal__layout">
        <LocalizationModal.ConfigLocales {...props} />
        <LocalizationModal.Translations {...props} />
      </div>
    </div>
  );
}

LocalizationModal.id = MODAL_ID;

LocalizationModal.ConfigLocales = (props: LocalizationModalProps) => {
  const [enabledLocales, setEnabledLocales] = useState(() => {
    if (props.draft) {
      return props.draft.getLocales();
    }
    return ['en'];
  });
  const i18nConfig = window.__ROOT_CTX.rootConfig.i18n || {};
  const i18nLocales = i18nConfig.locales || ['en'];
  const localeGroups: LocaleGroupsConfig = i18nConfig.groups || {
    default: {
      label: '',
      locales: i18nLocales,
    },
  };

  function enabledLocalesFor(groupId: string) {
    return enabledLocales.filter((l: string) => {
      const groupLocales = localeGroups[groupId].locales || [];
      return groupLocales.includes(l);
    });
  }

  function setGroupEnabledLocales(groupId: string, locales: string[]) {
    const localeSet = new Set(enabledLocales);
    const groupLocales = localeGroups[groupId].locales || [];
    for (const locale of groupLocales) {
      if (locales.includes(locale)) {
        localeSet.add(locale);
      } else {
        localeSet.delete(locale);
      }
    }
    // Ensure the default locale is always enabled.
    localeSet.add('en');
    const newLocales = Array.from(localeSet.values()).sort();
    updateEnabledLocales(newLocales);
  }

  function updateEnabledLocales(newLocales: string[]) {
    setEnabledLocales(newLocales);
    props.draft.setLocales(newLocales);
  }

  return (
    <div className="LocalizationModal__locales">
      <Stack spacing={30}>
        <Group>
          <Heading
            className="LocalizationModal__iconTitle LocalizationModal__locales__title"
            size="h2"
          >
            <IconMapPin strokeWidth={1.5} />
            <span>Locales</span>
          </Heading>
          <LocalizationModal.AllNoneButtons
            onAllClicked={() => updateEnabledLocales(i18nLocales)}
            onNoneClicked={() => updateEnabledLocales([])}
          />
        </Group>
        <Stack spacing={40}>
          {Object.keys(localeGroups).map((groupId: string) => {
            const group = localeGroups[groupId];
            const enabledLocales = enabledLocalesFor(groupId);
            return (
              <LocalizationModal.LocaleGroup
                group={group}
                enabledLocales={enabledLocales}
                onChange={(locales) => setGroupEnabledLocales(groupId, locales)}
              />
            );
          })}
        </Stack>
      </Stack>
    </div>
  );
};

interface LocaleGroup {
  label?: string;
  locales: string[];
}

type LocaleGroupsConfig = Record<string, LocaleGroup>;

interface LocaleGroupProps {
  group: LocaleGroup;
  enabledLocales: string[];
  onChange?: (locales: string[]) => void;
}

function getLocaleLabel(locale: string) {
  const langNames = new Intl.DisplayNames(['en'], {
    type: 'language',
  });
  const parts = locale.split('_');
  const langCode = parts[0];
  const langName = langNames.of(langCode) || locale;
  return `${langName} (${locale})`;
}

LocalizationModal.LocaleGroup = (props: LocaleGroupProps) => {
  const enabledLocales = props.enabledLocales || [];
  const groupLocales = props.group.locales || [];

  function setEnabledLocales(locales: string[]) {
    if (props.onChange) {
      props.onChange(locales);
    }
  }

  function toggleLocale(locale: string) {
    const index = enabledLocales.indexOf(locale);
    if (index === -1) {
      enabledLocales.push(locale);
    } else {
      enabledLocales.splice(index, 1);
    }
    setEnabledLocales(enabledLocales);
  }

  return (
    <Stack spacing={16}>
      {props.group.label && (
        <Group position="apart">
          <Heading size="h4" weight="semi-bold">
            {props.group.label}
          </Heading>
          <LocalizationModal.AllNoneButtons
            onAllClicked={() => setEnabledLocales(groupLocales)}
            onNoneClicked={() => setEnabledLocales([])}
          />
        </Group>
      )}
      <Group>
        {groupLocales.map((locale) => (
          <Checkbox
            value={locale}
            checked={enabledLocales.includes(locale) || locale === 'en'}
            disabled={locale === 'en'}
            label={getLocaleLabel(locale)}
            onChange={() => toggleLocale(locale)}
            size="xs"
          />
        ))}
      </Group>
    </Stack>
  );
};

interface AllNoneButtonsProps {
  onAllClicked?: () => void;
  onNoneClicked?: () => void;
}

LocalizationModal.AllNoneButtons = (props: AllNoneButtonsProps) => {
  return (
    <Group spacing="8px">
      <Button
        variant="subtle"
        size="xs"
        compact
        onClick={props.onAllClicked}
        sx={(theme) => ({
          '&:hover': {
            backgroundColor: theme.colors.gray[0],
          },
        })}
      >
        All
      </Button>
      /
      <Button
        variant="subtle"
        size="xs"
        compact
        onClick={props.onNoneClicked}
        sx={(theme) => ({
          '&:hover': {
            backgroundColor: theme.colors.gray[0],
          },
        })}
      >
        None
      </Button>
    </Group>
  );
};

interface TranslationsProps {
  collection: schema.Collection;
  docId: string;
}

LocalizationModal.Translations = (props: TranslationsProps) => {
  const [loading, setLoading] = useState(true);
  const [sourceStrings, setSourceStrings] = useState<string[]>([]);
  const [selectedLocale, setSelectedLocale] = useState('en');
  const [localeTranslations, setLocaleTranslations] = useState<
    Record<string, string>
  >({});
  const [translationsMap, setTranslationsMap] = useState<TranslationsMap>({});

  const locales = window.__ROOT_CTX.rootConfig.i18n.locales || [];
  const localeOptions = locales.map((locale) => ({
    value: locale,
    label: getLocaleLabel(locale),
  }));

  useEffect(() => {
    setLoading(true);
    Promise.all([
      extractStrings(props.collection, props.docId),
      loadTranslations(),
    ]).then(([sourceStrings, translationsMap]) => {
      setSourceStrings(sourceStrings);
      setTranslationsMap(translationsMap);
      console.log('translations map:', translationsMap);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!selectedLocale) {
      setLocaleTranslations({});
      return;
    }
    const localeTranslations: Record<string, string> = {};
    Object.values(translationsMap).forEach(
      (translation: Record<string, string>) => {
        localeTranslations[translation.source] =
          translation[selectedLocale] || '';
      }
    );
    setLocaleTranslations(localeTranslations);
  }, [selectedLocale, translationsMap]);

  async function downloadCsv() {
    const headers = ['source', 'en'];
    const rows: Array<Record<string, string>> = [];
    sourceStrings.forEach((source) => {
      rows.push({
        source: source,
        en: source,
      });
    });
    const res = await window.fetch('/cms/api/csv.download', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({headers, rows}),
    });
    if (res.status !== 200) {
      console.error('csv.download failed:');
      const text = await res.text();
      console.error(text);
    }
    const blob = await res.blob();
    const file = window.URL.createObjectURL(blob);
    window.location.assign(file);
    window.URL.revokeObjectURL(file);
  }

  async function importCsv() {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.csv';
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files?.[0];
      if (file) {
        const formData = new FormData();
        formData.append('file', file);
        try {
          const res = await fetch('/cms/api/csv.import', {
            method: 'POST',
            body: formData,
          }).then((res) => res.json());
          const importedTranslations = await cmsDocImportCsv(
            props.docId,
            res.data
          );
          setTranslationsMap((currentTranslations) => {
            return Object.assign({}, currentTranslations, importedTranslations);
          });
          showNotification({
            title: 'Saved!',
            message: `Successfully imported translations for ${props.docId}.`,
            autoClose: 5000,
          });
        } catch (err) {
          console.error(err);
          showNotification({
            title: 'Failed to import CSV',
            message: `Error saving CSV: ${err}`,
            color: 'red',
            autoClose: false,
          });
        }
      }
    });
    fileInput.click();
  }

  function onAction(action: string) {
    switch (action) {
      case 'export-download-csv': {
        downloadCsv();
        return;
      }
      case 'import-csv': {
        importCsv();
        return;
      }
    }
  }

  if (loading) {
    return (
      <div className="LocalizationModal__translations__loading">
        <Loader color="gray" size="xl" />
      </div>
    );
  }

  return (
    <div className="LocalizationModal__translations">
      <div className="LocalizationModal__translations__header">
        <Heading
          className="LocalizationModal__translations__title LocalizationModal__iconTitle"
          size="h2"
        >
          <IconLanguage strokeWidth={1.5} /> <span>Translations</span>
        </Heading>
        <div className="LocalizationModal__translations__header__buttons">
          <Tooltip label="Link Google Sheet">
            <ActionIcon>
              <IconTable size={16} strokeWidth={2.25} />
            </ActionIcon>
          </Tooltip>
          <ImportMenuButton onAction={onAction} />
          <ExportMenuButton onAction={onAction} />
        </div>
      </div>
      <table className="LocalizationModal__translations__table">
        <tr className="LocalizationModal__translations__table__row LocalizationModal__translations__table__row--header">
          <th className="LocalizationModal__translations__table__header">
            <Heading size="h4" weight="semi-bold">
              SOURCE STRING
            </Heading>
          </th>
          <th className="LocalizationModal__translations__table__header">
            <Heading
              className="LocalizationModal__translations__localeSelect"
              size="h4"
              weight="semi-bold"
            >
              <span>LOCALE: </span>{' '}
              <Select
                data={localeOptions}
                size="xs"
                placeholder="select locale"
                allowDeselect
                value={selectedLocale}
                onChange={(value: string) => setSelectedLocale(value)}
              />
            </Heading>
          </th>
        </tr>
        {sourceStrings.map((source, i) => (
          <tr className="LocalizationModal__translations__table__row" key={i}>
            <td className="LocalizationModal__translations__table__col">
              <Box
                sx={(theme) => ({
                  backgroundColor: theme.colors.gray[0],
                  border: `1px solid ${theme.colors.gray[3]}`,
                  padding: '10px 20px',
                  borderRadius: 4,
                  height: '100%',
                })}
              >
                <Text size="xs" sx={{whiteSpace: 'pre-wrap'}}>
                  {source}
                </Text>
              </Box>
            </td>
            <td className="LocalizationModal__translations__table__col">
              <Box
                sx={(theme) => ({
                  backgroundColor: theme.colors.gray[0],
                  border: `1px solid ${theme.colors.gray[3]}`,
                  padding: '10px 20px',
                  borderRadius: 4,
                  height: '100%',
                })}
              >
                <Text size="xs" sx={{whiteSpace: 'pre-wrap'}}>
                  {localeTranslations[source] || ' '}
                </Text>
              </Box>
            </td>
          </tr>
        ))}
      </table>
    </div>
  );
};

async function extractStrings(collection: schema.Collection, docId: string) {
  const db = window.firebase.db;
  const projectId = window.__ROOT_CTX.rootConfig.projectId;
  const [collectionId, slug] = docId.split('/', 2);
  const docRef = doc(
    db,
    'Projects',
    projectId,
    'Collections',
    collectionId,
    'Drafts',
    slug
  );
  const snapshot = await getDoc(docRef);
  const data = snapshot.data() || {};
  const strings = new Set<string>();
  extractFields(strings, collection.fields, data.fields || {});
  return Array.from(strings);
}

function extractFields(
  strings: Set<string>,
  fields: schema.Field[],
  data: Record<string, any>
) {
  fields.forEach((field) => {
    if (!field.id) {
      return;
    }
    const fieldValue = data[field.id];
    extractField(strings, field, fieldValue);
  });
}

function extractField(
  strings: Set<string>,
  field: schema.Field,
  fieldValue: any
) {
  if (!fieldValue) {
    return;
  }
  if (field.type === 'object') {
    extractFields(strings, field.fields || [], fieldValue);
  } else if (field.type === 'array') {
    const arrayKeys = fieldValue._array || [];
    for (const arrayKey of arrayKeys) {
      extractField(strings, field.of, fieldValue[arrayKey]);
    }
  } else if (field.type === 'string' || field.type === 'select') {
    if (field.translate) {
      strings.add(normalizeString(fieldValue));
    }
  } else if (field.type === 'multiselect') {
    if (field.translate && Array.isArray(fieldValue)) {
      for (const value of fieldValue) {
        strings.add(normalizeString(value));
      }
    }
  } else if (field.type === 'oneof') {
    const types = field.types || [];
    const fieldValueType = types.find((item) => item.name === fieldValue._type);
    if (fieldValueType) {
      extractFields(strings, fieldValueType.fields || [], fieldValue);
    }
  } else {
    console.log(`extract: ignoring field, id=${field.id}, type=${field.type}`);
  }
}

interface MenuButtonProps {
  onAction?: (action: string) => void;
}

function ImportMenuButton(props: MenuButtonProps) {
  function dispatch(action: string) {
    if (props.onAction) {
      props.onAction(action);
    }
  }

  return (
    <Menu
      className=""
      position="bottom"
      placement="end"
      control={
        <Button
          variant="default"
          color="dark"
          size="xs"
          leftIcon={<IconFileUpload size={16} strokeWidth={1.75} />}
          rightIcon={<IconChevronDown size={16} strokeWidth={1.75} />}
        >
          Import
        </Button>
      }
    >
      <Menu.Label>Google Sheets</Menu.Label>
      <Menu.Item disabled onClick={() => dispatch('import-google-sheet')}>
        Import Google Sheet
      </Menu.Item>
      <Divider />
      <Menu.Label>File</Menu.Label>
      <Menu.Item onClick={() => dispatch('import-csv')}>Import .csv</Menu.Item>
    </Menu>
  );
}

function ExportMenuButton(props: MenuButtonProps) {
  function dispatch(action: string) {
    if (props.onAction) {
      props.onAction(action);
    }
  }

  return (
    <Menu
      className=""
      position="bottom"
      placement="start"
      control={
        <Button
          variant="default"
          color="dark"
          size="xs"
          leftIcon={<IconFileDownload size={16} strokeWidth={1.75} />}
          rightIcon={<IconChevronDown size={16} strokeWidth={1.75} />}
        >
          Export
        </Button>
      }
    >
      <Menu.Label>Google Sheets</Menu.Label>
      <Menu.Item onClick={() => dispatch('export-google-sheet-create')}>
        Create Google Sheet
      </Menu.Item>
      <Menu.Item onClick={() => dispatch('export-google-sheet-add-tab')}>
        Add tab in Google Sheet
      </Menu.Item>
      <Divider />
      <Menu.Label>File</Menu.Label>
      <Menu.Item onClick={() => dispatch('export-download-csv')}>
        Download .csv
      </Menu.Item>
    </Menu>
  );
}
