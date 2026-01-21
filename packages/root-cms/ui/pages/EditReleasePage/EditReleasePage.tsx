import {ActionIcon, Breadcrumbs, Tooltip} from '@mantine/core';
import {useModals} from '@mantine/modals';
import {showNotification, updateNotification} from '@mantine/notifications';
import {IconTrashFilled} from '@tabler/icons-preact';
import {route} from 'preact-router';
import {ConditionalTooltip} from '../../components/ConditionalTooltip/ConditionalTooltip.js';
import {Heading} from '../../components/Heading/Heading.js';
import {ReleaseForm} from '../../components/ReleaseForm/ReleaseForm.js';
import {Text} from '../../components/Text/Text.js';
import {useModalTheme} from '../../hooks/useModalTheme.js';
import {useProjectRoles} from '../../hooks/useProjectRoles.js';
import {Layout} from '../../layout/Layout.js';
import {testCanPublish} from '../../utils/permissions.js';
import './EditReleasePage.css';
import {deleteRelease} from '../../utils/release.js';

export function EditReleasePage(props: {id: string}) {
  const modals = useModals();
  const modalTheme = useModalTheme();
  const {roles} = useProjectRoles();
  const currentUserEmail = window.firebase.user.email || '';
  const canPublish = testCanPublish(roles, currentUserEmail);

  function onDeleteClicked() {
    const notificationId = `delete-release-${props.id}`;
    const modalId = modals.openConfirmModal({
      ...modalTheme,
      title: 'Delete release',
      children: (
        <Text size="body-sm" weight="semi-bold">
          Are you sure you want to delete release <code>{props.id}</code>? There
          is no undo. This will only delete the release; the docs in the release
          will remain unchanged.
        </Text>
      ),
      labels: {confirm: 'Delete', cancel: 'Cancel'},
      cancelProps: {size: 'xs'},
      confirmProps: {color: 'red', size: 'xs'},
      onCancel: () => console.log('Cancel'),
      closeOnConfirm: false,
      onConfirm: async () => {
        showNotification({
          id: notificationId,
          title: 'Deleting release',
          message: `Deleting ${props.id}...`,
          loading: true,
          autoClose: false,
        });
        await deleteRelease(props.id);
        updateNotification({
          id: notificationId,
          title: 'Deleted release',
          message: `Successfully deleted ${props.id}`,
          loading: false,
          autoClose: 5000,
        });
        modals.closeModal(modalId);
        route('/cms/releases');
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
                label="You don't have access to delete releases"
                condition={!canPublish}
              >
                <Tooltip label="Delete" disabled={!canPublish}>
                  <ActionIcon
                    onClick={onDeleteClicked}
                    loading={!roles}
                    disabled={!canPublish}
                  >
                    <IconTrashFilled size={20} stroke="1.5" />
                  </ActionIcon>
                </Tooltip>
              </ConditionalTooltip>
            </div>
          </div>
        </div>
        <ReleaseForm releaseId={props.id} />
      </div>
    </Layout>
  );
}
