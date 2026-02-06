import {RichText} from '@blinkk/root-cms/richtext';
import {Image as ImageComponent} from '@/components/Image/Image.js';
import {
  PageModuleFields,
  PageModules,
} from '@/components/PageModules/PageModules.js';
import {TemplateSandboxFields} from '@/root-cms.js';
import styles from './TemplateSandbox.module.scss';

function FieldRow(props: {label: string; children: preact.ComponentChildren}) {
  return (
    <tr className={styles.row}>
      <td className={styles.labelCell}>{props.label}</td>
      <td className={styles.valueCell}>{props.children}</td>
    </tr>
  );
}

function EmptyValue() {
  return <span className={styles.emptyValue}>(empty)</span>;
}

export function TemplateSandbox(props: TemplateSandboxFields) {
  return (
    <div className={styles.container}>
      <h2 className={styles.heading}>TemplateSandbox</h2>

      <table className={styles.table}>
        <tbody>
          <FieldRow label="image (ImageField)">
            {props.image?.src ? (
              <div>
                <ImageComponent
                  src={props.image.src}
                  width={props.image.width || 300}
                  height={props.image.height || 200}
                  alt={props.image.alt || ''}
                  className={styles.imagePreview}
                />
                <div className={styles.imageInfo}>
                  {props.image.width && props.image.height && (
                    <span>
                      {props.image.width}×{props.image.height}
                    </span>
                  )}
                  {props.image.alt && <span> · alt: "{props.image.alt}"</span>}
                </div>
              </div>
            ) : (
              <EmptyValue />
            )}
          </FieldRow>

          <FieldRow label="file (FileField)">
            {props.file?.src ? (
              <a
                href={props.file.src}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.link}
              >
                {props.file.src}
              </a>
            ) : (
              <EmptyValue />
            )}
          </FieldRow>

          <FieldRow label="fileTxtOnly (FileField)">
            {props.fileTxtOnly?.src ? (
              <a
                href={props.fileTxtOnly.src}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.link}
              >
                {props.fileTxtOnly.src}
              </a>
            ) : (
              <EmptyValue />
            )}
          </FieldRow>

          <FieldRow label="datetime (DateTimeField)">
            {props.datetime ? <code>{props.datetime}</code> : <EmptyValue />}
          </FieldRow>

          <FieldRow label="datetimeWithTimezone (DateTimeField)">
            {props.datetimeWithTimezone ? (
              <code>{props.datetimeWithTimezone}</code>
            ) : (
              <EmptyValue />
            )}
          </FieldRow>

          <FieldRow label="date (DateField)">
            {props.date ? <code>{props.date}</code> : <EmptyValue />}
          </FieldRow>

          <FieldRow label="string (StringField)">
            {props.string ? (
              <div className={styles.preWrap}>{props.string}</div>
            ) : (
              <EmptyValue />
            )}
          </FieldRow>

          <FieldRow label="richtext (RichTextField)">
            {props.richtext ? (
              <RichText data={props.richtext} />
            ) : (
              <EmptyValue />
            )}
          </FieldRow>
        </tbody>
      </table>

      <div className={styles.modulesSection}>
        <h3 className={styles.modulesHeading}>
          modules ({props.modules?.length || 0} items)
        </h3>
        {props.modules && props.modules.length > 0 ? (
          <PageModules modules={props.modules as PageModuleFields[]} />
        ) : (
          <EmptyValue />
        )}
      </div>
    </div>
  );
}
