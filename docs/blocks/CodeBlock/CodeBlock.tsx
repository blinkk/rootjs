import {Text} from '@/components/Text/Text';
import {CodeBlockFields} from '@/root-cms';
import styles from './CodeBlock.module.scss';

export type CodeBlockProps = CodeBlockFields;

export function CodeBlock(props: CodeBlockProps) {
  const options = props.options || [];
  return (
    <root-code className={styles.codeBlock} data-language={props.language}>
      {/* {props.filename && (
        <div className={styles.filename}>{props.filename}</div>
      )} */}

      {props.language && (
        <div className={styles.language}>{props.language}</div>
      )}

      <pre>
        <code>{props.code || ''}</code>
      </pre>
    </root-code>
  );
}
