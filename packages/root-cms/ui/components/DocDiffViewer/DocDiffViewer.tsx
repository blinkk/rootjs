import './DocDiffViewer.css';

import {Button, Loader} from '@mantine/core';
import {useEffect, useState} from 'preact/hooks';
import {joinClassNames} from '../../utils/classes.js';
import {CMSDoc, cmsReadDocVersion, unmarshalData} from '../../utils/doc.js';
import {safeTimestamp} from '../../utils/time.js';
import {AiSummary} from '../AiSummary/AiSummary.js';
import {JsDiff} from '../JsDiff/JsDiff.js';

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

  const experiments = (window as any).__ROOT_CTX?.experiments || {};
  const showAiSummary =
    experiments.ai &&
    left.docId === right.docId &&
    props.showAiSummary !== false;

  const leftData = JSON.stringify(cleanData(leftDoc?.fields || {}), null, 2);
  const rightData = JSON.stringify(cleanData(rightDoc?.fields || {}), null, 2);

  const expandUrl = `/cms/compare?left=${toUrlParam(left)}&right=${toUrlParam(
    right
  )}`;

  async function init() {
    setLoading(true);
    const [leftDoc, rightDoc] = await Promise.all([
      cmsReadDocVersion(left.docId, left.versionId),
      cmsReadDocVersion(right.docId, right.versionId),
    ]);
    setLeftDoc(leftDoc);
    setRightDoc(rightDoc);
    setLoading(false);
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
        {props.showExpandButton && (
          <div className="DocDiffViewer__expand">
            <Button
              component="a"
              variant="default"
              size="xs"
              compact
              href={expandUrl}
              target="_blank"
            >
              Open in new tab
            </Button>
          </div>
        )}
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
          <JsDiff oldCode={leftData} newCode={rightData} />
        </div>
      </div>
    </>
  );
}

function getMetaString(doc: CMSDoc | null) {
  if (!doc?.sys?.modifiedAt) {
    return 'never';
  }
  const validTs = safeTimestamp(doc.sys.modifiedAt);
  if (!validTs) {
    return `Invalid date by ${doc.sys.modifiedBy}`;
  }
  const date = validTs.toDate();
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
