import {useEffect, useState} from 'preact/hooks';
import {ConditionalTooltip} from '../../../../components/ConditionalTooltip/ConditionalTooltip.js';
import {Text} from '../../../../components/Text/Text.js';
import {Button} from '../../../../primitives/Button/Button.js';
import {DialogFooter} from '../../../../primitives/Dialog/Dialog.js';
import {useModals} from '../../../../primitives/modals/ModalsProvider.js';
import {Spinner} from '../../../../primitives/Spinner/Spinner.js';
import {notifyErrors} from '../../../../utils/notifications.js';
import {getTimeAgo} from '../../../../utils/time.js';
import {testCanPublish} from '../../../users/permissions.js';
import {useProjectRoles} from '../../../users/useProjectRoles.js';
import {
  DataSource,
  DataSourceData,
  getFromDataSource,
} from '../../data-source.js';
import {useDataSourceAction} from '../../useDataSourceAction.js';
import {DataSourceDiff} from '../DataSourceDiff/DataSourceDiff.js';

/**
 * Returns a function that opens a modal comparing a data source's synced
 * (draft) data with its published data.
 */
export function useDataSourceChangesModal() {
  const modals = useModals();
  return {
    open: (dataSource: DataSource, options?: {onPublish?: () => void}) => {
      const modalId = modals.openModal({
        title: `Unpublished changes in ${dataSource.id}`,
        size: 'xl',
        children: (
          <DataSourceChangesModal
            dataSource={dataSource}
            onClose={() => modals.closeModal(modalId)}
            onPublish={() => {
              modals.closeModal(modalId);
              options?.onPublish?.();
            }}
          />
        ),
      });
    },
  };
}

interface DataSourceChangesModalProps {
  dataSource: DataSource;
  onClose: () => void;
  onPublish: () => void;
}

/** The body of the changes modal, with Close and Publish in its footer. */
export function DataSourceChangesModal(props: DataSourceChangesModalProps) {
  const dataSource = props.dataSource;
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<DataSourceData | null>(null);
  const [published, setPublished] = useState<DataSourceData | null>(null);
  const publish = useDataSourceAction(dataSource, 'publish', props.onPublish);
  const {roles} = useProjectRoles();
  const canPublish = testCanPublish(roles, window.firebase.user.email || '');

  useEffect(() => {
    notifyErrors(async () => {
      const [draftData, publishedData] = await Promise.all([
        getFromDataSource(dataSource.id, {mode: 'draft'}),
        getFromDataSource(dataSource.id, {mode: 'published'}),
      ]);
      setDraft(draftData);
      setPublished(publishedData);
    }).finally(() => setLoading(false));
  }, [dataSource.id]);

  return (
    <div className="DataSourceChangesModal">
      <Text
        as="p"
        size="body-sm"
        color="gray"
        className="DataSourceChangesModal__summary mb-4 mt-0"
      >
        Synced {formatTimeAgo(dataSource.syncedAt)}, compared with what was
        published {formatTimeAgo(dataSource.publishedAt)}.
      </Text>
      {loading ? (
        <div className="DataSourceChangesModal__loading flex justify-center p-5 text-muted">
          <Spinner size="lg" />
        </div>
      ) : (
        <DataSourceDiff
          dataSource={dataSource}
          draft={draft}
          published={published}
        />
      )}
      <DialogFooter>
        <Button onClick={() => props.onClose()}>Close</Button>
        <ConditionalTooltip
          label="You don't have access to publish this data source"
          condition={!canPublish}
        >
          <Button
            variant="blue"
            loading={publish.loading}
            disabled={!canPublish}
            onClick={() => publish.run()}
          >
            Publish changes
          </Button>
        </ConditionalTooltip>
      </DialogFooter>
    </div>
  );
}

function formatTimeAgo(ts?: {toMillis?: () => number}): string {
  const millis = ts?.toMillis?.();
  return millis ? getTimeAgo(millis) : 'never';
}
