import {useTranslations} from '@blinkk/root';
import {Container} from '@/components/Container/Container.js';
import {SectionHeader} from '@/components/SectionHeader/SectionHeader.js';
import {TemplateCodeShowcaseFields} from '@/root-cms.js';
import {joinClassNames} from '@/utils/classes.js';
import styles from './TemplateCodeShowcase.module.scss';

export type TemplateCodeShowcaseProps = TemplateCodeShowcaseFields & {
  className?: string;
};

export function TemplateCodeShowcase(props: TemplateCodeShowcaseProps) {
  const t = useTranslations();
  const options = props.options || [];
  const files = props.files || [];
  return (
    <div
      id={props.id}
      className={joinClassNames(
        props.className,
        styles.codeShowcase,
        ...options.map((option) => styles[option])
      )}
    >
      <Container>
        <SectionHeader
          eyebrow={props.eyebrow}
          title={props.title}
          body={props.body}
          align="center"
        />
        <div
          className={styles.files}
          style={{'--file-count': String(Math.min(files.length, 3) || 1)}}
        >
          {files.map((file, i) => (
            <figure className={styles.file}>
              <figcaption className={styles.fileHeader}>
                <span className={styles.step}>{i + 1}</span>
                <span className={styles.filename}>{file.filename}</span>
              </figcaption>
              {file.caption && (
                <div className={styles.caption}>{t(file.caption)}</div>
              )}
              <root-code className={styles.code} data-language={file.language}>
                <pre>
                  <code>{file.code || ''}</code>
                </pre>
              </root-code>
            </figure>
          ))}
        </div>
      </Container>
    </div>
  );
}
