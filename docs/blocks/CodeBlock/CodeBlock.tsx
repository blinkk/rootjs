import {CodeBlockFields} from '@/root-cms.js';
import {joinClassNames} from '@/utils/classes.js';
import styles from './CodeBlock.module.scss';

export type CodeBlockProps = CodeBlockFields & {
  className?: string;
};

export function CodeBlock(props: CodeBlockProps) {
  let languageLabel = props.language;
  if (languageLabel === 'bash') {
    languageLabel = 'sh';
  }
  return (
    <root-code
      className={joinClassNames(props.className, styles.codeBlock)}
      data-language={props.language}
    >
      {languageLabel && (
        <div className={styles.header}>
          <span className={styles.language}>{languageLabel}</span>
        </div>
      )}
      <pre>
        <code>{props.code || ''}</code>
      </pre>
    </root-code>
  );
}
