import {TextInput, Textarea} from '@mantine/core';
import {ChangeEvent} from 'preact/compat';
import './StringField.css';
import * as schema from '../../../../core/schema.js';
import {useDraftDocValue} from '../../../hooks/useDraftDoc.js';
import {requestHighlightNode} from '../../../utils/iframe-preview.js';
import {FieldProps} from './FieldProps.js';
import {findSpecialCharacters} from '../../../utils/special-characters.js';

export function StringField(props: FieldProps) {
  const field = props.field as schema.StringField;
  const [value, setValue] = useDraftDocValue(props.deepKey, '');
  const specialCharacters = findSpecialCharacters(value);

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

  if (field.variant === 'textarea') {
    return (
      <div>
        <Textarea
          size="xs"
          radius={0}
          autosize={field.autosize}
          minRows={4}
          maxRows={field.maxRows || 12}
          value={value}
          onChange={onChange}
          onFocus={onFocus}
          onBlur={onBlur}
        />
        {specialCharacters.length > 0 && (
          <div className="StringField__specialCharacters" aria-live="polite">
            {specialCharacters.map((item, index) => (
              <span
                className="StringField__specialCharactersLabel"
                key={`${item.label}-${index}`}
                title={`${item.label} (index ${item.index + 1})`}
              >
                <span className="StringField__specialCharactersChar">
                  {item.char}
                </span>
                <span className="StringField__specialCharactersName">
                  {item.label}
                </span>
              </span>
            ))}
          </div>
        )}
      </div>
    );
  }
  return (
    <div>
      <TextInput
        size="xs"
        radius={0}
        value={value}
        onChange={onChange}
        onFocus={onFocus}
        onBlur={onBlur}
      />
      {specialCharacters.length > 0 && (
        <div className="StringField__specialCharacters" aria-live="polite">
          {specialCharacters.map((item, index) => (
            <span
              className="StringField__specialCharactersLabel"
              key={`${item.label}-${index}`}
              title={`${item.label} (index ${item.index + 1})`}
            >
              <span className="StringField__specialCharactersChar">
                {item.char}
              </span>
              <span className="StringField__specialCharactersName">
                {item.label}
              </span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
