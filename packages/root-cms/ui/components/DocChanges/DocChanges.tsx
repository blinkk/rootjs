import './DocChanges.css';

import {IconArrowRight, IconFile} from '@tabler/icons-preact';
import {diffWordsWithSpace} from 'diff';
import {ComponentChildren, Fragment} from 'preact';
import * as schema from '../../../core/schema.js';
import {joinClassNames} from '../../utils/classes.js';
import {
  DocChange,
  DocChangeType,
  richTextToPlainText,
  testTimestamp,
  toMillis,
  toReferenceIds,
} from '../../utils/doc-changes.js';
import {FIELD_PATH_SEPARATOR} from '../../utils/field-labels.js';
import {testIsImageFile, testIsVideoFile} from '../../utils/gcs.js';
import {stableJsonStringify} from '../../utils/objects.js';
import {FilePreview} from '../FilePreview/FilePreview.js';

/** Strings up to this length are shown as "before → after" pairs. */
const SHORT_TEXT_LENGTH = 60;

/**
 * Below this ratio of unchanged text, a word diff is harder to read than the
 * two versions, so the before and after text are shown separately.
 */
const MIN_INLINE_SIMILARITY = 0.4;

const CHANGE_LABELS: Record<DocChangeType, string> = {
  added: 'Added',
  removed: 'Removed',
  modified: 'Changed',
  reordered: 'Reordered',
};

export interface DocChangesProps {
  className?: string;
  /** Changes to show, from `diffDocFields()`. */
  changes: DocChange[];
}

/**
 * Lists the field-by-field changes between two versions of a doc, rendering
 * each value the way an editor would recognize it: text as a word diff, images
 * as thumbnails, rich text as plain text, and so on.
 */
export function DocChanges(props: DocChangesProps) {
  if (props.changes.length === 0) {
    return (
      <div className={joinClassNames(props.className, 'DocChanges')}>
        <div className="DocChanges__empty">No field changes.</div>
      </div>
    );
  }
  return (
    <div className={joinClassNames(props.className, 'DocChanges')}>
      {props.changes.map((change) => (
        <ChangeCard key={`${change.type}:${change.deepKey}`} change={change} />
      ))}
    </div>
  );
}

/** A single top-level change, with its field path and a status badge. */
function ChangeCard(props: {change: DocChange}) {
  const change = props.change;
  return (
    <div
      className={joinClassNames(
        'DocChanges__change',
        `DocChanges__change--${change.type}`
      )}
    >
      <div className="DocChanges__change__header">
        <FieldPath path={change.path} />
        <span
          className={joinClassNames(
            'DocChanges__badge',
            `DocChanges__badge--${change.type}`
          )}
        >
          {CHANGE_LABELS[change.type]}
        </span>
      </div>
      <div className="DocChanges__change__body">
        <ChangeBody change={change} />
      </div>
    </div>
  );
}

/** Renders a field path as breadcrumbs, emphasizing the last segment. */
function FieldPath(props: {path: string[]}) {
  const path = props.path;
  return (
    <div className="DocChanges__path" title={path.join(FIELD_PATH_SEPARATOR)}>
      {path.map((segment, i) => (
        <Fragment key={i}>
          {i > 0 && (
            <span className="DocChanges__path__separator">
              {FIELD_PATH_SEPARATOR}
            </span>
          )}
          <span
            className={joinClassNames(
              'DocChanges__path__segment',
              i === path.length - 1 && 'DocChanges__path__segment--last'
            )}
          >
            {segment}
          </span>
        </Fragment>
      ))}
    </div>
  );
}

function ChangeBody(props: {change: DocChange}) {
  const change = props.change;
  if (change.type === 'reordered') {
    return (
      <OrderDiff before={change.before || []} after={change.after || []} />
    );
  }
  if (change.children) {
    return (
      <>
        {(change.before || change.after) && (
          <div className="DocChanges__type">
            <span className="DocChanges__label">Type</span>
            <ValuePair before={change.before} after={change.after} />
          </div>
        )}
        <ChildChanges changes={change.children} />
      </>
    );
  }
  return <ValueDiff change={change} />;
}

/** The contents of an added or removed array item or one-of value. */
function ChildChanges(props: {changes: DocChange[]}) {
  if (props.changes.length === 0) {
    return <div className="DocChanges__note">No content.</div>;
  }
  return (
    <div className="DocChanges__children">
      {props.changes.map((child) => (
        <div
          className="DocChanges__child"
          key={`${child.type}:${child.deepKey}`}
        >
          {child.path.length > 0 && (
            <div className="DocChanges__label">
              {child.path.join(FIELD_PATH_SEPARATOR)}
            </div>
          )}
          <ChangeBody change={child} />
        </div>
      ))}
    </div>
  );
}

/** Renders the before and after values of a leaf field. */
function ValueDiff(props: {change: DocChange}) {
  const {field, before, after} = props.change;
  switch (field?.type) {
    case 'richtext':
      return <RichTextDiff before={before} after={after} />;
    case 'image':
    case 'file':
      return <FileDiff before={before} after={after} />;
    case 'boolean':
      return (
        <ValuePair
          before={formatBoolean(field, before)}
          after={formatBoolean(field, after)}
        />
      );
    case 'select':
      return (
        <ValuePair
          before={formatSelectValue(field, before)}
          after={formatSelectValue(field, after)}
        />
      );
    case 'multiselect':
      return (
        <ListDiff
          before={toStringList(before).map((v) => formatSelectValue(field, v))}
          after={toStringList(after).map((v) => formatSelectValue(field, v))}
        />
      );
    case 'reference':
      return <ValuePair before={before?.id} after={after?.id} />;
    case 'references':
      return (
        <ListDiff
          before={toReferenceIds(before)}
          after={toReferenceIds(after)}
        />
      );
    case 'datetime':
      return (
        <ValuePair
          before={formatDateTime(before, field.timezone)}
          after={formatDateTime(after, field.timezone)}
        />
      );
    case 'date':
    case 'number':
      return (
        <ValuePair before={formatText(before)} after={formatText(after)} />
      );
    case 'password':
      return (
        <div className="DocChanges__note">
          {!before
            ? 'Password set.'
            : !after
              ? 'Password removed.'
              : 'Password changed.'}
        </div>
      );
    default:
      break;
  }
  if (testTimestamp(before) || testTimestamp(after)) {
    return (
      <ValuePair
        before={formatDateTime(before)}
        after={formatDateTime(after)}
      />
    );
  }
  if (testPrimitive(before) && testPrimitive(after)) {
    return <TextDiff before={formatText(before)} after={formatText(after)} />;
  }
  // Values without a known shape are shown as JSON.
  return (
    <TextDiff
      before={formatJson(before)}
      after={formatJson(after)}
      monospace
      prose
    />
  );
}

/**
 * Shows how a piece of text changed. Short values are shown as a
 * "before → after" pair, longer text as an inline word diff.
 */
function TextDiff(props: {
  before?: string;
  after?: string;
  /** Always show a word diff, even for short text. */
  prose?: boolean;
  monospace?: boolean;
}) {
  const {before, after} = props;
  const className = joinClassNames(
    'DocChanges__text',
    props.monospace && 'DocChanges__text--monospace'
  );
  if (before === undefined || after === undefined) {
    return (
      <div className={className}>
        {before !== undefined && <del>{before}</del>}
        {after !== undefined && <ins>{after}</ins>}
      </div>
    );
  }
  const isShort =
    before.length <= SHORT_TEXT_LENGTH &&
    after.length <= SHORT_TEXT_LENGTH &&
    !before.includes('\n') &&
    !after.includes('\n');
  if (isShort && !props.prose) {
    return <ValuePair before={before} after={after} />;
  }

  const parts = diffWordsWithSpace(before, after);
  const unchangedLength = parts
    .filter((part) => !part.added && !part.removed)
    .reduce((total, part) => total + part.value.length, 0);
  const similarity = unchangedLength / Math.max(before.length, after.length, 1);
  if (similarity < MIN_INLINE_SIMILARITY) {
    return (
      <div className="DocChanges__split">
        <div className={className}>
          <del>{before}</del>
        </div>
        <div className={className}>
          <ins>{after}</ins>
        </div>
      </div>
    );
  }
  return (
    <div className={className}>
      {parts.map((part, i) => {
        if (part.added) {
          return <ins key={i}>{part.value}</ins>;
        }
        if (part.removed) {
          return <del key={i}>{part.value}</del>;
        }
        return <span key={i}>{part.value}</span>;
      })}
    </div>
  );
}

/** Shows a value replacing another, e.g. `Draft → Published`. */
function ValuePair(props: {
  before?: ComponentChildren;
  after?: ComponentChildren;
}) {
  const hasBefore = testPresent(props.before);
  const hasAfter = testPresent(props.after);
  return (
    <div className="DocChanges__pair">
      {hasBefore && <del className="DocChanges__value">{props.before}</del>}
      {hasBefore && hasAfter && (
        <IconArrowRight
          className="DocChanges__pair__arrow"
          size={14}
          stroke={1.75}
        />
      )}
      {hasAfter && <ins className="DocChanges__value">{props.after}</ins>}
    </div>
  );
}

/** Shows the values added to and removed from a list, e.g. tags. */
function ListDiff(props: {before: string[]; after: string[]}) {
  const before = new Set(props.before);
  const after = new Set(props.after);
  const items: Array<{value: string; status: 'added' | 'removed' | 'same'}> =
    [];
  props.after.forEach((value) => {
    items.push({value, status: before.has(value) ? 'same' : 'added'});
  });
  props.before.forEach((value) => {
    if (!after.has(value)) {
      items.push({value, status: 'removed'});
    }
  });
  const orderChanged =
    props.before.filter((v) => after.has(v)).join('\n') !==
    props.after.filter((v) => before.has(v)).join('\n');
  return (
    <div className="DocChanges__list">
      {items.map((item) => {
        const Tag =
          item.status === 'added'
            ? 'ins'
            : item.status === 'removed'
              ? 'del'
              : 'span';
        return (
          <Tag
            key={`${item.status}:${item.value}`}
            className={joinClassNames(
              'DocChanges__chip',
              `DocChanges__chip--${item.status}`
            )}
          >
            {item.value}
          </Tag>
        );
      })}
      {orderChanged && <span className="DocChanges__note">Order changed.</span>}
    </div>
  );
}

/** Shows the old and new order of an array's items. */
function OrderDiff(props: {before: string[]; after: string[]}) {
  return (
    <div className="DocChanges__order">
      <div className="DocChanges__order__column">
        <div className="DocChanges__label">Before</div>
        <ol className="DocChanges__order__list">
          {props.before.map((name, i) => (
            <li key={i}>{name}</li>
          ))}
        </ol>
      </div>
      <div className="DocChanges__order__column">
        <div className="DocChanges__label">After</div>
        <ol className="DocChanges__order__list">
          {props.after.map((name, i) => (
            <li
              key={i}
              className={joinClassNames(
                name !== props.before[i] && 'DocChanges__order__moved'
              )}
            >
              {name}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

/** Shows rich text as plain text, with a word diff of the changes. */
function RichTextDiff(props: {before?: any; after?: any}) {
  const before = props.before ? richTextToPlainText(props.before) : undefined;
  const after = props.after ? richTextToPlainText(props.after) : undefined;
  if (before !== undefined && before === after) {
    return (
      <>
        <div className="DocChanges__note">
          Only the formatting or embedded content changed.
        </div>
        <div className="DocChanges__text DocChanges__text--muted">{after}</div>
      </>
    );
  }
  return <TextDiff before={before} after={after} prose />;
}

interface FileValue {
  src?: string;
  filename?: string;
  alt?: string;
  [key: string]: any;
}

/** Shows an image or file being added, removed or replaced. */
function FileDiff(props: {before?: FileValue; after?: FileValue}) {
  const {before, after} = props;
  if (before?.src && before.src === after?.src) {
    // Same file, so only its details (e.g. alt text) changed.
    return (
      <div className="DocChanges__file">
        <FileCard file={after} />
        <div className="DocChanges__file__details">
          {before.alt !== after.alt ? (
            <>
              <div className="DocChanges__label">Alt text</div>
              <TextDiff
                before={before.alt || undefined}
                after={after.alt || undefined}
              />
            </>
          ) : (
            <div className="DocChanges__note">File details changed.</div>
          )}
        </div>
      </div>
    );
  }
  return (
    <div className="DocChanges__files">
      {before && <FileCard file={before} status="removed" />}
      {before && after && (
        <IconArrowRight
          className="DocChanges__pair__arrow"
          size={16}
          stroke={1.75}
        />
      )}
      {after && <FileCard file={after} status="added" />}
    </div>
  );
}

function FileCard(props: {file: FileValue; status?: 'added' | 'removed'}) {
  const file = props.file;
  const src = file.src || '';
  const name = file.filename || src.split('/').pop() || src;
  const canPreview = testIsImageFile(src) || testIsVideoFile(src);
  return (
    <a
      className={joinClassNames(
        'DocChanges__fileCard',
        props.status && `DocChanges__fileCard--${props.status}`
      )}
      href={src}
      target="_blank"
      rel="noopener noreferrer"
      title={src}
    >
      <div className="DocChanges__fileCard__preview">
        {canPreview ? (
          <FilePreview
            file={file}
            width={160}
            height={100}
            fit="contain"
            alt={file.alt || ''}
            withPlaceholder
          />
        ) : (
          <IconFile size={28} stroke={1.5} />
        )}
      </div>
      <div className="DocChanges__fileCard__name">{name}</div>
      {file.alt && <div className="DocChanges__fileCard__alt">{file.alt}</div>}
    </a>
  );
}

function formatBoolean(field: schema.BooleanField, value: any) {
  const label = value ? 'On' : 'Off';
  return field.checkboxLabel ? `${label}: ${field.checkboxLabel}` : label;
}

function formatSelectValue(
  field: schema.SelectField | schema.MultiSelectField,
  value: any
): string {
  if (value === undefined || value === null) {
    return value;
  }
  const options = field.options || [];
  for (const option of options) {
    if (typeof option === 'string') {
      continue;
    }
    if (option.value === value && option.label && option.label !== value) {
      return `${option.label} (${value})`;
    }
  }
  return String(value);
}

function formatDateTime(value: any, timeZone?: string): string | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  const millis =
    typeof value === 'number'
      ? value
      : testTimestamp(value)
        ? toMillis(value)
        : Date.parse(String(value));
  if (Number.isNaN(millis)) {
    return String(value);
  }
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: timeZone || undefined,
    timeZoneName: timeZone ? 'short' : undefined,
  }).format(new Date(millis));
}

function formatText(value: any): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  return String(value);
}

function formatJson(value: any): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  return stableJsonStringify(value);
}

function toStringList(value: any): string[] {
  return Array.isArray(value) ? value.map((v) => String(v)) : [];
}

function testPrimitive(value: any): boolean {
  return value === undefined || value === null || typeof value !== 'object';
}

function testPresent(value: ComponentChildren): boolean {
  return value !== undefined && value !== null && value !== '';
}
