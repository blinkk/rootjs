import './TranslationsManagerPage.css';

import {
  ActionIcon,
  Badge,
  Loader,
  Menu,
  TextInput,
  Tooltip,
} from '@mantine/core';
import {useModals} from '@mantine/modals';
import {showNotification} from '@mantine/notifications';
import {
  IconDotsVertical,
  IconFolder,
  IconLanguage,
  IconPencil,
  IconRocket,
  IconSearch,
  IconTrash,
  IconWorld,
} from '@tabler/icons-preact';
import {useEffect, useMemo, useState} from 'preact/hooks';
import {useLocation} from 'preact-iso';
import {Heading} from '../../components/Heading/Heading.js';
import {Surface} from '../../components/Surface/Surface.js';
import {UserActionTooltip} from '../../components/UserActionTooltip/UserActionTooltip.js';
import {useModalTheme} from '../../hooks/useModalTheme.js';
import {usePageTitle} from '../../hooks/usePageTitle.js';
import {Layout} from '../../layout/Layout.js';
import {joinClassNames} from '../../utils/classes.js';
import {notifyErrors} from '../../utils/notifications.js';
import {formatDateTime, getTimeAgo} from '../../utils/time.js';
import {
  TranslationsDocSummary,
  deleteTranslationsDoc,
  listTranslationsDocs,
  publishTranslations,
} from '../../utils/translations-manager.js';

/** Group used for translations ids without a `/` prefix, e.g. `common`. */
const GLOBAL_GROUP = 'Global';

function getGroup(id: string): string {
  const sepIndex = id.indexOf('/');
  if (sepIndex <= 0) {
    return GLOBAL_GROUP;
  }
  return id.slice(0, sepIndex);
}

export function TranslationsManagerPage() {
  usePageTitle('Translations');
  const [loading, setLoading] = useState(true);
  const [docs, setDocs] = useState<TranslationsDocSummary[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  async function reload() {
    await notifyErrors(async () => {
      const docs = await listTranslationsDocs();
      setDocs(docs);
    });
    setLoading(false);
  }

  useEffect(() => {
    reload();
  }, []);

  const groups = useMemo(() => {
    const byGroup: Record<string, number> = {};
    docs.forEach((doc) => {
      const group = getGroup(doc.id);
      byGroup[group] = (byGroup[group] || 0) + 1;
    });
    return Object.entries(byGroup)
      .map(([name, count]) => ({name, count}))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [docs]);

  const filteredDocs = useMemo(() => {
    let filtered = docs;
    if (selectedGroup) {
      filtered = filtered.filter((doc) => getGroup(doc.id) === selectedGroup);
    }
    const query = searchQuery.trim().toLowerCase();
    if (query) {
      filtered = filtered.filter((doc) => doc.id.toLowerCase().includes(query));
    }
    return filtered;
  }, [docs, selectedGroup, searchQuery]);

  return (
    <Layout>
      <div className="TranslationsManagerPage">
        <div className="TranslationsManagerPage__layout">
          <div className="TranslationsManagerPage__side">
            <div className="TranslationsManagerPage__side__title">
              Translations
            </div>
            <div className="TranslationsManagerPage__side__groups">
              <button
                className={joinClassNames(
                  'TranslationsManagerPage__side__group',
                  !selectedGroup && 'active'
                )}
                onClick={() => setSelectedGroup(null)}
              >
                <IconLanguage size={16} strokeWidth={1.75} />
                <div className="TranslationsManagerPage__side__group__label">
                  All
                </div>
                <div className="TranslationsManagerPage__side__group__count">
                  {docs.length}
                </div>
              </button>
              {groups.map((group) => (
                <button
                  key={group.name}
                  className={joinClassNames(
                    'TranslationsManagerPage__side__group',
                    selectedGroup === group.name && 'active'
                  )}
                  onClick={() => setSelectedGroup(group.name)}
                >
                  {group.name === GLOBAL_GROUP ? (
                    <IconWorld size={16} strokeWidth={1.75} />
                  ) : (
                    <IconFolder size={16} strokeWidth={1.75} />
                  )}
                  <div className="TranslationsManagerPage__side__group__label">
                    {group.name}
                  </div>
                  <div className="TranslationsManagerPage__side__group__count">
                    {group.count}
                  </div>
                </button>
              ))}
            </div>
          </div>
          <div className="TranslationsManagerPage__main">
            <div className="TranslationsManagerPage__main__header">
              <Heading size="h1">
                {selectedGroup
                  ? `Translations: ${selectedGroup}`
                  : 'Translations'}
              </Heading>
              <div className="TranslationsManagerPage__main__header__controls">
                <TextInput
                  className="TranslationsManagerPage__main__header__search"
                  placeholder="Search"
                  icon={<IconSearch size={16} />}
                  size="xs"
                  value={searchQuery}
                  onChange={(e: Event) => {
                    setSearchQuery((e.target as HTMLInputElement).value);
                  }}
                />
              </div>
            </div>
            <Surface className="TranslationsManagerPage__main__content">
              {loading ? (
                <div className="TranslationsManagerPage__loading">
                  <Loader color="gray" size="xl" />
                </div>
              ) : filteredDocs.length === 0 ? (
                <div className="TranslationsManagerPage__empty">
                  {docs.length === 0
                    ? 'No translations yet. Translations saved from a doc appear here.'
                    : 'No translations match your filters.'}
                </div>
              ) : (
                <TranslationsManagerPage.DocsList
                  docs={filteredDocs}
                  reload={() => reload()}
                />
              )}
            </Surface>
          </div>
        </div>
      </div>
    </Layout>
  );
}

TranslationsManagerPage.DocsList = (props: {
  docs: TranslationsDocSummary[];
  reload: () => void;
}) => {
  return (
    <div className="TranslationsManagerPage__docsList">
      <div className="TranslationsManagerPage__docsList__header">
        <div className="TranslationsManagerPage__docsList__header__cell">
          ID
        </div>
        <div className="TranslationsManagerPage__docsList__header__cell">
          Locales
        </div>
        <div className="TranslationsManagerPage__docsList__header__cell">
          Status
        </div>
        <div className="TranslationsManagerPage__docsList__header__cell">
          Modified
        </div>
        <div className="TranslationsManagerPage__docsList__header__cell">
          Published
        </div>
        <div className="TranslationsManagerPage__docsList__header__controls" />
      </div>
      {props.docs.map((doc) => (
        <TranslationsManagerPage.DocRow
          key={doc.id}
          doc={doc}
          reload={props.reload}
        />
      ))}
    </div>
  );
};

TranslationsManagerPage.DocRow = (props: {
  doc: TranslationsDocSummary;
  reload: () => void;
}) => {
  const doc = props.doc;
  const {route} = useLocation();
  const modals = useModals();
  const modalTheme = useModalTheme();
  const editUrl = `/cms/translations/${doc.id}`;

  function onPublish() {
    modals.openConfirmModal({
      ...modalTheme,
      title: `Publish translations: ${doc.id}`,
      children: (
        <div className="TranslationsManagerPage__confirmText">
          Are you sure you want to publish the translations for{' '}
          <code>{doc.id}</code>? The translations will go live immediately.
        </div>
      ),
      labels: {confirm: 'Publish', cancel: 'Cancel'},
      cancelProps: {size: 'xs'},
      confirmProps: {color: 'dark', size: 'xs'},
      onConfirm: async () => {
        await notifyErrors(async () => {
          await publishTranslations(doc.id);
          showNotification({
            title: 'Published translations',
            message: `Published translations for ${doc.id}.`,
            autoClose: 10000,
          });
          props.reload();
        });
      },
    });
  }

  function onDelete() {
    modals.openConfirmModal({
      ...modalTheme,
      title: `Delete translations: ${doc.id}`,
      children: (
        <div className="TranslationsManagerPage__confirmText">
          Are you sure you want to delete the translations for{' '}
          <code>{doc.id}</code>? This deletes both the draft and published
          translations and cannot be undone.
        </div>
      ),
      labels: {confirm: 'Delete', cancel: 'Cancel'},
      cancelProps: {size: 'xs'},
      confirmProps: {color: 'red', size: 'xs'},
      onConfirm: async () => {
        await notifyErrors(async () => {
          await deleteTranslationsDoc(doc.id);
          showNotification({
            title: 'Deleted translations',
            message: `Deleted translations for ${doc.id}.`,
            autoClose: 10000,
          });
          props.reload();
        });
      },
    });
  }

  return (
    <div className="TranslationsManagerPage__docsList__doc">
      <a className="TranslationsManagerPage__docsList__doc__id" href={editUrl}>
        {doc.id}
      </a>
      <div className="TranslationsManagerPage__docsList__doc__locales">
        <Tooltip
          label={doc.locales.join(', ') || 'no locales'}
          transition="pop"
          withArrow
        >
          {doc.locales.length} locale{doc.locales.length === 1 ? '' : 's'}
        </Tooltip>
      </div>
      <div className="TranslationsManagerPage__docsList__doc__status">
        {doc.publishedAt ? (
          doc.hasUnpublishedChanges ? (
            <Badge
              size="xs"
              variant="gradient"
              gradient={{from: 'orange', to: 'yellow'}}
            >
              Unpublished changes
            </Badge>
          ) : (
            <Badge
              size="xs"
              variant="gradient"
              gradient={{from: 'teal', to: 'lime'}}
            >
              Published
            </Badge>
          )
        ) : (
          <Badge size="xs" variant="outline" color="gray">
            Draft
          </Badge>
        )}
      </div>
      <div className="TranslationsManagerPage__docsList__doc__timestamp">
        {doc.modifiedAt ? (
          <UserActionTooltip
            message={formatDateTime(doc.modifiedAt)}
            user={doc.modifiedBy}
          >
            <span>{getTimeAgo(doc.modifiedAt.toMillis())}</span>
          </UserActionTooltip>
        ) : (
          '—'
        )}
      </div>
      <div className="TranslationsManagerPage__docsList__doc__timestamp">
        {doc.publishedAt ? (
          <UserActionTooltip
            message={formatDateTime(doc.publishedAt)}
            user={doc.publishedBy}
          >
            <span>{getTimeAgo(doc.publishedAt.toMillis())}</span>
          </UserActionTooltip>
        ) : (
          '—'
        )}
      </div>
      <div className="TranslationsManagerPage__docsList__doc__controls">
        <Menu
          className="TranslationsManagerPage__docsList__doc__menu"
          position="bottom"
          placement="end"
          control={
            <ActionIcon>
              <IconDotsVertical size={16} />
            </ActionIcon>
          }
        >
          <Menu.Item
            icon={<IconPencil size={16} />}
            onClick={() => route(editUrl)}
          >
            Edit
          </Menu.Item>
          <Menu.Item icon={<IconRocket size={16} />} onClick={onPublish}>
            Publish…
          </Menu.Item>
          <Menu.Item
            icon={<IconTrash size={16} />}
            color="red"
            onClick={onDelete}
          >
            Delete…
          </Menu.Item>
        </Menu>
      </div>
    </div>
  );
};
