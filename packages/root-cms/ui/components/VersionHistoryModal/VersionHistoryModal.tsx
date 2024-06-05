import {Button, Loader, Table} from '@mantine/core';
import {ContextModalProps, useModals} from '@mantine/modals';
import {showNotification} from '@mantine/notifications';
import {IconArrowUpRight, IconHistory} from '@tabler/icons-preact';
import {useEffect, useState} from 'preact/hooks';
import {useModalTheme} from '../../hooks/useModalTheme.js';
import {Version, cmsListVersions, cmsRestoreVersion} from '../../utils/doc.js';
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
  const {innerProps: props} = modalProps;
  const docId = props.docId;
  const [loading, setLoading] = useState(true);
  const [versions, setVersions] = useState<Version[]>([]);

  const dateFormat = new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  async function fetchVersions() {
    setLoading(true);
    const versions = await cmsListVersions(docId);
    setLoading(false);
    setVersions(versions);
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

  function getCompareUrl(version: Version) {
    const left = toUrlParam(docId, version._versionId);
    const right = toUrlParam(docId, 'draft');
    return `/cms/compare?left=${left}&right=${right}`;
  }

  useEffect(() => {
    fetchVersions();
  }, []);

  if (loading) {
    return <Loader />;
  }
  return (
    <div className="VersionHistoryModal">
      <Heading className="VersionHistoryModal__title" size="h2">
        <IconHistory strokeWidth={1.5} />
        <span>Version history</span>
      </Heading>
      <div className="VersionHistoryModal__docId">
        <code>{docId}</code>
      </div>
      {versions.length === 0 ? (
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
              <th>modified at</th>
              <th>modified by</th>
              <th>actions</th>
            </tr>
          </thead>
          <tbody>
            {versions.map((version, i) => (
              <tr>
                <td>
                  <Text size="body-sm">
                    {dateFormat.format(version.sys.modifiedAt.toDate())}
                  </Text>
                </td>
                <td>
                  <Text size="body-sm">{version.sys.modifiedBy}</Text>
                </td>
                <td>
                  <div className="VersionHistoryModal__versions__buttons">
                    <Button
                      variant="default"
                      size="xs"
                      compact
                      onClick={() => restore(version)}
                    >
                      restore
                    </Button>
                    <Button
                      className="VersionHistoryModal__versions__buttons__compare"
                      component="a"
                      variant="default"
                      size="xs"
                      compact
                      href={getCompareUrl(version)}
                      target="_blank"
                      rightIcon={<IconArrowUpRight size={12} />}
                    >
                      compare
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
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

VersionHistoryModal.id = MODAL_ID;
