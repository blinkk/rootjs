import {IconArrowRight, IconFile} from '@tabler/icons-preact';
import {diffWordsWithSpace} from 'diff';
import {ComponentChildren, Fragment} from 'preact';
import * as schema from '../../../../../core/schema.js';
import {FilePreview} from '../../../../components/FilePreview/FilePreview.js';
import {
  testIsImageFile,
  testIsVideoFile,
} from '../../../../integrations/gcs.js';
import {Badge, type BadgeTone} from '../../../../primitives/Badge/Badge.js';
import {cn} from '../../../../utils/classes.js';
import {stableJsonStringify} from '../../../../utils/objects.js';
import {
  DocChange,
  DocChangeType,
  richTextToPlainText,
  testTimestamp,
  toMillis,
  toReferenceIds,
} from '../../doc-changes.js';
import {FIELD_PATH_SEPARATOR} from '../../field-labels.js';

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

const CHANGE_TONES: Record<DocChangeType, BadgeTone> = {
  added: 'success',
  removed: 'danger',
  modified: 'info',
  reordered: 'violet',
};

/** The accent on the left edge of each change card. */
const CHANGE_BORDER_CLASSES: Record<DocChangeType, string> = {
  added: 'border-l-success',
  removed: 'border-l-danger',
  modified: 'border-l-info',
  reordered: 'border-l-violet',
};

const ROOT_CLASSES =
  'DocChanges flex flex-col gap-2 p-3 font-sans text-sm leading-normal';

/** Inserted text. */
const INS_CLASSES = 'rounded-sm bg-success-soft text-success no-underline';

/** Deleted text. */
const DEL_CLASSES = 'rounded-sm bg-danger-soft text-danger line-through';

const LABEL_CLASSES =
  'DocChanges__label mb-0.5 text-xs font-semibold text-muted';

const NOTE_CLASSES = 'DocChanges__note text-sm italic text-muted';

const TEXT_CLASSES = 'DocChanges__text whitespace-pre-wrap wrap-anywhere';

const VALUE_CLASSES = 'wrap-anywhere px-1.5 py-px';

const ORDER_LIST_CLASSES = 'DocChanges__order__list m-0 pl-5';

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
      <div className={cn(ROOT_CLASSES, props.className)}>
        <div className="DocChanges__empty py-3 text-sm text-muted">
          No field changes.
        </div>
      </div>
    );
  }
  return (
    <div className={cn(ROOT_CLASSES, props.className)}>
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
      className={cn(
        'DocChanges__change',
        `DocChanges__change--${change.type}`,
        'min-w-0 rounded-md border border-l-3 border-border bg-surface',
        CHANGE_BORDER_CLASSES[change.type]
      )}
    >
      <div className="DocChanges__change__header flex items-center gap-2 rounded-tr-md border-b border-border bg-surface-hover px-3 py-2">
        <FieldPath path={change.path} />
        <Badge className="DocChanges__badge" tone={CHANGE_TONES[change.type]}>
          {CHANGE_LABELS[change.type]}
        </Badge>
      </div>
      <div className="DocChanges__change__body min-w-0 px-3 py-2.5">
        <ChangeBody change={change} />
      </div>
    </div>
  );
}

/** Renders a field path as breadcrumbs, emphasizing the last segment. */
function FieldPath(props: {path: string[]}) {
  const path = props.path;
  return (
    <div
      className="DocChanges__path min-w-0 flex-1 truncate text-sm"
      title={path.join(FIELD_PATH_SEPARATOR)}
    >
      {path.map((segment, i) => (
        <Fragment key={i}>
          {i > 0 && (
            <span className="DocChanges__path__separator text-subtle">
              {FIELD_PATH_SEPARATOR}
            </span>
          )}
          <span
            className={cn(
              'DocChanges__path__segment',
              i === path.length - 1
                ? 'DocChanges__path__segment--last font-semibold'
                : 'text-muted'
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
          <div className="DocChanges__type mb-2 flex items-center gap-2">
            <span className={cn(LABEL_CLASSES, 'mb-0')}>Type</span>
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
    return <div className={NOTE_CLASSES}>No content.</div>;
  }
  return (
    <div className="DocChanges__children flex flex-col gap-2">
      {props.changes.map((child) => (
        <div
          className="DocChanges__child min-w-0"
          key={`${child.type}:${child.deepKey}`}
        >
          {child.path.length > 0 && (
            <div className={LABEL_CLASSES}>
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
        <div className={NOTE_CLASSES}>
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
  const className = cn(
    TEXT_CLASSES,
    props.monospace && 'DocChanges__text--monospace font-mono text-sm'
  );
  if (before === undefined || after === undefined) {
    return (
      <div className={className}>
        {before !== undefined && <del className={DEL_CLASSES}>{before}</del>}
        {after !== undefined && <ins className={INS_CLASSES}>{after}</ins>}
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
      <div className="DocChanges__split flex flex-col gap-1.5">
        <div className={className}>
          <del className={cn(DEL_CLASSES, 'block px-2 py-1')}>{before}</del>
        </div>
        <div className={className}>
          <ins className={cn(INS_CLASSES, 'block px-2 py-1')}>{after}</ins>
        </div>
      </div>
    );
  }
  return (
    <div className={className}>
      {parts.map((part, i) => {
        if (part.added) {
          return (
            <ins key={i} className={INS_CLASSES}>
              {part.value}
            </ins>
          );
        }
        if (part.removed) {
          return (
            <del key={i} className={DEL_CLASSES}>
              {part.value}
            </del>
          );
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
    <div className="DocChanges__pair flex min-w-0 flex-wrap items-center gap-1.5">
      {hasBefore && (
        <del className={cn('DocChanges__value', VALUE_CLASSES, DEL_CLASSES)}>
          {props.before}
        </del>
      )}
      {hasBefore && hasAfter && (
        <IconArrowRight
          className="DocChanges__pair__arrow shrink-0 text-muted"
          size={14}
          stroke={1.75}
        />
      )}
      {hasAfter && (
        <ins className={cn('DocChanges__value', VALUE_CLASSES, INS_CLASSES)}>
          {props.after}
        </ins>
      )}
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
    <div className="DocChanges__list flex flex-wrap items-center gap-1.5">
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
            className={cn(
              'DocChanges__chip',
              `DocChanges__chip--${item.status}`,
              'rounded-full border border-border px-2 py-px text-sm',
              item.status === 'added' &&
                cn(INS_CLASSES, 'rounded-full border-success-line'),
              item.status === 'removed' &&
                cn(DEL_CLASSES, 'rounded-full border-danger-line')
            )}
          >
            {item.value}
          </Tag>
        );
      })}
      {orderChanged && <span className={NOTE_CLASSES}>Order changed.</span>}
    </div>
  );
}

/** Shows the old and new order of an array's items. */
function OrderDiff(props: {before: string[]; after: string[]}) {
  return (
    <div className="DocChanges__order grid grid-cols-2 gap-3">
      <div className="DocChanges__order__column min-w-0">
        <div className={LABEL_CLASSES}>Before</div>
        <ol className={ORDER_LIST_CLASSES}>
          {props.before.map((name, i) => (
            <li key={i}>{name}</li>
          ))}
        </ol>
      </div>
      <div className="DocChanges__order__column min-w-0">
        <div className={LABEL_CLASSES}>After</div>
        <ol className={ORDER_LIST_CLASSES}>
          {props.after.map((name, i) => (
            <li
              key={i}
              className={cn(
                name !== props.before[i] &&
                  'DocChanges__order__moved font-semibold'
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
        <div className={NOTE_CLASSES}>
          Only the formatting or embedded content changed.
        </div>
        <div
          className={cn(
            TEXT_CLASSES,
            'DocChanges__text--muted mt-1 text-muted'
          )}
        >
          {after}
        </div>
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
      <div className="DocChanges__file flex flex-wrap items-start gap-3">
        <FileCard file={after} />
        <div className="DocChanges__file__details min-w-0 flex-1">
          {before.alt !== after.alt ? (
            <>
              <div className={LABEL_CLASSES}>Alt text</div>
              <TextDiff
                before={before.alt || undefined}
                after={after.alt || undefined}
              />
            </>
          ) : (
            <div className={NOTE_CLASSES}>File details changed.</div>
          )}
        </div>
      </div>
    );
  }
  return (
    <div className="DocChanges__files flex flex-wrap items-center gap-3">
      {before && <FileCard file={before} status="removed" />}
      {before && after && (
        <IconArrowRight
          className="DocChanges__pair__arrow shrink-0 text-muted"
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
      className={cn(
        'DocChanges__fileCard',
        props.status && `DocChanges__fileCard--${props.status}`,
        'flex w-43 max-w-full flex-col gap-1 rounded-md border border-border p-1.5 text-inherit no-underline hover:border-border-strong',
        props.status === 'added' && 'border-success-line bg-success-soft',
        props.status === 'removed' && 'border-danger-line bg-danger-soft'
      )}
      href={src}
      target="_blank"
      rel="noopener noreferrer"
      title={src}
    >
      <div
        className={cn(
          'DocChanges__fileCard__preview flex h-25 items-center justify-center overflow-hidden rounded-sm bg-chip text-muted',
          props.status === 'removed' && 'opacity-60'
        )}
      >
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
      <div className="DocChanges__fileCard__name truncate text-xs font-semibold">
        {name}
      </div>
      {file.alt && (
        <div className="DocChanges__fileCard__alt wrap-anywhere text-xs text-muted">
          {file.alt}
        </div>
      )}
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
  // Note: `dateStyle` and `timeStyle` can't be combined with `timeZoneName`,
  // so the date and time parts are set individually.
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
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
