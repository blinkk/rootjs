import './DocDiffViewer.css';

import {Button, Loader, SegmentedControl} from '@mantine/core';
import {IconCircleCheckFilled} from '@tabler/icons-preact';
import {useEffect, useMemo, useState} from 'preact/hooks';
import * as schema from '../../../core/schema.js';
import {useLocalStorage} from '../../hooks/useLocalStorage.js';
import {testAiEnabled} from '../../utils/ai.js';
import {joinClassNames} from '../../utils/classes.js';
import {fetchCollectionSchema} from '../../utils/collection.js';
import {diffDocFields} from '../../utils/doc-changes.js';
import {LocalesDiff, diffDocLocales} from '../../utils/doc-diff.js';
import {CMSDoc, cmsReadDocVersion, unmarshalData} from '../../utils/doc.js';
import {notifyErrors} from '../../utils/notifications.js';
import {stableJsonStringify} from '../../utils/objects.js';
import {withTimeout} from '../../utils/with-timeout.js';
import {AiSummary} from '../AiSummary/AiSummary.js';
import {DocChanges} from '../DocChanges/DocChanges.js';
import {JsDiff} from '../JsDiff/JsDiff.js';

/**
 * How the diff is shown: field-by-field changes labeled using the schema, or
 * the raw JSON.
 */
export type DocDiffView = 'changes' | 'json';

const VIEW_STORAGE_KEY = 'root::DocDiffViewer::view';

export interface DocVersionId {
  /** Doc id, e.g. `Pages/foo`. */
  docId: string;
  /** Version to compare, e.g. "1234" or "draft" or "published". */
  versionId: string | 'draft' | 'published';
}

export interface DocDiffViewerProps {
  className?: string;
  left: DocVersionId;
  right: DocVersionId;
  /** Whether to show the "expand" button which opens diff in a new tab. */
  showExpandButton?: boolean;
  /** Whether to show the AI summary section. */
  showAiSummary?: boolean;
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
      <div className="DocDiffViewer DocDiffViewer--loading">
        <Loader size="md" color="gray" />
      </div>
    );
  }

  return (
    <>
      {showAiSummary && (
        <AiSummary
          className="DocDiffViewer__aiSummary"
          docId={left.docId}
          beforeVersion={String(left.versionId)}
          afterVersion={String(right.versionId)}
        />
      )}
      <div className={joinClassNames(props.className, 'DocDiffViewer')}>
        <div className="DocDiffViewer__toolbar">
          <SegmentedControl
            className="DocDiffViewer__toolbar__views"
            size="xs"
            value={view}
            onChange={(value: string) => setStoredView(value as DocDiffView)}
            data={[
              {value: 'changes', label: 'Changes'},
              {value: 'json', label: 'JSON'},
            ]}
          />
          {view === 'changes' && !isIdentical && (
            <div className="DocDiffViewer__toolbar__count">
              {changes.length === 1 ? '1 change' : `${changes.length} changes`}
            </div>
          )}
          {props.showExpandButton && (
            <Button
              className="DocDiffViewer__toolbar__expand"
              component="a"
              variant="default"
              size="xs"
              compact
              href={expandUrl}
              target="_blank"
            >
              Open in new tab
            </Button>
          )}
        </div>
        <div className="DocDiffViewer__header">
          <div className="DocDiffViewer__header__label">
            <div className="DocDiffViewer__header__label__title">
              {props.left.docId}@{props.left.versionId}
            </div>
            <div className="DocDiffViewer__header__label__meta">
              {getMetaString(leftDoc)}
            </div>
          </div>
          <div className="DocDiffViewer__header__label">
            <div className="DocDiffViewer__header__label__title">
              {props.right.docId}@{props.right.versionId}
            </div>
            <div className="DocDiffViewer__header__label__meta">
              {getMetaString(rightDoc)}
            </div>
          </div>
        </div>
        <div className="DocDiffViewer__diff">
          {isIdentical ? (
            <div className="DocDiffViewer__identical">
              <IconCircleCheckFilled size={20} />
              <span>No changes. Both versions are identical.</span>
            </div>
          ) : (
            <>
              {localesDiff && <LocalesDiffRow diff={localesDiff} />}
              {fieldsIdentical ? (
                <div className="DocDiffViewer__noFieldChanges">
                  No field changes.
                </div>
              ) : view === 'changes' ? (
                changes.length > 0 ? (
                  <DocChanges changes={changes} />
                ) : (
                  <div className="DocDiffViewer__noFieldChanges">
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
    <div className="DocDiffViewer__sys">
      <div className="DocDiffViewer__sys__label">Locales</div>
      <div className="DocDiffViewer__sys__locales">
        {added.map((locale) => (
          <span
            key={`added-${locale}`}
            className="DocDiffViewer__sys__locale DocDiffViewer__sys__locale--added"
            title="Added"
          >
            + {locale}
          </span>
        ))}
        {removed.map((locale) => (
          <span
            key={`removed-${locale}`}
            className="DocDiffViewer__sys__locale DocDiffViewer__sys__locale--removed"
            title="Removed"
          >
            − {locale}
          </span>
        ))}
        {unchanged.length > 0 && (
          <span className="DocDiffViewer__sys__unchanged">
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
