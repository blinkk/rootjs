import {useEffect, useState} from 'preact/hooks';
import * as schema from '../../../../core/schema.js';
import {UploadedFile} from '../../../utils/gcs.js';
import {FileUploadField} from '../../FileUploadField/FileUploadField.js';
import {FieldProps} from './FieldProps.js';

export function ImageField(props: FieldProps) {
  const field = props.field as schema.ImageField;
  const [uploadedFile, setUploadedFile] = useState<UploadedFile | null>(
    props.value || null
  );
  useEffect(() => {
    setUploadedFile(props.value || null);
  }, [props.value]);

  return (
    <FileUploadField
      file={uploadedFile}
      variant="image"
      alt={field.alt}
      exts={field.exts}
      onFileChange={(file) => {
        if (file) {
          props.draft.updateKey(props.deepKey, file);
        } else {
          props.draft.removeKey(props.deepKey);
        }
        setUploadedFile(file);
      }}
    />
  );
}
