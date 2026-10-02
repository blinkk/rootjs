import {IconCheck, IconCopy} from '@tabler/icons-preact';
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
      className={joinClassNames(
        props.className,
        styles.codeBlock,
        !languageLabel && styles.noHeader
      )}
      data-language={props.language}
    >
      {languageLabel && (
        <div className={styles.header}>
          <span className={styles.language}>{languageLabel}</span>
        </div>
      )}
      <button
        className={styles.copy}
        type="button"
        aria-label="Copy code"
        title="Copy"
        data-copy
      >
        <IconCopy className={styles.copyIcon} size={16} stroke={1.75} />
        <IconCheck className={styles.copiedIcon} size={16} stroke={1.75} />
      </button>
      <pre>
        <code>{props.code || ''}</code>
      </pre>
    </root-code>
  );
}
