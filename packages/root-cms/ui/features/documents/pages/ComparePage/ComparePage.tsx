import {useMemo} from 'preact/hooks';
import {useLocation} from 'preact-iso';
import {Layout} from '../../../../app/layout/Layout.js';
import {usePageTitle} from '../../../../hooks/usePageTitle.js';
import {
  DocDiffViewer,
  DocVersionId,
} from '../../components/DocDiffViewer/DocDiffViewer.js';

export function ComparePage() {
  const {query} = useLocation();
  usePageTitle('Compare');

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
      <div className="ComparePage p-4 md:p-15">
        {leftVersionId && rightVersionId ? (
          <DocDiffViewer
            className="ComparePage__diff border border-t-0 border-border"
            left={leftVersionId}
            right={rightVersionId}
          />
        ) : (
          <div className="ComparePage__error text-base">
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
