import {Button, Checkbox, Loader, Table} from '@mantine/core';
import {ContextModalProps, useModals} from '@mantine/modals';
import {showNotification} from '@mantine/notifications';
import {IconArrowUpRight, IconCopy, IconHistory} from '@tabler/icons-preact';
import {useEffect, useState} from 'preact/hooks';
import {useModalTheme} from '../../hooks/useModalTheme.js';
import {
  Version,
  cmsListVersions,
  cmsReadDocVersion,
  cmsRestoreVersion,
} from '../../utils/doc.js';
import {useCopyDocModal} from '../CopyDocModal/CopyDocModal.js';
import {Heading} from '../Heading/Heading.js';
import {Text} from '../Text/Text.js';
import './VersionHistoryModal.css';

const MODAL_ID = 'VersionHistoryModal';

export interface VersionHistoryModalProps {
  [key: string]: unknown;
  docId: string;
  onRestore?: (data: {version: Version}) => any;
}

export function useVersionHistoryModal(props: VersionHistoryModalProps) {
  const modals = useModals();
  const modalTheme = useModalTheme();
  return {
    open: () => {
      modals.openContextModal(MODAL_ID, {
        ...modalTheme,
        innerProps: props,
        size: 'min(calc(100% - 32px), 720px)',
      });
    },
  };
}

export function VersionHistoryModal(
  modalProps: ContextModalProps<VersionHistoryModalProps>
) {
  const {innerProps: props, context, id} = modalProps;
  const docId = props.docId;
  const [loading, setLoading] = useState(true);
  const [versions, setVersions] = useState<Version[]>([]);
  const [selectedVersions, setSelectedVersions] = useState<string[]>([]);
  const [showPublishedOnly, setShowPublishedOnly] = useState(false);
  const copyDocModal = useCopyDocModal({fromDocId: docId});

  const dateFormat = new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  async function fetchVersions() {
    setLoading(true);
    const [savedVersions, draftDoc] = await Promise.all([
      cmsListVersions(docId),
      cmsReadDocVersion(docId, 'draft'),
    ]);

    // Add a virtual "draft" version at the top.
    const draftVersion: Version = {
      _versionId: 'draft',
      sys: {
        modifiedAt:
          draftDoc?.sys?.modifiedAt || ({toDate: () => new Date()} as any),
        modifiedBy: draftDoc?.sys?.modifiedBy || 'Unknown',
      },
    } as any;
    setVersions([draftVersion, ...savedVersions]);
    setSelectedVersions(['draft']);
    setLoading(false);
  }

  async function restore(version: Version) {
    await cmsRestoreVersion(docId, version);
    showNotification({
      title: 'Saved!',
      message: `Restored ${docId} to ${dateFormat.format(
        version.sys.modifiedAt.toDate()
      )}.`,
      autoClose: 5000,
    });
    if (props.onRestore) {
      props.onRestore({version});
    }
  }

  function copyToNewDoc(version: Version) {
    let label = `${docId}@${version._versionId}`;
    const modifiedAt = version.sys?.modifiedAt?.toDate();
    if (modifiedAt) {
      const isoDate = formatIsoDate(modifiedAt);
      label = `${docId}@${isoDate}`;
    }
    copyDocModal.open({
      fields: version.fields || {},
      fromLabel: label,
      onSuccess: () => {
        context.closeModal(id);
      },
    });
  }

  function toggleVersion(versionId: string) {
    if (selectedVersions.includes(versionId)) {
      setSelectedVersions(selectedVersions.filter((id) => id !== versionId));
    } else {
      if (selectedVersions.length < 2) {
        setSelectedVersions([...selectedVersions, versionId]);
      }
    }
  }

  function getCompareUrl() {
    if (selectedVersions.length !== 2) {
      return '#';
    }
    const v1 = versions.find((v) => v._versionId === selectedVersions[0]);
    const v2 = versions.find((v) => v._versionId === selectedVersions[1]);
    if (!v1 || !v2) {
      return '#';
    }

    // We want the older one on the left.
    // Since `versions` is sorted DESC (newest first), the one with higher index is older.
    const idx1 = versions.indexOf(v1);
    const idx2 = versions.indexOf(v2);

    const left = idx1 > idx2 ? v1 : v2;
    const right = idx1 > idx2 ? v2 : v1;

    const leftParam = toUrlParam(docId, left._versionId);
    const rightParam = toUrlParam(docId, right._versionId);
    return `/cms/compare?left=${leftParam}&right=${rightParam}`;
  }

  useEffect(() => {
    fetchVersions();
  }, []);

  const filteredVersions = versions.filter((v) => {
    if (v._versionId === 'draft') {
      return true;
    }
    if (!showPublishedOnly) {
      return true;
    }
    return v.tags?.includes('published');
  });

  const hasPublishedVersions = versions.some(
    (v) => v.tags?.includes('published')
  );

  if (loading) {
    return <Loader />;
  }
  return (
    <div className="VersionHistoryModal">
      <div className="VersionHistoryModal__header">
        <Heading className="VersionHistoryModal__title" size="h2">
          <IconHistory strokeWidth={1.5} />
          <span>Version history</span>
        </Heading>
      </div>
      <div className="VersionHistoryModal__docId">
        <code>{docId}</code>
      </div>
      <div className="VersionHistoryModal__actions">
        <Button
          component={selectedVersions.length === 2 ? 'a' : 'button'}
          variant="filled"
          size="xs"
          disabled={selectedVersions.length !== 2}
          href={selectedVersions.length === 2 ? getCompareUrl() : undefined}
          target={selectedVersions.length === 2 ? '_blank' : undefined}
          rightIcon={<IconArrowUpRight size={16} />}
        >
          Compare
        </Button>
        {hasPublishedVersions && (
          <Checkbox
            size="xs"
            label="Published versions only"
            checked={showPublishedOnly}
            onChange={(e: any) => setShowPublishedOnly(e.currentTarget.checked)}
          />
        )}
      </div>
      {filteredVersions.length === 0 ? (
        <Text className="VersionHistoryModal__versionsEmpty" size="body">
          <p>No versions found.</p>
          <p className="VersionHistoryModal__versionsEmpty__developer">
            For developers: Configure the Root CMS cron job to populate
            versions.
          </p>
        </Text>
      ) : (
        <Table className="VersionHistoryModal__versions">
          <thead>
            <tr>
              <th style={{width: '40px'}}></th>
              <th>modified at</th>
              <th>modified by</th>
              <th>actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredVersions.map((version) => {
              const isDraft = version._versionId === 'draft';
              const isSelected = selectedVersions.includes(version._versionId);
              const isDisabled = !isSelected && selectedVersions.length >= 2;

              return (
                <tr key={version._versionId}>
                  <td>
                    <Checkbox
                      size="sm"
                      checked={isSelected}
                      disabled={isDisabled}
                      onChange={() => toggleVersion(version._versionId)}
                      style={{cursor: 'pointer'}}
                    />
                  </td>
                  <td>
                    <Text size="body-sm">
                      {isDraft ? (
                        <span title="Current Draft">
                          {dateFormat.format(version.sys.modifiedAt.toDate())}{' '}
                          (Latest)
                        </span>
                      ) : (
                        <>
                          {dateFormat.format(version.sys.modifiedAt.toDate())}
                          {version.tags?.includes('published') && (
                            <span style={{marginLeft: '4px', opacity: 0.5}}>
                              (Published)
                            </span>
                          )}
                        </>
                      )}
                    </Text>
                  </td>
                  <td>
                    <Text size="body-sm">{version.sys.modifiedBy}</Text>
                  </td>
                  <td>
                    <div className="VersionHistoryModal__versions__buttons">
                      {!isDraft && (
                        <>
                          <Button
                            variant="default"
                            size="xs"
                            compact
                            onClick={() => restore(version)}
                          >
                            restore
                          </Button>
                          <Button
                            variant="default"
                            size="xs"
                            compact
                            onClick={() => copyToNewDoc(version)}
                            leftIcon={<IconCopy size={12} />}
                          >
                            copy to doc
                          </Button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
    </div>
  );
}

function toUrlParam(docId: string, versionId: string): string {
  return encodeURIComponent(`${docId}@${versionId}`)
    .replaceAll('%2F', '/')
    .replaceAll('%40', '@');
}

function formatIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

VersionHistoryModal.id = MODAL_ID;
