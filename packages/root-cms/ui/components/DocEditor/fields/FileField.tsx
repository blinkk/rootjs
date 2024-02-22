import {ActionIcon, TextInput, Tooltip} from '@mantine/core';
import {showNotification} from '@mantine/notifications';
import {IconFileUpload, IconTrash} from '@tabler/icons-preact';
import {useEffect, useRef, useState} from 'preact/hooks';
import * as schema from '../../../../core/schema.js';
import {joinClassNames} from '../../../utils/classes.js';
import {uploadFileToGCS} from '../../../utils/gcs.js';
import {FieldProps} from './FieldProps.js';

export function FileField(props: FieldProps) {
  const field = props.field as schema.FileField;
  const [file, setFile] = useState<any>({});
  const [loading, setLoading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const ref = useRef<HTMLDivElement>(null);

  let accept: string | undefined = undefined;
  if (field.exts) {
    accept = field.exts.join(',');
  }

  async function removeFile() {
    setFile({});
    props.draft.removeKey(props.deepKey);
  }

  async function uploadFile(file: File) {
    setLoading(true);
    try {
      const uploadedFile = await uploadFileToGCS(file, {
        preserveFilename: field.preserveFilename,
      });
      props.draft.updateKey(props.deepKey, uploadedFile);
      setFile(uploadedFile);
      setLoading(false);
    } catch (err) {
      console.error('file upload failed');
      console.error(err);
      setLoading(false);
      showNotification({
        title: 'File upload failed',
        message: 'Failed to upload file: ' + String(err),
        color: 'red',
        autoClose: false,
      });
    }
    // Reset the input element in case the user wishes to re-upload a file.
    if (inputRef.current) {
      const inputEl = inputRef.current;
      inputEl.value = '';
    }
  }

  function onFileChange(e: Event) {
    const inputEl = e.target as HTMLInputElement;
    const files = inputEl.files || [];
    const file = files[0];
    if (file) {
      uploadFile(file);
    }
  }

  const handleDragEnter = (e: DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const files = e.dataTransfer?.files || [];
    const file = files[0];
    if (file) {
      console.log(`file dropped ("${props.deepKey}"):`, file);
      uploadFile(file);
    }
  };

  useEffect(() => {
    const unsubscribe = props.draft.subscribe(
      props.deepKey,
      (newValue: string) => {
        setFile(newValue);
      }
    );

    const dropzone = ref.current;
    document.addEventListener('dragenter', handleDragEnter);
    document.addEventListener('dragover', handleDragEnter);
    document.addEventListener('dragleave', handleDragLeave);
    document.addEventListener('drop', handleDragLeave);
    if (dropzone) {
      dropzone.addEventListener('drop', handleDrop);
    }
    return () => {
      unsubscribe();
      document.removeEventListener('dragenter', handleDragEnter);
      document.removeEventListener('dragover', handleDragEnter);
      document.removeEventListener('dragleave', handleDragLeave);
      document.removeEventListener('drop', handleDragLeave);
      if (dropzone) {
        dropzone.removeEventListener('drop', handleDrop);
      }
    };
  }, []);

  return (
    <div
      className={joinClassNames(
        'DocEditor__FileField',
        isDragging && 'dragging'
      )}
      ref={ref}
    >
      {file && file.src && (
        <div className="DocEditor__FileField__controls">
          <Tooltip label="Remove file">
            <ActionIcon
              className="DocEditor__FileField__controls__trash"
              onClick={() => removeFile()}
            >
              <IconTrash size={16} />
            </ActionIcon>
          </Tooltip>
        </div>
      )}
      {file && file.src ? (
        <div className="DocEditor__FileField__file">
          <TextInput
            className="DocEditor__FileField__file__url"
            size="xs"
            radius={0}
            value={file.src}
            disabled={true}
          />
        </div>
      ) : (
        <div className="DocEditor__FileField__noFile">No file</div>
      )}
      <label
        className="DocEditor__FileField__uploadButton"
        role="button"
        aria-disabled={loading}
      >
        <input
          type="file"
          accept={accept}
          onChange={onFileChange}
          ref={inputRef}
        />
        <div className="DocEditor__FileField__uploadButton__icon">
          <IconFileUpload size={16} />
        </div>
        <div className="DocEditor__FileField__uploadButton__label">
          {loading ? 'Uploading...' : 'Upload file'}
        </div>
      </label>
    </div>
  );
}
