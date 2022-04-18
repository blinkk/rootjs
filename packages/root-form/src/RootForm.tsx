import {Dispatch, SetStateAction} from 'react';
import {FieldConfig} from './field';
import {TextField} from './fields/TextField';

export interface RootFormConfig {
  fields: FieldConfig[];
}

export interface RootFormProps {
  currentValue: Record<string, unknown>;
  originalValue: Record<string, unknown>;
  configuration: RootFormConfig;
  setValue:
    | Dispatch<SetStateAction<Record<string, unknown>>>
    | ((value: Record<string, unknown>) => void);
}

export function RootForm(props: RootFormProps): JSX.Element {
  return (
    <div>
      <TextField
        currentValue={props.currentValue}
        originalValue={props.originalValue}
        fieldConfig={props.configuration.fields[0]}
        setValue={(value: unknown) => {
          props.setValue({title: value});
        }}
      ></TextField>
    </div>
  );
}
