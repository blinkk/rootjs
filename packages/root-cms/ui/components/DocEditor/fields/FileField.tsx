import {ActionIcon, TextInput, Tooltip} from '@mantine/core';
import {showNotification} from '@mantine/notifications';
import {IconFileUpload, IconTrash} from '@tabler/icons-preact';
import {ChangeEvent} from 'preact/compat';
import {useEffect, useRef, useState} from 'preact/hooks';
import * as schema from '../../../../core/schema.js';
import {joinClassNames} from '../../../utils/classes.js';
import {
  GCI_URL_PREFIX,
  IMAGE_EXTS,
  VIDEO_EXTS,
  getFileExt,
  uploadFileToGCS,
} from '../../../utils/gcs.js';
import {FieldProps} from './FieldProps.js';

export function FileField(props: FieldProps) {
  const field = props.field as schema.FileField;
  const [file, setFile] = useState<any>({});
  const [loading, setLoading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const ref = useRef<HTMLDivElement>(null);

  const showAlt = field.alt !== false;
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
        cacheControl: field.cacheControl,
        preserveFilename: field.preserveFilename,
      });
      setFile((currentFile: any) => {
        const newFile: any = {...uploadedFile};
        if (currentFile?.src && testShouldHaveAltText(currentFile.src)) {
          // Preserve the "alt" text when the file changes.
          newFile.alt = currentFile?.alt || '';
        }
        props.draft.updateKey(props.deepKey, newFile);
        return newFile;
      });
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

  function setAltText(newValue: string) {
    setFile((currentFile: any) => {
      return Object.assign({}, currentFile, {alt: newValue});
    });
    props.draft.updateKey(`${props.deepKey}.alt`, newValue);
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

  const handlePaste = async (e: ClipboardEvent) => {
    const clipboardItems = e.clipboardData?.items || [];
    for (const clipboardItem of clipboardItems) {
      const file = clipboardItem.getAsFile();
      if (file) {
        uploadFile(file);
        return;
      }
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

  const fileUploaded = file && file.src ? file : null;

  return (
    <div
      className={joinClassNames(
        'DocEditor__FileField',
        isDragging && 'dragging'
      )}
      ref={ref}
    >
      {fileUploaded && (
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
      {fileUploaded && testIsImageFile(file.src) && (
        <ImagePreview key={file.src} {...file} />
      )}
      {fileUploaded && testIsVideoFile(file.src) && (
        <VideoPreview key={file.src} {...file} />
      )}
      {fileUploaded ? (
        <div className="DocEditor__FileField__filePreview">
          <div className="DocEditor__FileField__file">
            <TextInput
              className="DocEditor__FileField__file__url"
              size="xs"
              radius={0}
              value={file.src}
              disabled={true}
            />
          </div>
          {showAlt && testShouldHaveAltText(file.src) && (
            <TextInput
              className="DocEditor__FileField__file__alt"
              size="xs"
              radius={0}
              value={file.alt || ''}
              onChange={(e: ChangeEvent<HTMLInputElement>) => {
                setAltText(e.currentTarget.value);
              }}
              label="Alt text"
            />
          )}
        </div>
      ) : (
        <div>
          <div
            className="DocEditor__FileField__noFile"
            tabIndex={0}
            onPaste={handlePaste}
          >
            No file
          </div>
        </div>
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
          {loading ? 'Uploading...' : 'Paste, drop, or click to upload'}
        </div>
      </label>
    </div>
  );
}

function ImagePreview(props: {src: string; width?: number; height?: number}) {
  return (
    <div className="DocEditor__FileField__ImagePreview">
      <img
        src={props.src}
        width={props.width}
        height={props.height}
        loading="lazy"
        alt=""
      />
      {props.width && props.height && (
        <div className="DocEditor__FileField__ImagePreview__dimens">
          {`${props.width}x${props.height}`}
        </div>
      )}
    </div>
  );
}

function VideoPreview(props: {src: string; width?: number; height?: number}) {
  const style: any = {};
  if (props.width && props.height) {
    style['--video-aspect-ratio'] = `${props.width} / ${props.height}`;
  }
  return (
    <div className="DocEditor__FileField__VideoPreview" style={style}>
      <video
        className="DocEditor__FileField__VideoPreview__video"
        controls
        preload="metadata"
      >
        <source src={props.src} type={`video/${getFileExt(props.src)}`} />
      </video>
      {props.width && props.height && (
        <div className="DocEditor__FileField__VideoPreview__dimens">
          {`${props.width}x${props.height}`}
        </div>
      )}
    </div>
  );
}

function testIsImageFile(src: string) {
  if (!src) {
    return false;
  }
  if (src.startsWith(GCI_URL_PREFIX)) {
    return true;
  }
  const ext = getFileExt(src);
  return IMAGE_EXTS.includes(ext);
}

function testIsVideoFile(src: string) {
  if (!src) {
    return false;
  }
  const ext = getFileExt(src);
  return VIDEO_EXTS.includes(ext);
}

function testShouldHaveAltText(src: string) {
  return testIsImageFile(src) || testIsVideoFile(src);
}
