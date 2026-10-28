import {IconArchive, IconRestore} from '@tabler/icons-preact';
import {useEffect, useState} from 'preact/hooks';
import {useLocation} from 'preact-iso';
import {Layout} from '../../../../app/layout/Layout.js';
import {ConditionalTooltip} from '../../../../components/ConditionalTooltip/ConditionalTooltip.js';
import {Heading} from '../../../../components/Heading/Heading.js';
import {Surface} from '../../../../components/Surface/Surface.js';
import {Text} from '../../../../components/Text/Text.js';
import {usePageTitle} from '../../../../hooks/usePageTitle.js';
import {Breadcrumbs} from '../../../../primitives/Breadcrumbs/Breadcrumbs.js';
import {IconButton} from '../../../../primitives/IconButton/IconButton.js';
import {useModals} from '../../../../primitives/modals/ModalsProvider.js';
import {
  showNotification,
  updateNotification,
} from '../../../../primitives/Toast/toastStore.js';
import {testCanPublish} from '../../../users/permissions.js';
import {useProjectRoles} from '../../../users/useProjectRoles.js';
import {ReleaseForm} from '../../components/ReleaseForm/ReleaseForm.js';
import {
  Release,
  archiveRelease,
  getRelease,
  unarchiveRelease,
} from '../../release.js';

export function EditReleasePage(props: {id: string}) {
  usePageTitle(`Edit release: ${props.id}`);
  const {route} = useLocation();
  const [release, setRelease] = useState<Release | null>(null);
  const modals = useModals();
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

  const archived = Boolean(release?.archivedAt);

  return (
    <Layout>
      <div className="EditReleasePage bg-page p-page">
        <div className="EditReleasePage__header mb-5 max-w-150">
          <Breadcrumbs
            className="EditReleasePage__breadcrumbs mb-3"
            items={[
              {label: 'Releases', href: '/cms/releases'},
              {label: props.id, href: `/cms/releases/${props.id}`},
              {label: 'Edit'},
            ]}
          />
          <div className="EditReleasePage__titleWrap flex items-center gap-4">
            <Heading size="h1" className="min-w-0 break-words">
              Edit release: {props.id}
            </Heading>
            <div className="EditReleasePage__controls flex shrink-0 items-center">
              <ConditionalTooltip
                label="You don't have access to archive releases"
                condition={!canPublish}
              >
                <IconButton
                  label={archived ? 'Unarchive' : 'Archive'}
                  tooltip={canPublish}
                  onClick={archived ? onUnarchiveClicked : onArchiveClicked}
                  loading={!roles}
                  disabled={!canPublish}
                >
                  {archived ? (
                    <IconRestore stroke="1.5" />
                  ) : (
                    <IconArchive stroke="1.5" />
                  )}
                </IconButton>
              </ConditionalTooltip>
            </div>
          </div>
        </div>
        <Surface className="EditReleasePage__form max-w-172 p-4 md:p-5">
          <ReleaseForm releaseId={props.id} />
        </Surface>
      </div>
    </Layout>
  );
}
