import {useEffect, useState} from 'preact/hooks';
import * as schema from '../../../../core/schema.js';
import {UploadedFile} from '../../../utils/gcs.js';
import {FileUploadField} from '../../FileUploadField/FileUploadField.js';
import {FieldProps} from './FieldProps.js';

export function FileField(props: FieldProps) {
  const field = props.field as schema.FileField;
  const [uploadedFile, setUploadedFile] = useState<UploadedFile | null>(
    props.value || null
  );
  useEffect(() => {
    setUploadedFile(props.value || null);
  }, [props.value]);

  return (
    <FileUploadField
      file={uploadedFile}
      variant="file"
      alt={field.alt}
      exts={field.exts}
      preserveFilename={field.preserveFilename}
      cacheControl={field.cacheControl}
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
