import './JsDiff.css';

import {diffLines} from 'diff';
import type {JSX} from 'preact';
import {useEffect, useMemo, useRef, useState} from 'preact/hooks';
import {joinClassNames} from '../../utils/classes.js';
import {stableJsonStringify} from '../../utils/objects.js';

/** Number of unchanged context lines to show around each change. */
const CONTEXT_LINES = 4;

interface DiffLine {
  key: string;
  type: 'added' | 'removed' | 'unchanged';
  lineNumber: number;
  sign: string;
  text: string;
}

export interface JsDiffProps {
  oldCode: string;
  newCode: string;
  className?: string;
}

export function JsDiff(props: JsDiffProps) {
  const {oldCode, newCode, className = ''} = props;
  const [expandedSections, setExpandedSections] = useState<
    Record<number, boolean>
  >({});

  const normalizedCode = useMemo(() => {
    const oldJson = parseJson(oldCode);
    const newJson = parseJson(newCode);
    if (oldJson !== undefined && newJson !== undefined) {
      return {
        oldCode: stableJsonStringify(oldJson),
        newCode: stableJsonStringify(newJson),
      };
    }
    return {oldCode, newCode};
  }, [oldCode, newCode]);

  const diffResult = useMemo(() => {
    return diffLines(normalizedCode.oldCode, normalizedCode.newCode);
  }, [normalizedCode]);

  // Reset expanded sections when diff changes.
  useEffect(() => {
    setExpandedSections({});
  }, [normalizedCode]);

  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Scroll to the first diff whenever `oldCode` or `newCode` change.
    if (contentRef.current) {
      const firstChangedLine = contentRef.current.querySelector(
        '.JsDiff__diffLine--added, .JsDiff__diffLine--removed'
      );
      if (firstChangedLine) {
        firstChangedLine.scrollIntoView({behavior: 'smooth', block: 'center'});
      }
    }
  }, [normalizedCode]);

  const allLines = useMemo(() => {
    const lines: DiffLine[] = [];
    let lineNumber = 0;

    diffResult.forEach((part: any, partIndex: number) => {
      const sign = part.added ? '+' : part.removed ? '-' : ' ';
      const type = part.added
        ? 'added'
        : part.removed
        ? 'removed'
        : 'unchanged';
      const partLines = part.value.split('\n');

      partLines.forEach((line: string, lineIndex: number) => {
        if (line.length > 0 || lineIndex < partLines.length - 1) {
          lines.push({
            key: `${partIndex}-${lineIndex}`,
            type,
            lineNumber: ++lineNumber,
            sign,
            text: line,
          });
        }
      });
    });

    return lines;
  }, [diffResult]);

  const renderDiffLines = () => {
    // Find indices of all changed lines.
    const changedIndices = new Set<number>();
    allLines.forEach((line, i) => {
      if (line.type !== 'unchanged') {
        changedIndices.add(i);
      }
    });

    // Mark which lines should be visible (within CONTEXT_LINES of a change).
    const visibleIndices = new Set<number>();
    allLines.forEach((_, i) => {
      if (changedIndices.has(i)) {
        visibleIndices.add(i);
        for (let d = 1; d <= CONTEXT_LINES; d++) {
          if (i - d >= 0) visibleIndices.add(i - d);
          if (i + d < allLines.length) visibleIndices.add(i + d);
        }
      }
    });

    // If there are no changes, show everything.
    if (changedIndices.size === 0) {
      return allLines.map((line) => renderLine(line));
    }

    const elements: JSX.Element[] = [];
    let i = 0;
    let collapseId = 0;

    while (i < allLines.length) {
      if (visibleIndices.has(i)) {
        elements.push(renderLine(allLines[i]));
        i++;
      } else {
        // Collect consecutive collapsed lines.
        const id = collapseId++;
        const collapsedStart = i;
        while (i < allLines.length && !visibleIndices.has(i)) {
          i++;
        }
        const collapsedLines = allLines.slice(collapsedStart, i);
        const count = collapsedLines.length;

        const expanded = expandedSections[id];
        if (expanded) {
          elements.push(
            <div
              key={`collapse-${id}`}
              className="JsDiff__collapsed"
              onClick={() =>
                setExpandedSections((prev) => ({...prev, [id]: false}))
              }
            >
              <CollapseIcon />
              <span>
                Hide {count} unchanged line{count !== 1 ? 's' : ''}
              </span>
            </div>
          );
          elements.push(...collapsedLines.map((line) => renderLine(line)));
        } else {
          elements.push(
            <div
              key={`collapse-${id}`}
              className="JsDiff__collapsed"
              onClick={() =>
                setExpandedSections((prev) => ({...prev, [id]: true}))
              }
            >
              <ExpandIcon />
              <span>
                {count} unchanged line{count !== 1 ? 's' : ''} hidden
              </span>
            </div>
          );
        }
      }
    }

    return elements;
  };

  return (
    <div className={joinClassNames('JsDiff__container', className)}>
      <div className="JsDiff__content" ref={contentRef}>
        {renderDiffLines()}
      </div>
    </div>
  );
}

function renderLine(line: DiffLine): JSX.Element {
  return (
    <div
      key={line.key}
      className={joinClassNames(
        'JsDiff__diffLine',
        line.type === 'added' && 'JsDiff__diffLine--added',
        line.type === 'removed' && 'JsDiff__diffLine--removed',
        line.type === 'unchanged' && 'JsDiff__diffLine--unchanged'
      )}
    >
      <span className="JsDiff__lineNumber">{line.lineNumber}</span>
      <span className="JsDiff__lineContent">
        <span className="JsDiff__sign">{line.sign}</span>
        <span>{line.text || ' '}</span>
      </span>
    </div>
  );
}

function parseJson(value: string): unknown | undefined {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function ExpandIcon() {
  return (
    <svg
      className="JsDiff__collapsed__icon"
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d="M4 6l4 4 4-4" />
    </svg>
  );
}

function CollapseIcon() {
  return (
    <svg
      className="JsDiff__collapsed__icon"
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d="M4 10l4-4 4 4" />
    </svg>
  );
}
