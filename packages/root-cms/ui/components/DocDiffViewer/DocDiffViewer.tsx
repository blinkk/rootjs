import {Button, Loader} from '@mantine/core';
import {Differ, Viewer as JsonDiffViewer} from 'json-diff-kit';
import {useEffect, useState} from 'preact/hooks';
import {CMSDoc, unmarshalData} from '@/db/docs.js';
import {dbGetDocVersion} from '@/db/versions.js';
import {joinClassNames} from '@/utils/classes.js';
import {getTimeAgo} from '@/utils/time.js';
import 'json-diff-kit/dist/viewer-monokai.css';
import 'json-diff-kit/dist/viewer.css';
import './DocDiffViewer.css';

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
}

export function DocDiffViewer(props: DocDiffViewerProps) {
  const left = props.left;
  const right = props.right;
  const [loading, setLoading] = useState(false);
  const [leftDoc, setLeftDoc] = useState<CMSDoc | null>(null);
  const [rightDoc, setRightDoc] = useState<CMSDoc | null>(null);

  const leftData = cleanData(leftDoc?.fields || {});
  const rightData = cleanData(rightDoc?.fields || {});

  const differ = new Differ({});
  const diff = differ.diff(leftData, rightData);

  const expandUrl = `/cms/compare?left=${toUrlParam(left)}&right=${toUrlParam(
    right
  )}`;

  async function init() {
    setLoading(true);
    const [leftDoc, rightDoc] = await Promise.all([
      dbGetDocVersion(left.docId, left.versionId),
      dbGetDocVersion(right.docId, right.versionId),
    ]);
    setLeftDoc(leftDoc);
    setRightDoc(rightDoc);
    setLoading(false);
  }

  useEffect(() => {
    init();
  }, []);

  if (loading) {
    return <Loader size="md" color="gray" />;
  }

  return (
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
          {props.left.docId}@{props.left.versionId} - modified{' '}
          {getModifiedString(leftDoc)}
        </div>
        <div className="DocDiffViewer__header__label">
          {props.right.docId}@{props.right.versionId} - modified{' '}
          {getModifiedString(rightDoc)}
        </div>
      </div>
      <JsonDiffViewer
        diff={diff}
        syntaxHighlight={{theme: 'root-cms'}}
        lineNumbers={true}
        highlightInlineDiff={true}
        hideUnchangedLines={true}
        inlineDiffOptions={{
          mode: 'word',
          wordSeparator: ' ',
        }}
      />
    </div>
  );
}

function getModifiedString(doc: CMSDoc | null) {
  if (!doc?.sys?.modifiedAt) {
    return 'never';
  }
  return getTimeAgo(doc.sys.modifiedAt.toMillis());
}

function cleanData(data: any) {
  return unmarshalData(data, {removeArrayKey: true});
}

function toUrlParam(docVersionId: DocVersionId): string {
  return encodeURIComponent(`${docVersionId.docId}@${docVersionId.versionId}`)
    .replaceAll('%2F', '/')
    .replaceAll('%40', '@');
}
