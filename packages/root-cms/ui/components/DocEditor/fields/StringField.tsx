import {TextInput, Textarea} from '@mantine/core';
import {ChangeEvent} from 'preact/compat';
import {useRef} from 'preact/hooks';
import * as schema from '../../../../core/schema.js';
import {useDraftDocValue} from '../../../hooks/useDraftDoc.js';
import {requestHighlightNode} from '../../../utils/iframe-preview.js';
import {FieldProps} from './FieldProps.js';
import './StringField.css';

function Highlighter({
  value,
  variant,
  scrollRef,
}: {
  value: string;
  variant: 'input' | 'textarea';
  scrollRef?: any;
}) {
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
