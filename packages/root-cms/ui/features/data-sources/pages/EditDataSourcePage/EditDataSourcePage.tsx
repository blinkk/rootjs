import {
  IconArchive,
  IconCloudOff,
  IconDotsVertical,
  IconRestore,
  IconTrash,
} from '@tabler/icons-preact';
import {useEffect, useState} from 'preact/hooks';
import {useLocation} from 'preact-iso';
import {Layout} from '../../../../app/layout/Layout.js';
import {Heading} from '../../../../components/Heading/Heading.js';
import {Text} from '../../../../components/Text/Text.js';
import {usePageTitle} from '../../../../hooks/usePageTitle.js';
import {Breadcrumbs} from '../../../../primitives/Breadcrumbs/Breadcrumbs.js';
import {IconButton} from '../../../../primitives/IconButton/IconButton.js';
import {Menu, MenuDivider, MenuItem} from '../../../../primitives/Menu/Menu.js';
import {useModals} from '../../../../primitives/modals/ModalsProvider.js';
import {Spinner} from '../../../../primitives/Spinner/Spinner.js';
import {
  showNotification,
  updateNotification,
} from '../../../../primitives/Toast/toastStore.js';
import {notifyErrors} from '../../../../utils/notifications.js';
import {testCanPublish} from '../../../users/permissions.js';
import {useProjectRoles} from '../../../users/useProjectRoles.js';
import {DataSourceForm} from '../../components/DataSourceForm/DataSourceForm.js';
import {DataSourceStatusBadge} from '../../components/DataSourceStatusBadge/DataSourceStatusBadge.js';
import {
  DataSource,
  archiveDataSource,
  deleteDataSource,
  getDataSource,
  unarchiveDataSource,
  unpublishDataSource,
} from '../../data-source.js';

export function EditDataSourcePage(props: {id: string}) {
  usePageTitle(`Edit Data Source: ${props.id}`);
  const {route} = useLocation();
  const [loading, setLoading] = useState(true);
  const [dataSource, setDataSource] = useState<DataSource | null>(null);
  const modals = useModals();
  const {roles} = useProjectRoles();
  const currentUserEmail = window.firebase.user.email || '';
  const canPublish = testCanPublish(roles, currentUserEmail);

  useEffect(() => {
    setLoading(true);
    notifyErrors(async () => {
      setDataSource(await getDataSource(props.id));
    }).finally(() => setLoading(false));
  }, [props.id]);

  function onDeleteClicked() {
    const notificationId = `delete-data-source-${props.id}`;
    const modalId = modals.openConfirmModal({
      title: 'Delete data source',
      children: (
        <Text size="body-sm" weight="semi-bold">
          Are you sure you want to delete data source <code>{props.id}</code>?
          All previously synced data will be deleted. There is no undo.
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
          title: 'Deleting data source',
          message: `Deleting ${props.id} and synced data...`,
          loading: true,
          autoClose: false,
        });
        await deleteDataSource(props.id);
        updateNotification({
          id: notificationId,
          title: 'Deleted data source',
          message: `Successfully deleted ${props.id}`,
          loading: false,
          autoClose: 5000,
        });
        modals.closeModal(modalId);
        route('/cms/data');
      },
    });
  }

  function onArchiveClicked() {
    const notificationId = `archive-data-source-${props.id}`;
    const isPublished = Boolean(dataSource?.publishedAt);
    const modalId = modals.openConfirmModal({
      title: 'Archive data source',
      children: (
        <Text size="body-sm" weight="semi-bold">
          Are you sure you want to archive data source <code>{props.id}</code>?
          Archived data sources cannot be synced or published.
          {isPublished && (
            <>
              {' '}
              Note: previously published data will remain available until the
              data source is unpublished.
            </>
          )}
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
          title: 'Archiving data source',
          message: `Archiving ${props.id}...`,
          loading: true,
          autoClose: false,
        });
        await archiveDataSource(props.id);
        const newDataSource = await getDataSource(props.id);
        setDataSource(newDataSource);
        updateNotification({
          id: notificationId,
          title: 'Archived data source',
          message: `Successfully archived ${props.id}`,
          loading: false,
          autoClose: 5000,
        });
        modals.closeModal(modalId);
        route('/cms/data');
      },
    });
  }

  function onUnarchiveClicked() {
    const notificationId = `unarchive-data-source-${props.id}`;
    const modalId = modals.openConfirmModal({
      title: 'Unarchive data source',
      children: (
        <Text size="body-sm" weight="semi-bold">
          Are you sure you want to unarchive data source <code>{props.id}</code>
          ?
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
          title: 'Unarchiving data source',
          message: `Unarchiving ${props.id}...`,
          loading: true,
          autoClose: false,
        });
        await unarchiveDataSource(props.id);
        const newDataSource = await getDataSource(props.id);
        setDataSource(newDataSource);
        updateNotification({
          id: notificationId,
          title: 'Unarchived data source',
          message: `Successfully unarchived ${props.id}`,
          loading: false,
          autoClose: 5000,
        });
        modals.closeModal(modalId);
        route(`/cms/data/${props.id}`);
      },
    });
  }

  function onUnpublishClicked() {
    const notificationId = `unpublish-data-source-${props.id}`;
    const modalId = modals.openConfirmModal({
      title: 'Unpublish data source',
      children: (
        <Text size="body-sm" weight="semi-bold">
          Are you sure you want to unpublish data source <code>{props.id}</code>
          ? The published data will be removed and will no longer be available
          to production. There is no undo.
        </Text>
      ),
      labels: {confirm: 'Unpublish', cancel: 'Cancel'},
      cancelProps: {size: 'xs'},
      confirmProps: {color: 'red', size: 'xs'},
      onCancel: () => console.log('Cancel'),
      closeOnConfirm: false,
      onConfirm: async () => {
        showNotification({
          id: notificationId,
          title: 'Unpublishing data source',
          message: `Unpublishing ${props.id}...`,
          loading: true,
          autoClose: false,
        });
        await unpublishDataSource(props.id);
        const newDataSource = await getDataSource(props.id);
        setDataSource(newDataSource);
        updateNotification({
          id: notificationId,
          title: 'Unpublished data source',
          message: `Successfully unpublished ${props.id}`,
          loading: false,
          autoClose: 5000,
        });
        modals.closeModal(modalId);
      },
    });
  }

  const isPublished = Boolean(dataSource?.publishedAt);
  const isArchived = Boolean(dataSource?.archivedAt);

  return (
    <Layout>
      <div className="EditDataSourcePage bg-page px-page pt-page">
        <div className="EditDataSourcePage__content max-w-180">
          <Breadcrumbs
            className="EditDataSourcePage__breadcrumbs mb-3"
            items={[
              {label: 'Data Sources', href: '/cms/data'},
              {label: props.id, href: `/cms/data/${props.id}`},
              {label: 'Edit'},
            ]}
          />
          {loading ? (
            <Spinner size="lg" className="text-muted" />
          ) : dataSource ? (
            <>
              <div className="EditDataSourcePage__header mb-7 flex items-start gap-4">
                <div className="EditDataSourcePage__header__text min-w-0 grow">
                  <div className="EditDataSourcePage__title flex flex-wrap items-center gap-2.5">
                    <Heading
                      size="h1"
                      weight="semi-bold"
                      className="min-w-0 wrap-anywhere"
                    >
                      {props.id}
                    </Heading>
                    <DataSourceStatusBadge dataSource={dataSource} />
                  </div>
                  <Text as="p" color="gray" className="mb-0 mt-2 max-w-prose">
                    Changes apply from the next sync. Data that’s already
                    published stays live until you publish again.
                  </Text>
                </div>
                <Menu
                  placement="bottom-end"
                  trigger={
                    <IconButton label="More actions" variant="default">
                      <IconDotsVertical stroke="1.5" />
                    </IconButton>
                  }
                >
                  {isPublished && !isArchived && (
                    <MenuItem
                      icon={<IconCloudOff stroke="1.5" />}
                      disabled={!canPublish}
                      onClick={onUnpublishClicked}
                    >
                      Unpublish
                    </MenuItem>
                  )}
                  {isArchived ? (
                    <MenuItem
                      icon={<IconRestore stroke="1.5" />}
                      disabled={!canPublish}
                      onClick={onUnarchiveClicked}
                    >
                      Unarchive
                    </MenuItem>
                  ) : (
                    <MenuItem
                      icon={<IconArchive stroke="1.5" />}
                      disabled={!canPublish}
                      onClick={onArchiveClicked}
                    >
                      Archive
                    </MenuItem>
                  )}
                  <MenuDivider />
                  <MenuItem
                    icon={<IconTrash stroke="1.5" />}
                    danger
                    onClick={onDeleteClicked}
                  >
                    Delete data source
                  </MenuItem>
                </Menu>
              </div>
              <DataSourceForm dataSource={dataSource} />
            </>
          ) : (
            <Text className="EditDataSourcePage__notFound">
              Data source not found.
            </Text>
          )}
        </div>
      </div>
    </Layout>
  );
}
