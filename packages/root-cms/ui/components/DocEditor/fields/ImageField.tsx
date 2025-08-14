import {useEffect, useState} from 'preact/hooks';
import * as schema from '../../../../core/schema.js';
import {UploadedFile} from '../../../utils/gcs.js';
import {FileUploadField} from '../../FileUploadField/FileUploadField.js';
import {FieldProps} from './FieldProps.js';

export function ImageField(props: FieldProps) {
  const field = props.field as schema.ImageField;
  const [uploadedFile, setUploadedFile] = useState<UploadedFile | null>(null);
  useEffect(() => {
    const unsubscribe = props.draft.subscribe(
      props.deepKey,
      (newUploadedFile: UploadedFile | null) => {
        setUploadedFile(newUploadedFile);
      }
    );
    return () => {
      unsubscribe();
    };
  }, []);

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
