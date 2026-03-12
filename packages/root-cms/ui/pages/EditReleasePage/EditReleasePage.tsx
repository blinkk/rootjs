import {ActionIcon, Breadcrumbs, Tooltip} from '@mantine/core';
import {useModals} from '@mantine/modals';
import {showNotification, updateNotification} from '@mantine/notifications';
import {IconArchive, IconRestore} from '@tabler/icons-preact';
import {useEffect, useState} from 'preact/hooks';
import {useLocation} from 'preact-iso';
import {ConditionalTooltip} from '../../components/ConditionalTooltip/ConditionalTooltip.js';
import {Heading} from '../../components/Heading/Heading.js';
import {ReleaseForm} from '../../components/ReleaseForm/ReleaseForm.js';
import {Text} from '../../components/Text/Text.js';
import {useModalTheme} from '../../hooks/useModalTheme.js';
import {useProjectRoles} from '../../hooks/useProjectRoles.js';
import {Layout} from '../../layout/Layout.js';
import {testCanPublish} from '../../utils/permissions.js';
import './EditReleasePage.css';
import {
  Release,
  archiveRelease,
  getRelease,
  unarchiveRelease,
} from '../../utils/release.js';

export function EditReleasePage(props: {id: string}) {
  const {route} = useLocation();
  const [release, setRelease] = useState<Release | null>(null);
  const modals = useModals();
  const modalTheme = useModalTheme();
  const {roles} = useProjectRoles();
  const currentUserEmail = window.firebase.user.email || '';
  const canPublish = testCanPublish(roles, currentUserEmail);

  useEffect(() => {
    getRelease(props.id).then((release) => {
      setRelease(release);
    });
  }, [props.id]);

  function onArchiveClicked() {
    const notificationId = `archive-release-${props.id}`;
    const modalId = modals.openConfirmModal({
      ...modalTheme,
      title: 'Archive release',
      children: (
        <Text size="body-sm" weight="semi-bold">
          Are you sure you want to archive release <code>{props.id}</code>?
        </Text>
      ),
      labels: {confirm: 'Archive', cancel: 'Cancel'},
      cancelProps: {size: 'xs'},
      confirmProps: {color: 'red', size: 'xs'},
      onCancel: () => console.log('Cancel'),
      closeOnConfirm: false,
      onConfirm: async () => {
        showNotification({
          id: notificationId,
          title: 'Archiving release',
          message: `Archiving ${props.id}...`,
          loading: true,
          autoClose: false,
        });
        await archiveRelease(props.id);
        const newRelease = await getRelease(props.id);
        setRelease(newRelease);
        updateNotification({
          id: notificationId,
          title: 'Archived release',
          message: `Successfully archived ${props.id}`,
          loading: false,
          autoClose: 5000,
        });
        modals.closeModal(modalId);
        route('/cms/releases');
      },
    });
  }

  function onUnarchiveClicked() {
    const notificationId = `unarchive-release-${props.id}`;
    const modalId = modals.openConfirmModal({
      ...modalTheme,
      title: 'Unarchive release',
      children: (
        <Text size="body-sm" weight="semi-bold">
          Are you sure you want to unarchive release <code>{props.id}</code>?
        </Text>
      ),
      labels: {confirm: 'Unarchive', cancel: 'Cancel'},
      cancelProps: {size: 'xs'},
      confirmProps: {color: 'dark', size: 'xs'},
      onCancel: () => console.log('Cancel'),
      closeOnConfirm: false,
      onConfirm: async () => {
        showNotification({
          id: notificationId,
          title: 'Unarchiving release',
          message: `Unarchiving ${props.id}...`,
          loading: true,
          autoClose: false,
        });
        await unarchiveRelease(props.id);
        const newRelease = await getRelease(props.id);
        setRelease(newRelease);
        updateNotification({
          id: notificationId,
          title: 'Unarchived release',
          message: `Successfully unarchived ${props.id}`,
          loading: false,
          autoClose: 5000,
        });
        modals.closeModal(modalId);
        route(`/cms/releases/${props.id}`);
      },
    });
  }

  return (
    <Layout>
      <div className="EditReleasePage">
        <div className="EditReleasePage__header">
          <Breadcrumbs className="EditReleasePage__header__breadcrumbs">
            <a href="/cms/releases">Releases</a>
            <a href={`/cms/releases/${props.id}`}>{props.id}</a>
            <div>Edit</div>
          </Breadcrumbs>
          <div className="EditReleasePage__header__titleWrap">
            <Heading size="h1">Edit Release: {props.id}</Heading>
            <div className="EditReleasePage__header__controls">
              <ConditionalTooltip
                label="You don't have access to archive releases"
                condition={!canPublish}
              >
                {release?.archivedAt ? (
                  <Tooltip label="Unarchive" disabled={!canPublish}>
                    <ActionIcon
                      onClick={onUnarchiveClicked}
                      loading={!roles}
                      disabled={!canPublish}
                    >
                      <IconRestore size={20} stroke="1.5" />
                    </ActionIcon>
                  </Tooltip>
                ) : (
                  <Tooltip label="Archive" disabled={!canPublish}>
                    <ActionIcon
                      onClick={onArchiveClicked}
                      loading={!roles}
                      disabled={!canPublish}
                    >
                      <IconArchive size={20} stroke="1.5" />
                    </ActionIcon>
                  </Tooltip>
                )}
              </ConditionalTooltip>
            </div>
          </div>
        </div>
        <ReleaseForm releaseId={props.id} />
      </div>
    </Layout>
  );
}
