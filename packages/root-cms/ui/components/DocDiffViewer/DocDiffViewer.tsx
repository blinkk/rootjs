import {Loader} from '@mantine/core';
import {useEffect, useState} from 'preact/hooks';
import {cmsReadDocVersion, unmarshalData} from '../../utils/doc.js';

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
  const [leftData, setLeftData] = useState({});
  const [rightData, setRightData] = useState({});

  async function init() {
    setLoading(true);
    const [leftDoc, rightDoc] = await Promise.all([
      cmsReadDocVersion(left.docId, left.versionId),
      cmsReadDocVersion(right.docId, right.versionId),
    ]);
    setLeftData(unmarshalData(leftDoc?.fields || {}));
    setRightData(unmarshalData(rightDoc?.fields || {}));
    setLoading(false);
  }

  useEffect(() => {
    init();
  }, []);

  if (loading) {
    return <Loader size="md" color="gray" />;
  }

  return (
    <div>
      <div>{JSON.stringify(leftData)}</div>
      <div>{JSON.stringify(rightData)}</div>
    </div>
  );
}
