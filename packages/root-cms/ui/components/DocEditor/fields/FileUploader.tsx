import './FileUploader.css';

import {useState} from 'preact/hooks';
import * as schema from '../../../../core/schema.js';
import {joinClassNames} from '../../../utils/classes.js';
import {
  FileFieldInternal,
  FileFieldLoadingState,
  FileFieldValueType,
} from './FileField.js';

type FileFieldVariant = 'file' | 'image';

export interface FileUploaderProps {
  /** The currently uploaded file. */
  value?: FileFieldValueType;
  /** Callback when the file changes. */
  onChange?: (file: FileFieldValueType) => void;
  /** Allowed file extensions or MIME types. */
  accept?: string[];
  /** Whether to show naming options and overwrite protection. */
  showNamingOptions?: boolean;
  /** Variant for UI. */
  variant?: FileFieldVariant;
  className?: string;
  field?: schema.FileField;
  /** Whether to allow editing/replacing the file after upload. Default true. */
  allowEditing?: boolean;
}

/**
 * Standalone file uploader.
 *
 * This component is a controlled component that can be used anywhere in the UI
 * (e.g. AssetsPage). It does not connect to the CMS document state and relies
 * on the `value` and `onChange` props to manage its state.
 */
export function FileUploader(props: FileUploaderProps) {
  const [value, setValue] = useState<FileFieldValueType>(props.value || null);
  const [loadingState, setLoadingState] =
    useState<FileFieldLoadingState | null>(null);

  // Sync prop value
  if (props.value !== undefined && props.value !== value) {
    setValue(props.value);
  }

  const handleChange = (file: FileFieldValueType) => {
    setValue(file);
    if (props.onChange) {
      props.onChange(file);
    }
  };

  const defaultField: schema.FileField = {
    type: 'file',
    label: '',
  };

  return (
    <div className={joinClassNames('FileUploader', props.className)}>
      <FileFieldInternal
        field={props.field || defaultField}
        value={value}
        setValue={handleChange}
        loadingState={loadingState}
        setLoadingState={setLoadingState}
        variant={props.variant}
        showNamingOptions={props.showNamingOptions}
        accept={props.accept}
        allowEditing={props.allowEditing}
      />
    </div>
  );
}
