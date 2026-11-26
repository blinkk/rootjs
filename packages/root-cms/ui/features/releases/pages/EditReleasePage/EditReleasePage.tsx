import {IconArchive, IconRestore} from '@tabler/icons-preact';
import {useEffect, useState} from 'preact/hooks';
import {useLocation} from 'preact-iso';
import {Layout} from '../../../../app/layout/Layout.js';
import {ConditionalTooltip} from '../../../../components/ConditionalTooltip/ConditionalTooltip.js';
import {Heading} from '../../../../components/Heading/Heading.js';
import {Surface} from '../../../../components/Surface/Surface.js';
import {Text} from '../../../../components/Text/Text.js';
import {useConfirmAction} from '../../../../hooks/useConfirmAction.js';
import {usePageTitle} from '../../../../hooks/usePageTitle.js';
import {Breadcrumbs} from '../../../../primitives/Breadcrumbs/Breadcrumbs.js';
import {IconButton} from '../../../../primitives/IconButton/IconButton.js';
import {useCurrentUserPermissions} from '../../../users/useCurrentUserPermissions.js';
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
  const confirmAction = useConfirmAction();
  const {canPublish, loading: rolesLoading} = useCurrentUserPermissions();

  useEffect(() => {
    getRelease(props.id).then((release) => {
      setRelease(release);
    });
  }, [props.id]);

  function onArchiveClicked() {
    confirmAction({
      title: 'Archive release',
      body: (
        <Text size="body-sm" weight="semi-bold">
          Are you sure you want to archive release <code>{props.id}</code>?
        </Text>
      ),
      confirmLabel: 'Archive',
      danger: true,
      toast: {
        id: `archive-release-${props.id}`,
        loading: {
          title: 'Archiving release',
          message: `Archiving ${props.id}...`,
        },
        success: {
          title: 'Archived release',
          message: `Successfully archived ${props.id}`,
        },
        errorTitle: 'Archive failed',
      },
      action: async () => {
        await archiveRelease(props.id);
        setRelease(await getRelease(props.id));
      },
      onSuccess: () => route('/cms/releases'),
    });
  }

  function onUnarchiveClicked() {
    confirmAction({
      title: 'Unarchive release',
      body: (
        <Text size="body-sm" weight="semi-bold">
          Are you sure you want to unarchive release <code>{props.id}</code>?
        </Text>
      ),
      confirmLabel: 'Unarchive',
      toast: {
        id: `unarchive-release-${props.id}`,
        loading: {
          title: 'Unarchiving release',
          message: `Unarchiving ${props.id}...`,
        },
        success: {
          title: 'Unarchived release',
          message: `Successfully unarchived ${props.id}`,
        },
        errorTitle: 'Unarchive failed',
      },
      action: async () => {
        await unarchiveRelease(props.id);
        setRelease(await getRelease(props.id));
      },
      onSuccess: () => route(`/cms/releases/${props.id}`),
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
                  loading={rolesLoading}
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
