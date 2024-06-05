import {Loader} from '@mantine/core';
import {useEffect, useState} from 'preact/hooks';
import {
  DocDiffViewer,
  DocVersionId,
} from '../../components/DocDiffViewer/DocDiffViewer.js';
import {Layout} from '../../layout/Layout.js';

import './ComparePage.css';

export function ComparePage() {
  const [loading, setLoading] = useState(true);
  const [leftVersionId, setLeftVersionId] = useState<DocVersionId | null>(null);
  const [rightVersionId, setRightVersionId] = useState<DocVersionId | null>(
    null
  );

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    console.log(urlParams);
    console.log(urlParams.get('left'));
    console.log(urlParams.get('right'));
    const leftId = parseParam(urlParams.get('left') || '');
    const rightId = parseParam(urlParams.get('right') || '');
    setLeftVersionId(leftId);
    setRightVersionId(rightId);
    console.log(leftId, rightId);
    setLoading(false);
  }, []);

  return (
    <Layout>
      <div className="ComparePage">
        {loading ? (
          <Loader />
        ) : leftVersionId && rightVersionId ? (
          <DocDiffViewer
            className="ComparePage__diff"
            left={leftVersionId}
            right={rightVersionId}
          />
        ) : (
          <div className="ComparePage__error">
            Invalid params, double check query params.
          </div>
        )}
      </div>
    </Layout>
  );
}

function parseParam(value: string): DocVersionId | null {
  const [docId, versionId] = String(value).split('@');
  if (docId && versionId) {
    return {docId, versionId};
  }
  return null;
}
