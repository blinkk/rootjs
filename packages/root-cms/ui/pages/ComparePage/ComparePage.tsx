import './ComparePage.css';

import {useMemo} from 'preact/hooks';
import {useLocation} from 'preact-iso';
import {
  DocDiffViewer,
  DocVersionId,
} from '../../components/DocDiffViewer/DocDiffViewer.js';
import {Layout} from '../../layout/Layout.js';

export function ComparePage() {
  const {query} = useLocation();

  const leftVersionId = useMemo(
    () => parseParam((query.left as string) || ''),
    [query.left]
  );
  const rightVersionId = useMemo(
    () => parseParam((query.right as string) || ''),
    [query.right]
  );

  return (
    <Layout>
      <div className="ComparePage">
        {leftVersionId && rightVersionId ? (
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
