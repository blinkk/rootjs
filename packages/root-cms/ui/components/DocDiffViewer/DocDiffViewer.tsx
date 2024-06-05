import {Loader} from '@mantine/core';
import {useEffect, useState} from 'preact/hooks';
import ReactJsonViewCompare from 'react-json-view-compare';
import {CMSDoc, cmsReadDocVersion, unmarshalData} from '../../utils/doc.js';
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
}

export function DocDiffViewer(props: DocDiffViewerProps) {
  const left = props.left;
  const right = props.right;
  const [loading, setLoading] = useState(false);
  const [leftDoc, setLeftDoc] = useState<CMSDoc | null>(null);
  const [rightDoc, setRightDoc] = useState<CMSDoc | null>(null);

  const leftData = unmarshalData(leftDoc?.fields || {});
  const rightData = unmarshalData(rightDoc?.fields || {});

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
    return <Loader size="md" color="gray" />;
  }

  return (
    <div className="DocDiffViewer">
      <ReactJsonViewCompare oldData={leftData} newData={rightData} />
    </div>
  );
}
