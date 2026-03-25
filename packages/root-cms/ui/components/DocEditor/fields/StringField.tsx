import './StringField.css';

import {TextInput, Textarea} from '@mantine/core';
import {ChangeEvent} from 'preact/compat';
import {useRef, useState} from 'preact/hooks';
import * as schema from '../../../../core/schema.js';
import {useDraftDocValue} from '../../../hooks/useDraftDoc.js';
import {joinClassNames} from '../../../utils/classes.js';
import {requestHighlightNode} from '../../../utils/iframe-preview.js';
import {FieldProps} from './FieldProps.js';

interface HighlighterProps {
  value: string;
  variant: 'input' | 'textarea';
  scrollRef?: any;
}

function Highlighter(props: HighlighterProps) {
  const {value, variant, scrollRef} = props;
  const parts = value.split(/([\u00A0\u2011])/g);
  return (
    <div
      ref={scrollRef}
      className={`StringField__highlighter StringField__highlighter--${variant}`}
      aria-hidden="true"
    >
      {parts.map((part, i) => {
        if (part === '\u00A0' || part === '\u2011') {
          return (
            <span key={i} className="StringField__highlight">
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

export function StringField(props: FieldProps) {
  const field = props.field as schema.StringField;
  const [value, setValue] = useDraftDocValue(props.deepKey, '');
  const highlighterRef = useRef<HTMLDivElement>(null);
  const inputHighlighterRef = useRef<HTMLDivElement>(null);
  const [jsonError, setJsonError] = useState<string | null>(null);

  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    setValue(e.currentTarget.value);
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
      <div className="StringField__container">
        <Textarea
          className={joinClassNames(
            'StringField__input',
            'StringField__input--json',
            jsonError && 'StringField__input--error'
          )}
          size="xs"
          radius={0}
          autosize={field.autosize}
          minRows={4}
          maxRows={field.maxRows || 20}
          value={value}
          onChange={onChange}
          onFocus={onFocus}
          onBlur={onJsonBlur}
          onScroll={onScroll}
        />
        {jsonError && (
          <div className="StringField__jsonError">
            Invalid JSON: {jsonError}
          </div>
        )}
      </div>
    );
  }

  if (field.variant === 'textarea') {
    return (
      <div className="StringField__container">
        <Highlighter
          value={value || ''}
          variant="textarea"
          scrollRef={highlighterRef}
        />
        <Textarea
          className="StringField__input"
          size="xs"
          radius={0}
          autosize={field.autosize}
          minRows={4}
          maxRows={field.maxRows || 12}
          value={value}
          onChange={onChange}
          onFocus={onFocus}
          onBlur={onBlur}
          onScroll={onScroll}
        />
      </div>
    );
  }
  return (
    <div className="StringField__container">
      <Highlighter
        value={value || ''}
        variant="input"
        scrollRef={inputHighlighterRef}
      />
      <TextInput
        className="StringField__input"
        size="xs"
        radius={0}
        value={value}
        onChange={onChange}
        onFocus={onFocus}
        onBlur={onBlur}
        onScroll={onInputScroll}
      />
    </div>
  );
}
