import {Dispatch, SetStateAction} from 'react';
import {FieldConfig} from '../field';
import {TextInput} from '@mantine/core';

export interface TextFieldConfig extends FieldConfig {
  // Placeholder text for the input.
  placeholder?: string;
}

export interface TextFieldProps {
  fieldConfig: TextFieldConfig;
  originalValue: Record<string, unknown>;
  currentValue: Record<string, unknown>;
  setValue: Dispatch<SetStateAction<any>> | ((value: string) => void);
}

export function TextField(props: TextFieldProps): JSX.Element {
  return (
    <div>
      <TextInput
        placeholder={props.fieldConfig.placeholder}
        label={props.fieldConfig.label ?? props.fieldConfig.id}
        onChange={e => {
          props.setValue(e.target.value);
        }}
        value={
          (props.currentValue[props.fieldConfig.id] as String) ??
          (props.originalValue[props.fieldConfig.id] as String) ??
          ''
        }
      ></TextInput>
      {/* <div>{JSON.stringify(props.fieldConfig)}</div> */}
    </div>
  );
}
