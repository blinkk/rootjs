import {useState} from 'preact/hooks';
import * as schema from '../../../../core/schema.js';
import {useDraftDoc, useDraftDocField} from '../../../hooks/useDraftDoc.js';
import {UploadedFile} from '../../../utils/gcs.js';
import {FileUploadField} from '../../FileUploadField/FileUploadField.js';
import {FieldProps} from './FieldProps.js';

export function FileField(props: FieldProps) {
  const field = props.field as schema.FileField;
  const [uploadedFile, setUploadedFile] = useState<UploadedFile | null>(null);
  const draft = useDraftDoc().controller;

  useDraftDocField(props.deepKey, (newUploadedFile: UploadedFile | null) => {
    setUploadedFile(newUploadedFile);
  });

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
          draft.updateKey(props.deepKey, file);
        } else {
          draft.removeKey(props.deepKey);
        }
        setUploadedFile(file);
      }}
    />
  );
}
