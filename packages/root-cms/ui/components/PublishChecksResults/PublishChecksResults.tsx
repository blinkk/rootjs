import './PublishChecksResults.css';

import {Badge} from '@mantine/core';
import {type PublishCheckResult} from '../../../shared/publish-checks.js';
import {joinClassNames} from '../../utils/classes.js';
import {CheckStatusBadge} from '../CheckStatusBadge/CheckStatusBadge.js';
import {DocIdBadge} from '../DocIdBadge/DocIdBadge.js';
import {Markdown} from '../Markdown/Markdown.js';

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
    <div className={joinClassNames('PublishChecksResults', props.className)}>
      {groups.map((group) => (
        <div className="PublishChecksResults__group" key={group.docId}>
          {showDocIds && (
            <div className="PublishChecksResults__group__docId">
              <DocIdBadge docId={group.docId} />
            </div>
          )}
          <div className="PublishChecksResults__group__results">
            {group.results.map((result) => (
              <div
                className={joinClassNames(
                  'PublishChecksResults__result',
                  `PublishChecksResults__result--${result.status}`
                )}
                key={`${result.docId}::${result.checkId}`}
              >
                <div className="PublishChecksResults__result__header">
                  <div className="PublishChecksResults__result__label">
                    {result.label}
                  </div>
                  <div className="PublishChecksResults__result__badges">
                    {result.level === 'required' && (
                      <Badge size="sm" variant="outline" color="gray">
                        Required
                      </Badge>
                    )}
                    <CheckStatusBadge status={result.status} />
                  </div>
                </div>
                <div className="PublishChecksResults__result__message">
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
