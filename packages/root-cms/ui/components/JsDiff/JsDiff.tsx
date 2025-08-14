import './JsDiff.css';

import {diffLines} from 'diff';
import type {JSX} from 'preact';
import {useMemo} from 'preact/hooks';
import {joinClassNames} from '../../utils/classes.js';

export interface JsDiffProps {
  oldCode: string;
  newCode: string;
  className?: string;
}

export function JsDiff(props: JsDiffProps) {
  const {oldCode, newCode, className = ''} = props;

  const diffResult = useMemo(() => {
    return diffLines(oldCode, newCode);
  }, [oldCode, newCode]);

  const renderDiffLines = () => {
    const elements: JSX.Element[] = [];
    let lineNumber = 0;

    diffResult.forEach((part: any, partIndex: number) => {
      const sign = part.added ? '+' : part.removed ? '-' : ' ';

      // Split the part's value into individual lines
      const lines = part.value.split('\n');

      // For each line, create a JSX element
      lines.forEach((line: string, lineIndex: number) => {
        if (line.length > 0 || lineIndex < lines.length - 1) {
          elements.push(
            <div
              key={`${partIndex}-${lineIndex}`}
              className={joinClassNames(
                'JsDiff__diffLine',
                part.added && 'JsDiff__diffLine--added',
                part.removed && 'JsDiff__diffLine--removed',
                !part.added && !part.removed && 'JsDiff__diffLine--unchanged'
              )}
            >
              <span className="JsDiff__lineNumber">{++lineNumber}</span>
              <span className="JsDiff__lineContent">
                <span className="JsDiff__sign">{sign}</span>
                <span>{line || ' '}</span>
              </span>
            </div>
          );
        }
      });
    });

    return elements;
  };

  return (
    <div className={joinClassNames('JsDiff__container', className)}>
      <div className="JsDiff__content">{renderDiffLines()}</div>
    </div>
  );
}
