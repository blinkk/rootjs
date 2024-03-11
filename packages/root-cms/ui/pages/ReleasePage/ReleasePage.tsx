import {
  ActionIcon,
  Breadcrumbs,
  Button,
  Loader,
  Table,
  Tooltip,
} from '@mantine/core';
import {useModals} from '@mantine/modals';
import {showNotification, updateNotification} from '@mantine/notifications';
import {IconSettings} from '@tabler/icons-preact';
import {useEffect, useState} from 'preact/hooks';
import {DocPreviewCard} from '../../components/DocPreviewCard/DocPreviewCard.js';
import {Heading} from '../../components/Heading/Heading.js';
import {ReleaseStatusBadge} from '../../components/ReleaseStatusBadge/ReleaseStatusBadge.js';
import {useScheduleReleaseModal} from '../../components/ScheduleReleaseModal/ScheduleReleaseModal.js';
import {Text} from '../../components/Text/Text.js';
import {useModalTheme} from '../../hooks/useModalTheme.js';
import {Layout} from '../../layout/Layout.js';
import {notifyErrors} from '../../utils/notifications.js';
import {
  Release,
  cancelScheduledRelease,
  getRelease,
  publishRelease,
} from '../../utils/release.js';
import {timestamp} from '../../utils/time.js';
import './ReleasePage.css';

export function ReleasePage(props: {id: string}) {
  const [loading, setLoading] = useState(true);
  const [release, setRelease] = useState<Release | null>(null);
  const [updated, setUpdated] = useState(0);
  const id = props.id;

  async function init() {
    setLoading(true);
    await notifyErrors(async () => {
      const release = await getRelease(id);
      setRelease(release);
      setUpdated(timestamp());
    });
    setLoading(false);
  }

  useEffect(() => {
    init();
  }, []);

  function onAction(action: string) {
    console.log('onAction()', action);
    init();
  }

  return (
    <Layout>
      <div className="ReleasePage">
        <div className="ReleasePage__header">
          <Breadcrumbs className="ReleasePage__header__breadcrumbs">
            <a href="/cms/releases">Releases</a>
            <div>{id}</div>
          </Breadcrumbs>
          <div className="ReleasePage__header__titleWrap">
            <Heading size="h1">Release: {id}</Heading>
            <div className="ReleasePage__header__controls">
              <Tooltip label="Configure">
                <ActionIcon
                  component="a"
                  href={`/cms/releases/${props.id}/edit`}
                >
                  <IconSettings size={24} stroke="1.5" />
                </ActionIcon>
              </Tooltip>
            </div>
          </div>
          {release?.description && <Text as="p">{release.description}</Text>}
        </div>

        {loading ? (
          <Loader color="gray" size="xl" />
        ) : (
          <>
            {release && (
              <ReleasePage.PublishStatus
                release={release}
                onAction={onAction}
              />
            )}
            {release && release.docIds && release.docIds.length > 0 && (
              <ReleasePage.DocsList
                release={release}
                key={`docs-list-${updated}`}
              />
            )}
          </>
        )}
      </div>
    </Layout>
  );
}

ReleasePage.PublishStatus = (props: {
  release: Release;
  onAction: (action: string) => void;
}) => {
  const release = props.release;
  const [publishLoading, setPublishLoading] = useState(false);

  const modals = useModals();
  const modalTheme = useModalTheme();
  const scheduleReleaseModal = useScheduleReleaseModal({
    releaseId: release.id,
    onScheduled: () => {
      props.onAction('scheduled');
    },
  });

  function onPublishClicked() {
    const docIds = release.docIds || [];
    if (docIds.length === 0) {
      showNotification({
        title: 'Cannot publish release',
        message: 'Error: no docs in the release to publish.',
        color: 'red',
        autoClose: false,
      });
      return;
    }

    modals.openConfirmModal({
      ...modalTheme,
      title: `Publish release: ${release.id}`,
      children: (
        <Text size="body-sm" weight="semi-bold">
          Are you sure you want to publish this release? The {docIds.length}{' '}
          docs in the release will go live immediately.
        </Text>
      ),
      labels: {confirm: 'Publish', cancel: 'Cancel'},
      cancelProps: {size: 'xs'},
      confirmProps: {color: 'dark', size: 'xs'},
      onCancel: () => console.log('Cancel'),
      closeOnConfirm: true,
      onConfirm: () => {
        publish();
      },
    });
  }

  async function publish() {
    setPublishLoading(true);
    await notifyErrors(async () => {
      const notificationId = `publish-release-${release.id}`;
      const numDocs = release.docIds?.length || 0;
      showNotification({
        id: notificationId,
        title: 'Publishing release',
        message: `Publishing ${numDocs} docs...`,
        loading: true,
        autoClose: false,
      });
      // await cmsPublishDocs(release.docIds || []);
      await publishRelease(release.id);
      updateNotification({
        id: notificationId,
        title: 'Published release!',
        message: `Successfully published ${numDocs} docs!`,
        loading: false,
        autoClose: 5000,
      });
      if (props.onAction) {
        props.onAction('publish');
      }
    });
    setPublishLoading(false);
  }

  function onScheduleClicked() {
    scheduleReleaseModal.open();
  }

  async function onCancelScheduleClicked() {
    await cancelScheduledRelease(release.id);
    props.onAction('cancel-schedule');
  }

  return (
    <div className="ReleasePage__PublishStatus">
      <Heading size="h2">Status</Heading>
      <Table verticalSpacing="xs" striped fontSize="xs">
        <thead>
          <tr>
            <th>status</th>
            <th>actions</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <ReleaseStatusBadge release={release} />
            </td>
            <td>
              <div className="ReleasePage__PublishStatus__actions">
                {!release.scheduledAt && (
                  <Tooltip
                    label="Publish the release immediately"
                    position="bottom"
                    withArrow
                  >
                    <Button
                      variant="default"
                      size="xs"
                      compact
                      onClick={() => onPublishClicked()}
                      loading={publishLoading}
                    >
                      {release.publishedAt ? 'Re-publish' : 'Publish'}
                    </Button>
                  </Tooltip>
                )}
                {release.scheduledAt ? (
                  <Tooltip
                    label="Cancel the scheduled release"
                    position="bottom"
                    withArrow
                  >
                    <Button
                      variant="default"
                      size="xs"
                      compact
                      onClick={() => onCancelScheduleClicked()}
                    >
                      Cancel Schedule
                    </Button>
                  </Tooltip>
                ) : (
                  <Tooltip
                    label="Schedule the release to be published at a future date"
                    position="bottom"
                    withArrow
                    wrapLines
                    width={180}
                  >
                    <Button
                      variant="default"
                      size="xs"
                      compact
                      onClick={() => onScheduleClicked()}
                    >
                      Schedule
                    </Button>
                  </Tooltip>
                )}
              </div>
            </td>
          </tr>
        </tbody>
      </Table>
    </div>
  );
};

ReleasePage.DocsList = (props: {release: Release}) => {
  const release = props.release;
  const docIds = release.docIds || [];
  return (
    <div className="ReleasePage__DocsList">
      <div className="ReleasePage__DocsList__header">
        <Heading size="h2">Docs</Heading>
        <Button
          component="a"
          variant="default"
          size="xs"
          compact
          href={`/cms/releases/${release.id}/edit`}
        >
          Edit
        </Button>
      </div>
      <div className="ReleasePage__DocsList__cards">
        {docIds.map((docId) => (
          <div className="ReleasePage__DocsList__card">
            <a href={`/cms/content/${docId}`}>
              <DocPreviewCard docId={docId} statusBadges />
            </a>
          </div>
        ))}
      </div>
    </div>
  );
};
