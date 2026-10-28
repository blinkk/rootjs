import {useRef, useState} from 'preact/hooks';
import * as schema from '../../../../../../core/schema.js';
import {Textarea} from '../../../../../primitives/Textarea/Textarea.js';
import {TextInput} from '../../../../../primitives/TextInput/TextInput.js';
import {cn} from '../../../../../utils/classes.js';
import {requestHighlightNode} from '../../../iframe-preview.js';
import {useDraftDocValue} from '../../../useDraftDoc.js';
import {FieldProps} from './FieldProps.js';

interface HighlighterProps {
  value: string;
  variant: 'input' | 'textarea';
  scrollRef?: any;
}

function Highlighter(props: HighlighterProps) {
  const {variant, scrollRef} = props;
  const value = typeof props.value === 'string' ? props.value : '';
  const parts = value.split(/([\u00A0\u2011])/g);
  return (
    <div
      ref={scrollRef}
      className={cn(
        'StringField__highlighter',
        `StringField__highlighter--${variant}`,
        'pointer-events-none absolute inset-0 z-0 overflow-hidden whitespace-pre-wrap border border-transparent px-2.5 font-sans text-sm text-transparent',
        // Matches the input's text box, line for line.
        variant === 'input'
          ? 'leading-6.5 pointer-coarse:leading-9.5'
          : 'py-2.5 leading-normal'
      )}
      aria-hidden="true"
    >
      {parts.map((part, i) => {
        if (part === '\u00A0' || part === '\u2011') {
          return (
            <span
              key={i}
              className="StringField__highlight rounded-sm bg-warning-line/40 outline-1 outline-warning/40"
            >
              {part}
            </span>
          );
        }
        return <span key={i}>{part}</span>;
      })}
      {variant === 'textarea' && value.endsWith('\n') && <br />}
    </div>
  );
}

/**
 * The input sits above the highlighter (which marks non-breaking spaces and
 * hyphens), so it's transparent.
 */
const HIGHLIGHTED_INPUT_CLASSES = 'relative z-1 bg-transparent';

export function StringField(props: FieldProps) {
  const field = props.field as schema.StringField;
  const [value, setValue] = useDraftDocValue(props.deepKey, '');
  const label = field.label || field.id;
  const highlighterRef = useRef<HTMLDivElement>(null);
  const inputHighlighterRef = useRef<HTMLDivElement>(null);
  const [jsonError, setJsonError] = useState<string | null>(null);

  // Surface mismatched data instead of silently rendering "[object Object]".
  // The FieldErrorBoundary catches this and shows an inline error, while the
  // rest of the editor keeps working.
  if (value !== null && value !== undefined && typeof value !== 'string') {
    throw new Error(
      `Expected a string value but got ${typeof value}. The stored data for ` +
        'this field may be corrupted. Fix it using "Edit JSON" or restore a previous version.'
    );
  }

  const onInput = (e: Event) => {
    setValue((e.currentTarget as HTMLInputElement | HTMLTextAreaElement).value);
  };

  const onFocus = (e: FocusEvent) => {
    props.onFocus?.(e);
    requestHighlightNode(props.deepKey, {scroll: true});
  };

  const onBlur = (e: FocusEvent) => {
    props.onBlur?.(e);
    requestHighlightNode(null);
  };

  const onJsonBlur = (e: FocusEvent) => {
    const raw = (e.target as HTMLTextAreaElement).value;
    if (raw.trim()) {
      let toParse = raw;
      try {
        // Try common fixes: single quotes -> double quotes, trailing commas.
        const fixed = raw
          .replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, '"$1"')
          .replace(/,\s*([\]}])/g, '$1');
        JSON.parse(fixed);
        toParse = fixed;
      } catch {
        // Ignore: will be caught below.
      }
      try {
        const parsed = JSON.parse(toParse);
        const formatted = JSON.stringify(parsed, null, 2);
        setValue(formatted);
        setJsonError(null);
      } catch (err: any) {
        setJsonError(err.message);
      }
    } else {
      setJsonError(null);
    }
    props.onBlur?.(e);
    requestHighlightNode(null);
  };

  const onScroll = (e: any) => {
    if (highlighterRef.current) {
      highlighterRef.current.scrollTop = e.target.scrollTop;
      highlighterRef.current.scrollLeft = e.target.scrollLeft;
    }
  };

  const onInputScroll = (e: any) => {
    if (inputHighlighterRef.current) {
      inputHighlighterRef.current.scrollLeft = e.target.scrollLeft;
    }
  };

  if (field.variant === 'json') {
    return (
      <div className="StringField__container relative">
        <Textarea
          className="StringField__input StringField__input--json"
          inputClassName="resize-none rounded-none py-2.5 font-mono"
          aria-label={label}
          error={jsonError ? `Invalid JSON: ${jsonError}` : undefined}
          autosize={field.autosize}
          minRows={4}
          maxRows={field.maxRows || 20}
          value={value}
          onInput={onInput}
          onFocus={onFocus}
          onBlur={onJsonBlur}
          onScroll={onScroll}
        />
      </div>
    );
  }

  if (field.variant === 'textarea') {
    return (
      <div className="StringField__container relative bg-surface">
        <Highlighter
          value={value || ''}
          variant="textarea"
          scrollRef={highlighterRef}
        />
        <Textarea
          className="StringField__input"
          inputClassName={cn(
            'resize-none rounded-none py-2.5',
            HIGHLIGHTED_INPUT_CLASSES
          )}
          aria-label={label}
          autosize={field.autosize}
          minRows={4}
          maxRows={field.maxRows || 12}
          value={value}
          onInput={onInput}
          onFocus={onFocus}
          onBlur={onBlur}
          onScroll={onScroll}
        />
      </div>
    );
  }
  return (
    <div className="StringField__container relative bg-surface">
      <Highlighter
        value={value || ''}
        variant="input"
        scrollRef={inputHighlighterRef}
      />
      <TextInput
        className="StringField__input"
        inputClassName={cn('rounded-none', HIGHLIGHTED_INPUT_CLASSES)}
        aria-label={label}
        value={value}
        onInput={onInput}
        onFocus={onFocus}
        onBlur={onBlur}
        onScroll={onInputScroll}
      />
    </div>
  );
}
