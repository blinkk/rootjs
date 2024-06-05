import {useState} from 'preact/hooks';

export interface DocVersionId {
  /** Doc id, e.g. `Pages/foo`. */
  docId: string;
  /** Version to compare, e.g. "1234" or "draft" or "published". */
  version: string | 'draft' | 'published';
}

export interface DocDiffViewerProps {
  className?: string;
  left: DocVersionId;
  right: DocVersionId;
}

export function DocDiffViewer(props: DocDiffViewerProps) {
  const [loading, setLoading] = useState(false);
  return (
    <div>
      <div>
        {props.left.docId}@{props.left.version}
      </div>
      <div>
        {props.right.docId}@{props.right.version}
      </div>
    </div>
  );
}
