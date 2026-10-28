import {
  IconArrowUpRight,
  IconCopy,
  IconMessage,
  IconRocket,
} from '@tabler/icons-preact';
import {QueryDocumentSnapshot} from 'firebase/firestore';
import {useEffect, useRef, useState} from 'preact/hooks';
import {Text} from '../../../../components/Text/Text.js';
import {Button} from '../../../../primitives/Button/Button.js';
import {Checkbox} from '../../../../primitives/Checkbox/Checkbox.js';
import {IconButton} from '../../../../primitives/IconButton/IconButton.js';
import {
  type ContextModalProps,
  useModals,
} from '../../../../primitives/modals/ModalsProvider.js';
import {Popover} from '../../../../primitives/Popover/Popover.js';
import {Spinner} from '../../../../primitives/Spinner/Spinner.js';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from '../../../../primitives/Table/Table.js';
import {showNotification} from '../../../../primitives/Toast/toastStore.js';
import {notifyErrors} from '../../../../utils/notifications.js';
import {withTimeout} from '../../../../utils/with-timeout.js';
import {useCopyDocModal} from '../../../collections/components/CopyDocModal/CopyDocModal.js';
import {
  Version,
  cmsListVersions,
  cmsReadDocVersion,
  cmsRestoreVersion,
} from '../../doc.js';

const MODAL_ID = 'VersionHistoryModal';
const PAGE_SIZE = 50;

/**
 * Dispatched on `window` after a doc is restored to an earlier version. The
 * event detail is a {@link DocRestoredEventDetail}.
 */
export const DOC_RESTORED_EVENT = 'root:doc-restored';

export interface DocRestoredEventDetail {
  /** The id of the restored doc, e.g. `Pages/foo`. */
  docId: string;
}

export interface VersionHistoryModalProps {
  [key: string]: unknown;
  docId: string;
  onRestore?: (data: {version: Version}) => any;
}

export function useVersionHistoryModal(props: VersionHistoryModalProps) {
  // Degrade gracefully when rendered outside a `ModalsProvider` (e.g. visual
  // tests that render badges in isolation).
  let modals: ReturnType<typeof useModals> | null = null;
  try {
    modals = useModals();
  } catch {
    modals = null;
  }
  return {
    enabled: modals !== null,
    open: () => {
      if (!modals) {
        console.warn(
          'useVersionHistoryModal() requires a <ModalsProvider> context.'
        );
        return;
      }
      modals.openContextModal(MODAL_ID, {
        title: `Version history: ${props.docId}`,
        innerProps: props,
        overflow: 'inside',
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
  const [loadingMore, setLoadingMore] = useState(false);
  const [versions, setVersions] = useState<Version[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [selectedVersions, setSelectedVersions] = useState<string[]>([]);
  const [showPublishedOnly, setShowPublishedOnly] = useState(false);
  const [openTooltip, setOpenTooltip] = useState<string | null>(null);
  const cursorRef = useRef<QueryDocumentSnapshot | null>(null);
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
    await notifyErrors(async () => {
      const [result, draftDoc] = await withTimeout(
        Promise.all([
          cmsListVersions(docId, {limit: PAGE_SIZE}),
          cmsReadDocVersion(docId, 'draft'),
        ]),
        undefined,
        'loading version history'
      );

      cursorRef.current = result.lastDoc;
      setHasMore(result.hasMore);

      // Add a virtual "draft" version at the top.
      const draftVersion: Version = {
        _versionId: 'draft',
        sys: {
          modifiedAt:
            draftDoc?.sys?.modifiedAt || ({toDate: () => new Date()} as any),
          modifiedBy: draftDoc?.sys?.modifiedBy || 'Unknown',
        },
      } as any;
      setVersions([draftVersion, ...result.versions]);
      setSelectedVersions(['draft']);
    });
    setLoading(false);
  }

  async function loadMore() {
    if (!hasMore || loadingMore) return;
    setLoadingMore(true);
    await notifyErrors(async () => {
      const result = await withTimeout(
        cmsListVersions(docId, {
          limit: PAGE_SIZE,
          cursor: cursorRef.current!,
        }),
        undefined,
        'loading version history'
      );
      cursorRef.current = result.lastDoc;
      setHasMore(result.hasMore);
      setVersions((prev) => [...prev, ...result.versions]);
    });
    setLoadingMore(false);
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
    window.dispatchEvent(
      new CustomEvent<DocRestoredEventDetail>(DOC_RESTORED_EVENT, {
        detail: {docId},
      })
    );
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

  const hasPublishedVersions = versions.some((v) =>
    v.tags?.includes('published')
  );

  if (loading) {
    return (
      <div className="VersionHistoryModal VersionHistoryModal--loading flex justify-center py-6">
        <Spinner size="lg" />
      </div>
    );
  }
  const canCompare = selectedVersions.length === 2;
  return (
    <div className="VersionHistoryModal">
      <div className="VersionHistoryModal__actions flex flex-wrap items-center justify-between gap-3">
        {canCompare ? (
          <Button
            variant="blue"
            href={getCompareUrl()}
            target="_blank"
            iconRight={<IconArrowUpRight />}
          >
            Compare
          </Button>
        ) : (
          <Button variant="blue" disabled iconRight={<IconArrowUpRight />}>
            Compare
          </Button>
        )}
        {hasPublishedVersions && (
          <Checkbox
            label="Published versions only"
            checked={showPublishedOnly}
            onChange={(e) => setShowPublishedOnly(e.currentTarget.checked)}
          />
        )}
      </div>
      {filteredVersions.length === 0 ? (
        <Text className="VersionHistoryModal__versionsEmpty mt-5" size="body">
          <p>No versions found.</p>
          <p className="VersionHistoryModal__versionsEmpty__developer mt-2.5 text-sm italic">
            For developers: Configure the Root.js cron job to populate versions.
          </p>
        </Text>
      ) : (
        <>
          <Table
            className="VersionHistoryModal__versions mt-5"
            label="Versions"
          >
            <TableHead>
              <TableRow>
                <TableHeaderCell className="w-10">
                  <span className="sr-only">Select</span>
                </TableHeaderCell>
                <TableHeaderCell>modified at</TableHeaderCell>
                <TableHeaderCell>modified by</TableHeaderCell>
                <TableHeaderCell>actions</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredVersions.map((version) => {
                const isDraft = version._versionId === 'draft';
                const isSelected = selectedVersions.includes(
                  version._versionId
                );
                const isDisabled = !isSelected && selectedVersions.length >= 2;
                const modifiedAt = dateFormat.format(
                  version.sys.modifiedAt.toDate()
                );
                const messageKey = `${version._versionId}-message`;
                const releaseKey = `${version._versionId}-release`;
                const releaseTag = version.tags?.find((tag) =>
                  tag.startsWith('release:')
                );
                const releaseId = releaseTag?.replace('release:', '');

                return (
                  <TableRow key={version._versionId}>
                    <TableCell>
                      <Checkbox
                        aria-label={`Select version ${modifiedAt}`}
                        checked={isSelected}
                        disabled={isDisabled}
                        onChange={() => toggleVersion(version._versionId)}
                        className="VersionHistoryModal__versions__checkbox"
                      />
                    </TableCell>
                    <TableCell>
                      <div className="VersionHistoryModal__versions__modifiedAt flex items-center gap-1">
                        <Text
                          size="body-sm"
                          className="VersionHistoryModal__versions__modifiedAt__text flex-1 whitespace-nowrap"
                        >
                          {isDraft ? (
                            <span title="Current Draft">
                              {modifiedAt} (Latest)
                            </span>
                          ) : (
                            <>
                              {modifiedAt}
                              {version.tags?.includes('published') && (
                                <span className="VersionHistoryModal__publishedLabel ml-1 opacity-50">
                                  (Published)
                                </span>
                              )}
                            </>
                          )}
                        </Text>
                        {version.publishMessage && (
                          <Popover
                            withArrow
                            open={openTooltip === messageKey}
                            onOpenChange={(open) =>
                              setOpenTooltip(open ? messageKey : null)
                            }
                            placement="right"
                            width={320}
                            label="Publish message"
                            trigger={
                              <IconButton
                                size="xs"
                                label="Publish message"
                                className="VersionHistoryModal__messageIcon"
                              >
                                <IconMessage />
                              </IconButton>
                            }
                          >
                            <div className="VersionHistoryModal__message whitespace-pre-line text-sm leading-normal">
                              {version.publishMessage}
                            </div>
                          </Popover>
                        )}
                        {releaseId && (
                          <Popover
                            withArrow
                            open={openTooltip === releaseKey}
                            onOpenChange={(open) =>
                              setOpenTooltip(open ? releaseKey : null)
                            }
                            placement="right"
                            width={320}
                            label="Release"
                            trigger={
                              <IconButton
                                size="xs"
                                label="Release"
                                className="VersionHistoryModal__messageIcon"
                              >
                                <IconRocket />
                              </IconButton>
                            }
                          >
                            <div className="VersionHistoryModal__message whitespace-pre-line text-sm leading-normal">
                              <strong>Release:</strong> {releaseId}
                            </div>
                          </Popover>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Text size="body-sm">{version.sys.modifiedBy}</Text>
                    </TableCell>
                    <TableCell>
                      <div className="VersionHistoryModal__versions__buttons flex flex-wrap gap-2">
                        {!isDraft && (
                          <>
                            <Button size="xs" onClick={() => restore(version)}>
                              restore
                            </Button>
                            <Button
                              size="xs"
                              onClick={() => copyToNewDoc(version)}
                              icon={<IconCopy />}
                            >
                              copy to doc
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          {hasMore && (
            <div className="VersionHistoryModal__loadMore flex justify-center py-3">
              <Button variant="subtle" loading={loadingMore} onClick={loadMore}>
                Load more versions
              </Button>
            </div>
          )}
        </>
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
