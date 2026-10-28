export interface DocIdBadgeProps {
  docId: string;
}

/** Shows a doc id in a monospace chip, e.g. in confirm dialogs. */
export function DocIdBadge(props: DocIdBadgeProps) {
  return (
    <div className="DocIdBadge mt-2 break-words">
      <code
        className="DocIdBadge__code m-0 inline-flex whitespace-pre-wrap break-all rounded-sm bg-chip px-2 py-1 font-mono text-sm font-semibold leading-normal"
        data-testid="doc-id"
      >
        {props.docId}
      </code>
    </div>
  );
}
