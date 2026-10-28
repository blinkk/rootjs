import {IconCircleCheckFilled} from '@tabler/icons-preact';
import {useEffect, useMemo, useState} from 'preact/hooks';
import * as schema from '../../../../../core/schema.js';
import {JsDiff} from '../../../../components/JsDiff/JsDiff.js';
import {useLocalStorage} from '../../../../hooks/useLocalStorage.js';
import {Button} from '../../../../primitives/Button/Button.js';
import {SegmentedControl} from '../../../../primitives/SegmentedControl/SegmentedControl.js';
import {Spinner} from '../../../../primitives/Spinner/Spinner.js';
import {cn} from '../../../../utils/classes.js';
import {notifyErrors} from '../../../../utils/notifications.js';
import {stableJsonStringify} from '../../../../utils/objects.js';
import {withTimeout} from '../../../../utils/with-timeout.js';
import {testAiEnabled} from '../../../ai/ai.js';
import {AiSummary} from '../../../ai/components/AiSummary/AiSummary.js';
import {fetchCollectionSchema} from '../../../collections/collection.js';
import {diffDocFields} from '../../doc-changes.js';
import {LocalesDiff, diffDocLocales} from '../../doc-diff.js';
import {CMSDoc, cmsReadDocVersion, unmarshalData} from '../../doc.js';
import {DocChanges} from '../DocChanges/DocChanges.js';

/**
 * How the diff is shown: field-by-field changes labeled using the schema, or
 * the raw JSON.
 */
export type DocDiffView = 'changes' | 'json';

const VIEW_STORAGE_KEY = 'root::DocDiffViewer::view';

const NO_FIELD_CHANGES_CLASSES =
  'DocDiffViewer__noFieldChanges px-2 py-3 font-sans text-sm text-muted';

export interface DocVersionId {
  /** Doc id, e.g. `Pages/foo`. */
  docId: string;
  /** Version to compare, e.g. "1234" or "draft" or "published". */
  versionId: string | 'draft' | 'published';
}

export interface DocDiffViewerProps {
  className?: string;
  /**
   * Classes for the diff area (`DocDiffViewer__diff`), which reserves 280px
   * by default; e.g. `min-h-0` to size it to its content.
   */
  diffClassName?: string;
  left: DocVersionId;
  right: DocVersionId;
  /** Whether to show the "expand" button which opens diff in a new tab. */
  showExpandButton?: boolean;
  /** Whether to show the AI summary section. */
  showAiSummary?: boolean;
  /**
   * Preloaded versions of the docs to compare. When set, the versions aren't
   * fetched, so `left` and `right` are only used for labels. Useful for
   * versions that aren't stored as doc versions, e.g. a release's pre-release
   * snapshot.
   */
  docs?: {left: CMSDoc | null; right: CMSDoc | null};
}

export function DocDiffViewer(props: DocDiffViewerProps) {
  const left = props.left;
  const right = props.right;
  const [loading, setLoading] = useState(false);
  const [leftDoc, setLeftDoc] = useState<CMSDoc | null>(null);
  const [rightDoc, setRightDoc] = useState<CMSDoc | null>(null);
  const [collection, setCollection] = useState<schema.Collection | null>(null);
  // The user's last choice of view is remembered across sessions.
  const [storedView, setStoredView] = useLocalStorage<DocDiffView>(
    VIEW_STORAGE_KEY,
    'changes'
  );
  const view: DocDiffView = storedView === 'json' ? 'json' : 'changes';

  const showAiSummary =
    testAiEnabled() &&
    left.docId === right.docId &&
    props.showAiSummary !== false;

  const leftData = stableJsonStringify(cleanData(leftDoc?.fields || {}));
  const rightData = stableJsonStringify(cleanData(rightDoc?.fields || {}));
  const fieldsIdentical = leftData === rightData;
  const localesDiff = diffDocLocales(leftDoc, rightDoc);
  const isIdentical =
    !loading && leftDoc && rightDoc && fieldsIdentical && !localesDiff;

  const changes = useMemo(
    () => diffDocFields(collection, leftDoc?.fields, rightDoc?.fields),
    [collection, leftDoc, rightDoc]
  );

  const expandUrl = `/cms/compare?left=${toUrlParam(left)}&right=${toUrlParam(
    right
  )}`;

  async function init() {
    setLoading(true);
    if (props.docs) {
      setLeftDoc(props.docs.left);
      setRightDoc(props.docs.right);
      setCollection(await loadCollection());
      setLoading(false);
      return;
    }
    await notifyErrors(async () => {
      const [leftDoc, rightDoc] = await withTimeout(
        Promise.all([
          cmsReadDocVersion(left.docId, left.versionId),
          cmsReadDocVersion(right.docId, right.versionId),
        ]),
        undefined,
        'loading doc versions'
      );
      setLeftDoc(leftDoc);
      setRightDoc(rightDoc);
    });
    setCollection(await loadCollection());
    setLoading(false);
  }

  /**
   * Loads the schema used to label the changes. Without it, changes are still
   * shown but labeled by their raw field keys.
   */
  async function loadCollection(): Promise<schema.Collection | null> {
    const leftCollectionId = left.docId.split('/')[0];
    const rightCollectionId = right.docId.split('/')[0];
    if (leftCollectionId !== rightCollectionId) {
      return null;
    }
    try {
      return await fetchCollectionSchema(rightCollectionId);
    } catch (err) {
      console.warn(`failed to load schema for ${rightCollectionId}`, err);
      return null;
    }
  }

  useEffect(() => {
    init();
  }, []);

  if (loading) {
    return (
      <div className="DocDiffViewer DocDiffViewer--loading p-6">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <>
      {showAiSummary && (
        <AiSummary
          className="DocDiffViewer__aiSummary mb-2"
          docId={left.docId}
          beforeVersion={String(left.versionId)}
          afterVersion={String(right.versionId)}
        />
      )}
      <div className={cn('DocDiffViewer min-w-0 font-mono', props.className)}>
        <div className="DocDiffViewer__toolbar flex flex-wrap items-center gap-3 px-2 pb-2 pt-1 font-sans">
          <SegmentedControl
            className="DocDiffViewer__toolbar__views"
            size="xs"
            aria-label="Diff view"
            value={view}
            onValueChange={(value) => setStoredView(value)}
            data={[
              {value: 'changes' as DocDiffView, label: 'Changes'},
              {value: 'json' as DocDiffView, label: 'JSON'},
            ]}
          />
          {view === 'changes' && !isIdentical && (
            <div className="DocDiffViewer__toolbar__count text-sm text-muted">
              {changes.length === 1 ? '1 change' : `${changes.length} changes`}
            </div>
          )}
          {props.showExpandButton && (
            <Button
              className="DocDiffViewer__toolbar__expand ml-auto"
              variant="default"
              size="xs"
              href={expandUrl}
              target="_blank"
            >
              Open in new tab
            </Button>
          )}
        </div>
        <div className="DocDiffViewer__header grid grid-cols-1 border-y border-border bg-surface-hover sm:grid-cols-2">
          <div className="DocDiffViewer__header__label min-w-0 p-2">
            <div className="DocDiffViewer__header__label__title mb-1 break-all text-xs font-bold">
              {props.left.docId}@{props.left.versionId}
            </div>
            <div className="DocDiffViewer__header__label__meta text-xs text-muted">
              {getMetaString(leftDoc)}
            </div>
          </div>
          <div className="DocDiffViewer__header__label min-w-0 border-t border-border p-2 sm:border-l sm:border-t-0">
            <div className="DocDiffViewer__header__label__title mb-1 break-all text-xs font-bold">
              {props.right.docId}@{props.right.versionId}
            </div>
            <div className="DocDiffViewer__header__label__meta text-xs text-muted">
              {getMetaString(rightDoc)}
            </div>
          </div>
        </div>
        <div
          className={cn('DocDiffViewer__diff min-h-70', props.diffClassName)}
        >
          {isIdentical ? (
            <div className="DocDiffViewer__identical flex items-center justify-center gap-2 px-5 py-10 font-sans text-sm text-muted">
              <IconCircleCheckFilled size={20} />
              <span>No changes. Both versions are identical.</span>
            </div>
          ) : (
            <>
              {localesDiff && <LocalesDiffRow diff={localesDiff} />}
              {fieldsIdentical ? (
                <div className={NO_FIELD_CHANGES_CLASSES}>
                  No field changes.
                </div>
              ) : view === 'changes' ? (
                changes.length > 0 ? (
                  <DocChanges changes={changes} />
                ) : (
                  <div className={NO_FIELD_CHANGES_CLASSES}>
                    No content changes. Only hidden data changed, such as field
                    settings or editor metadata. Switch to the JSON view to see
                    it.
                  </div>
                )
              ) : (
                <JsDiff oldCode={leftData} newCode={rightData} />
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}

/** Shows the locales added to and removed from a doc between versions. */
function LocalesDiffRow(props: {diff: LocalesDiff}) {
  const {added, removed, unchanged} = props.diff;
  return (
    <div className="DocDiffViewer__sys flex items-baseline gap-3 border-b border-border p-2 text-sm">
      <div className="DocDiffViewer__sys__label shrink-0 font-bold">
        Locales
      </div>
      <div className="DocDiffViewer__sys__locales flex flex-wrap items-baseline gap-1.5">
        {added.map((locale) => (
          <span
            key={`added-${locale}`}
            className="DocDiffViewer__sys__locale DocDiffViewer__sys__locale--added rounded-sm bg-success-soft px-1.5 py-px"
            title="Added"
          >
            + {locale}
          </span>
        ))}
        {removed.map((locale) => (
          <span
            key={`removed-${locale}`}
            className="DocDiffViewer__sys__locale DocDiffViewer__sys__locale--removed rounded-sm bg-danger-soft px-1.5 py-px"
            title="Removed"
          >
            − {locale}
          </span>
        ))}
        {unchanged.length > 0 && (
          <span className="DocDiffViewer__sys__unchanged text-muted">
            ({unchanged.join(', ')} unchanged)
          </span>
        )}
      </div>
    </div>
  );
}

function getMetaString(doc: CMSDoc | null) {
  if (!doc?.sys?.modifiedAt) {
    return 'never';
  }
  const date = doc.sys.modifiedAt.toDate();
  const dateFormat = new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  return `${dateFormat.format(date)} by ${doc.sys.modifiedBy}`;
}

function cleanData(data: any) {
  return unmarshalData(data, {removeArrayKey: true});
}

function toUrlParam(docVersionId: DocVersionId): string {
  return encodeURIComponent(`${docVersionId.docId}@${docVersionId.versionId}`)
    .replaceAll('%2F', '/')
    .replaceAll('%40', '@');
}
