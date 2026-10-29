import './PublishChecksResults.css';

import {
  type PublishCheckResult,
  type PublishCheckStatus,
} from '../../../../../shared/publish-checks.js';
import {Markdown} from '../../../../components/Markdown/Markdown.js';
import {Badge} from '../../../../primitives/Badge/Badge.js';
import {cn} from '../../../../utils/classes.js';
import {DocIdBadge} from '../../../documents/components/DocIdBadge/DocIdBadge.js';
import {CheckStatusBadge} from '../CheckStatusBadge/CheckStatusBadge.js';

export interface PublishChecksResultsProps {
  /** The check results to display. */
  results: PublishCheckResult[];
  /**
   * Whether to show the doc id above each group of results. Defaults to
   * showing it only when the results span more than one doc.
   */
  showDocIds?: boolean;
  className?: string;
}

/** Background and border for each result, by status. */
const RESULT_CLASSES: Record<PublishCheckStatus, string> = {
  success: 'border-success-line bg-success-soft',
  warning: 'border-warning-line bg-warning-soft',
  error: 'border-danger-line bg-danger-soft',
};

/** Groups results by doc id, preserving the order the results arrived in. */
function groupResultsByDoc(
  results: PublishCheckResult[]
): Array<{docId: string; results: PublishCheckResult[]}> {
  const groups: Array<{docId: string; results: PublishCheckResult[]}> = [];
  const byDocId = new Map<string, PublishCheckResult[]>();
  for (const result of results) {
    let group = byDocId.get(result.docId);
    if (!group) {
      group = [];
      byDocId.set(result.docId, group);
      groups.push({docId: result.docId, results: group});
    }
    group.push(result);
  }
  return groups;
}

/**
 * Renders the results of a publishing check run, grouped by doc.
 *
 * Used by the publish flows to show why publishing was halted, and to surface
 * warnings after content goes live.
 */
export function PublishChecksResults(props: PublishChecksResultsProps) {
  const groups = groupResultsByDoc(props.results);
  const showDocIds = props.showDocIds ?? groups.length > 1;

  if (groups.length === 0) {
    return null;
  }

  return (
    <div
      className={cn(
        'PublishChecksResults flex flex-col gap-4',
        props.className
      )}
    >
      {groups.map((group) => (
        <div
          className="PublishChecksResults__group flex flex-col gap-2"
          key={group.docId}
        >
          {showDocIds && (
            <div className="PublishChecksResults__docId flex">
              <DocIdBadge docId={group.docId} />
            </div>
          )}
          <div className="PublishChecksResults__results flex flex-col gap-2">
            {group.results.map((result) => (
              <div
                className={cn(
                  'PublishChecksResults__result',
                  `PublishChecksResults__result--status-${result.status}`,
                  'rounded-md border border-solid px-3 py-2.5',
                  RESULT_CLASSES[result.status]
                )}
                key={`${result.docId}::${result.checkId}`}
              >
                <div className="PublishChecksResults__resultHeader flex flex-wrap items-center justify-between gap-2">
                  <div className="PublishChecksResults__label text-sm font-semibold text-fg">
                    {result.label}
                  </div>
                  <div className="PublishChecksResults__badges flex shrink-0 items-center gap-1.5">
                    {result.level === 'required' && (
                      <Badge variant="outline">Required</Badge>
                    )}
                    <CheckStatusBadge status={result.status} />
                  </div>
                </div>
                <div className="PublishChecksResults__message mt-1.5 text-sm leading-normal text-fg">
                  <Markdown code={result.message} />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
