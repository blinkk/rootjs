import './TranslationsManagerPage.css';

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
import {ComponentChildren} from 'preact';
import {useEffect, useMemo, useState} from 'preact/hooks';
import {useLocation} from 'preact-iso';
import {Layout} from '../../../../app/layout/Layout.js';
import {Heading} from '../../../../components/Heading/Heading.js';
import {Surface} from '../../../../components/Surface/Surface.js';
import {usePageTitle} from '../../../../hooks/usePageTitle.js';
import {Badge} from '../../../../primitives/Badge/Badge.js';
import {IconButton} from '../../../../primitives/IconButton/IconButton.js';
import {Menu, MenuItem} from '../../../../primitives/Menu/Menu.js';
import {useModals} from '../../../../primitives/modals/ModalsProvider.js';
import {Spinner} from '../../../../primitives/Spinner/Spinner.js';
import {TextInput} from '../../../../primitives/TextInput/TextInput.js';
import {showNotification} from '../../../../primitives/Toast/toastStore.js';
import {Tooltip} from '../../../../primitives/Tooltip/Tooltip.js';
import {notifyErrors} from '../../../../utils/notifications.js';
import {formatDateTime, getTimeAgo} from '../../../../utils/time.js';
import {UserActionTooltip} from '../../../users/UserActionTooltip/UserActionTooltip.js';
import {
  TranslationsDocSummary,
  deleteTranslationsDoc,
  listTranslationsDocs,
  publishTranslations,
} from '../../translations-manager.js';

/** Group used for translations ids without a `/` prefix, e.g. `common`. */
const GLOBAL_GROUP = 'Global';

/** Classes for an id shown inline in confirm dialogs. */
const CODE_CLASSES = 'rounded-sm bg-chip px-1 py-px font-mono text-sm';

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
      <div className="TranslationsManagerPage bg-page">
        <div className="TranslationsManagerPage__layout flex min-h-full flex-col md:flex-row">
          <div className="TranslationsManagerPage__side shrink-0 px-page pt-page md:w-70 md:pb-page md:pr-0">
            <div className="TranslationsManagerPage__sideTitle mb-3 text-base font-semibold leading-tight">
              Translations
            </div>
            <div className="TranslationsManagerPage__sideGroups flex flex-col gap-0.5">
              <TranslationsManagerPage.GroupButton
                icon={<IconLanguage size={16} strokeWidth={1.75} />}
                label="All"
                count={docs.length}
                selected={!selectedGroup}
                onClick={() => setSelectedGroup(null)}
              />
              {groups.map((group) => (
                <TranslationsManagerPage.GroupButton
                  key={group.name}
                  icon={
                    group.name === GLOBAL_GROUP ? (
                      <IconWorld size={16} strokeWidth={1.75} />
                    ) : (
                      <IconFolder size={16} strokeWidth={1.75} />
                    )
                  }
                  label={group.name}
                  count={group.count}
                  selected={selectedGroup === group.name}
                  onClick={() => setSelectedGroup(group.name)}
                />
              ))}
            </div>
          </div>
          <div className="TranslationsManagerPage__main min-w-0 flex-1 p-page">
            <div className="TranslationsManagerPage__mainHeader mb-4 flex flex-wrap items-center justify-between gap-x-5 gap-y-3">
              <Heading size="h1" className="min-w-0 break-words">
                {selectedGroup
                  ? `Translations: ${selectedGroup}`
                  : 'Translations'}
              </Heading>
              <div className="TranslationsManagerPage__mainHeaderControls flex w-full items-center gap-2.5 sm:w-auto">
                <TextInput
                  className="TranslationsManagerPage__mainHeaderSearch w-full sm:w-60"
                  aria-label="Search"
                  placeholder="Search"
                  leftSection={<IconSearch size={16} />}
                  value={searchQuery}
                  onChange={(e: Event) => {
                    setSearchQuery((e.target as HTMLInputElement).value);
                  }}
                />
              </div>
            </div>
            <Surface className="TranslationsManagerPage__mainContent py-2">
              {loading ? (
                <div className="TranslationsManagerPage__loading flex items-center justify-center px-5 py-15 text-base text-muted">
                  <Spinner size="lg" />
                </div>
              ) : filteredDocs.length === 0 ? (
                <div className="TranslationsManagerPage__empty flex items-center justify-center px-5 py-15 text-center text-base text-muted">
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

/** A filter button in the side list of groups. */
TranslationsManagerPage.GroupButton = (props: {
  icon: ComponentChildren;
  label: string;
  count: number;
  selected: boolean;
  onClick: () => void;
}) => {
  return (
    <button
      type="button"
      aria-pressed={props.selected}
      className="TranslationsManagerPage__sideGroup m-0 flex w-full cursor-pointer appearance-none items-center gap-2 rounded-md border-0 bg-transparent px-2.5 py-1.5 text-left font-sans text-sm leading-tight text-fg hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus aria-pressed:bg-surface-active aria-pressed:font-semibold"
      onClick={props.onClick}
    >
      <span className="flex shrink-0">{props.icon}</span>
      <div className="TranslationsManagerPage__sideGroupLabel min-w-0 flex-1 truncate">
        {props.label}
      </div>
      <div className="TranslationsManagerPage__sideGroupCount text-xs text-muted">
        {props.count}
      </div>
    </button>
  );
};

TranslationsManagerPage.DocsList = (props: {
  docs: TranslationsDocSummary[];
  reload: () => void;
}) => {
  return (
    <div className="TranslationsManagerPage__docsList relative overflow-x-auto">
      <div className="TranslationsManagerPage__docsListHeader border-0 border-b border-solid border-border px-5 py-2 text-xs font-semibold uppercase tracking-wide text-muted">
        <div className="TranslationsManagerPage__docsListHeaderCell">ID</div>
        <div className="TranslationsManagerPage__docsListHeaderCell">
          Locales
        </div>
        <div className="TranslationsManagerPage__docsListHeaderCell">
          Status
        </div>
        <div className="TranslationsManagerPage__docsListHeaderCell">
          Modified
        </div>
        <div className="TranslationsManagerPage__docsListHeaderCell">
          Published
        </div>
        <div className="TranslationsManagerPage__docsListHeaderControls">
          <span className="sr-only">Actions</span>
        </div>
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
  const editUrl = `/cms/translations/${doc.id}`;

  function onPublish() {
    modals.openConfirmModal({
      title: `Publish translations: ${doc.id}`,
      children: (
        <div className="TranslationsManagerPage__confirmText text-base leading-normal">
          Are you sure you want to publish the translations for{' '}
          <code className={CODE_CLASSES}>{doc.id}</code>? The translations will
          go live immediately.
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
      title: `Delete translations: ${doc.id}`,
      children: (
        <div className="TranslationsManagerPage__confirmText text-base leading-normal">
          Are you sure you want to delete the translations for{' '}
          <code className={CODE_CLASSES}>{doc.id}</code>? This deletes both the
          draft and published translations and cannot be undone.
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
    <div className="TranslationsManagerPage__docsListDoc border-0 border-b border-solid border-border px-5 py-2 text-sm last:border-b-0">
      <a
        className="TranslationsManagerPage__docsListDocId truncate font-semibold text-fg no-underline underline-offset-4 hover:underline"
        href={editUrl}
      >
        {doc.id}
      </a>
      <div className="TranslationsManagerPage__docsListDocLocales text-sm text-muted">
        <Tooltip label={doc.locales.join(', ') || 'no locales'}>
          <span>
            {doc.locales.length} locale{doc.locales.length === 1 ? '' : 's'}
          </span>
        </Tooltip>
      </div>
      <div className="TranslationsManagerPage__docsListDocStatus">
        {doc.publishedAt ? (
          doc.hasUnpublishedChanges ? (
            <Badge size="xs" variant="gradient" gradient="orange">
              Unpublished changes
            </Badge>
          ) : (
            <Badge size="xs" variant="gradient" gradient="green">
              Published
            </Badge>
          )
        ) : (
          <Badge size="xs" variant="outline">
            Draft
          </Badge>
        )}
      </div>
      <div className="TranslationsManagerPage__docsListDocTimestamp text-sm text-muted">
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
      <div className="TranslationsManagerPage__docsListDocTimestamp text-sm text-muted">
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
      <div className="TranslationsManagerPage__docsListDocControls flex justify-end">
        <Menu
          className="TranslationsManagerPage__docsListDocMenu"
          placement="bottom-end"
          trigger={
            <IconButton label={`Actions for ${doc.id}`} tooltip={false}>
              <IconDotsVertical size={16} />
            </IconButton>
          }
        >
          <MenuItem
            icon={<IconPencil size={16} />}
            onClick={() => route(editUrl)}
          >
            Edit
          </MenuItem>
          <MenuItem icon={<IconRocket size={16} />} onClick={onPublish}>
            Publish…
          </MenuItem>
          <MenuItem icon={<IconTrash size={16} />} danger onClick={onDelete}>
            Delete…
          </MenuItem>
        </Menu>
      </div>
    </div>
  );
};
