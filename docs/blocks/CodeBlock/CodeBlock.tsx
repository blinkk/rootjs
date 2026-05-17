import {CodeBlockFields} from '@/root-cms.js';
import {joinClassNames} from '@/utils/classes.js';
import styles from './CodeBlock.module.scss';

export type CodeBlockProps = CodeBlockFields & {
  className?: string;
};

export function CodeBlock(props: CodeBlockProps) {
  return (
    <root-code
      className={joinClassNames(props.className, styles.codeBlock)}
      data-language={props.language}
    >
      {props.language && (
        <div className={styles.language}>{props.language}</div>
      )}
      <pre>
        <code>{props.code || ''}</code>
      </pre>
    </root-code>
  );
}
