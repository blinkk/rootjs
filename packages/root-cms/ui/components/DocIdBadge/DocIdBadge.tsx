import './DocIdBadge.css';

export interface DocIdBadgeProps {
  docId: string;
}

export function DocIdBadge(props: DocIdBadgeProps) {
  return (
    <div className="DocIdBadge">
      <code data-testid="doc-id">{props.docId}</code>
    </div>
  );
}
