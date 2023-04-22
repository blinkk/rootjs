import {
  Box,
  Button,
  Checkbox,
  Group,
  Loader,
  Modal,
  Select,
  Stack,
  Text,
  useMantineTheme,
} from '@mantine/core';
import {IconLanguage, IconMapPin} from '@tabler/icons-preact';
import {doc, getDoc} from 'firebase/firestore';
import {useEffect, useState} from 'preact/hooks';
import * as schema from '../../../core/schema.js';
import {Heading} from '../Heading/Heading.js';
import './LocalizationModal.css';

interface LocalizationModalProps {
  collection: schema.Collection;
  docId: string;
  opened?: boolean;
  onClose?: () => void;
}

export function LocalizationModal(props: LocalizationModalProps) {
  const theme = useMantineTheme();

  function onClose() {
    if (props.onClose) {
      props.onClose();
    }
  }

  return (
    <Modal
      className="LocalizationModal"
      opened={props.opened || false}
      onClose={() => onClose()}
      size="min(80%, 1280px)"
      overlayColor={
        theme.colorScheme === 'dark'
          ? theme.colors.dark[9]
          : theme.colors.gray[2]
      }
      overlayOpacity={0.55}
      overlayBlur={3}
    >
      <div className="LocalizationModal__layout">
        <div className="LocalizationModal__locales">
          <LocalizationModal.ConfigLocales docId={props.docId} />
        </div>
        <div className="LocalizationModal__translations">
          <LocalizationModal.Translations
            collection={props.collection}
            docId={props.docId}
            opened={props.opened}
          />
        </div>
      </div>
    </Modal>
  );
}

interface ConfigLocalesProps {
  docId: string;
}

LocalizationModal.ConfigLocales = (props: ConfigLocalesProps) => {
  const [enabledLocales, setEnabledLocales] = useState(['en']);
  const i18nConfig = window.__ROOT_CTX.rootConfig.i18n || {};
  const podLocales = i18nConfig.locales || ['en'];
  const localeGroups: LocaleGroupsConfig = i18nConfig.groups || {
    default: {
      label: '',
      locales: podLocales,
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
    const newLocales = Array.from(localeSet.values()).sort();
    setEnabledLocales(newLocales);
  }

  return (
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
          onAllClicked={() => setEnabledLocales(podLocales)}
          onNoneClicked={() => setEnabledLocales([])}
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
  opened?: boolean;
}

LocalizationModal.Translations = (props: TranslationsProps) => {
  const [loading, setLoading] = useState(true);
  const [sourceStrings, setSourceStrings] = useState<string[]>([]);
  const [selectedLocale, setSelectedLocale] = useState('');

  const locales = window.__ROOT_CTX.rootConfig.i18n.locales || [];
  const localeOptions = locales.map((locale) => ({
    value: locale,
    label: getLocaleLabel(locale),
  }));

  useEffect(() => {
    if (!props.opened) {
      return;
    }
    setLoading(true);
    extractStrings(props.collection, props.docId).then((strings) => {
      setSourceStrings(strings);
      setLoading(false);
    });
  }, [props.opened]);

  if (loading) {
    return (
      <div className="LocalizationModal__translations__loading">
        <Loader color="gray" size="xl" />
      </div>
    );
  }

  return (
    <>
      <div className="LocalizationModal__translations__header">
        <Heading
          className="LocalizationModal__translations__title LocalizationModal__iconTitle"
          size="h2"
        >
          <IconLanguage strokeWidth={1.5} /> <span>Translations</span>
        </Heading>
        <div className="LocalizationModal__translations__header__buttons">
          <Button variant="default" color="dark" size="xs" disabled>
            Import
          </Button>
          <Button variant="default" color="dark" size="xs">
            Export
          </Button>
        </div>
      </div>
      <div className="LocalizationModal__translations__table">
        <div className="LocalizationModal__translations__table__row LocalizationModal__translations__table__row--header">
          <div className="LocalizationModal__translations__table__header">
            <Heading size="h4" weight="semi-bold">
              SOURCE STRING
            </Heading>
          </div>
          <div className="LocalizationModal__translations__table__header">
            <Heading
              className="LocalizationModal__translations__localeSelect"
              size="h4"
              weight="semi-bold"
            >
              <span>LOCALE: </span>{' '}
              <Select
                data={localeOptions}
                value={selectedLocale}
                size="xs"
                placeholder="select locale"
                allowDeselect
                onChange={(e) => setSelectedLocale(e.value)}
              />
            </Heading>
          </div>
        </div>
        {sourceStrings.map((source, i) => (
          <div className="LocalizationModal__translations__table__row" key={i}>
            <div className="LocalizationModal__translations__table__col">
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
            </div>
            <div className="LocalizationModal__translations__table__col">
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
                  &nbsp;
                </Text>
              </Box>
            </div>
          </div>
        ))}
      </div>
    </>
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

function normalizeString(s: string) {
  return String(s).trim();
}
