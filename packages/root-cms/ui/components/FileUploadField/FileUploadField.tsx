import {ActionIcon, Loader, TextInput, Tooltip} from '@mantine/core';
import {showNotification} from '@mantine/notifications';
import {IconPhotoUp, IconTrash} from '@tabler/icons-preact';
import {createContext} from 'preact';
import {ChangeEvent} from 'preact/compat';
import {useContext, useEffect, useState} from 'preact/hooks';
import {joinClassNames} from '../../utils/classes.js';
import {UploadedFile, uploadFileToGCS} from '../../utils/gcs.js';

import './FileUploadField.css';

interface FileUploadFieldProps {
  children?: preact.ComponentChildren;
  file?: UploadedFile | null;
  onFileChange?: (file: UploadedFile | null) => void;
}

interface FileUploader {
  uploadedFile?: UploadedFile | null;
  state?: 'uploading' | 'finished' | 'error';
  file?: File;
}

interface FileUploadContextValue {
  fileUpload: FileUploader | null;
  handleFile: (file: File) => void;
  removeFile: () => void;
  setAltText: (altText: string) => void;
}

export const FileUploadFileContext =
  createContext<FileUploadContextValue | null>(null);

export function FileUploadField(props: FileUploadFieldProps) {
  const [fileUploader, setFileUploader] = useState<FileUploader>({
    uploadedFile: props.file,
  });

  useEffect(() => {
    setFileUploader((prev) => ({...prev, uploadedFile: props.file}));
  }, [props.file]);

  async function uploadFile(file: File) {
    try {
      setFileUploader((prev) => ({
        ...prev,
        state: 'uploading',
        file,
      }));
      const uploadedFile = await uploadFileToGCS(file, {
        // cacheControl: field.cacheControl,
      });
      props.onFileChange?.({
        ...uploadedFile,
        alt: fileUploader.uploadedFile?.alt || '',
      });
      setFileUploader((prev) => ({
        ...prev,
        uploadedFile: uploadedFile,
        state: 'finished',
      }));
    } catch (err) {
      console.error('image upload failed');
      console.error(err);
      setFileUploader((prev) => ({
        ...prev,
        state: 'error',
      }));
      showNotification({
        title: 'Image upload failed',
        message: 'Failed to upload image: ' + String(err),
        color: 'red',
        autoClose: false,
      });
    }
  }

  function handleFile(file: File) {
    if (!file) {
      return;
    }
    uploadFile(file);
  }

  return (
    <FileUploadFileContext.Provider
      value={{
        fileUpload: fileUploader,
        handleFile: handleFile,
        setAltText: (altText) => {
          setFileUploader((prev) => {
            if (!prev.uploadedFile) {
              return prev;
            }
            return {
              ...prev,
              uploadedFile: {
                ...prev.uploadedFile,
                alt: altText || '',
              },
            };
          });
          props.onFileChange?.({
            ...fileUploader.uploadedFile,
            alt: altText || '',
          } as UploadedFile);
        },
        removeFile: () => {
          setFileUploader((prev) => ({
            ...prev,
            uploadedFile: null,
          }));
          props.onFileChange?.(null);
        },
      }}
    >
      <div className="FileUploadField">
        <FileUploadField.Dropzone />
        {fileUploader.uploadedFile?.src ? (
          <FileUploadField.Preview />
        ) : (
          <FileUploadField.Empty />
        )}
      </div>
    </FileUploadFileContext.Provider>
  );
}

FileUploadField.Preview = () => {
  const ctx = useContext(FileUploadFileContext);
  const fileUpload = ctx?.fileUpload;
  if (!fileUpload || !fileUpload.uploadedFile) {
    return null;
  }
  const {uploadedFile} = fileUpload;
  return (
    <div className="FileUploadField__Preview">
      <div className="FileUploadField__Canvas">
        <img
          src={uploadedFile.src}
          alt={uploadedFile.alt || 'Uploaded file preview'}
          className="FileUploadField__Preview__Image"
        />
      </div>
      <TextInput
        className="DocEditor__ImageField__imagePreview__Image__Alt"
        size="xs"
        radius={0}
        value={uploadedFile.alt}
        label="Alt text"
        onChange={(e: ChangeEvent<HTMLInputElement>) => {
          ctx?.setAltText(e.currentTarget.value);
        }}
      />
      <div className="FileUploadField__Preview__Actions">
        <FileUploadField.UploadButton />
        <div className="FileUploadField__Preview__Actions__Trash">
          <Tooltip label="Remove file">
            <ActionIcon onClick={() => ctx.removeFile()}>
              <IconTrash size={16} />
            </ActionIcon>
          </Tooltip>
        </div>
      </div>
    </div>
  );
};

FileUploadField.UploadButton = () => {
  const context = useContext(FileUploadFileContext);
  return (
    <label className="FileUploadField__FileUploadButton" tabIndex={0}>
      <input
        disabled={context?.fileUpload?.state === 'uploading'}
        type="file"
        accept="image/*,video/*"
        className="FileUploadField__FileUploadButton__Input"
        onChange={(e) => {
          const target = e.target as HTMLInputElement;
          if (target.files && context) {
            context.handleFile(target.files[0]);
          }
        }}
      />
      {context?.fileUpload?.state === 'uploading' ? (
        <Loader size={16} />
      ) : (
        <IconPhotoUp size={16} />
      )}
      <div className="FileUploadField__FileUploadButton__Title">
        {context?.fileUpload?.state === 'uploading'
          ? 'Uploading...'
          : context?.fileUpload?.uploadedFile?.src
          ? 'Upload'
          : 'Paste, drop, or click to upload'}
      </div>
    </label>
  );
};

FileUploadField.Empty = () => {
  return (
    <div className="FileUploadField__Empty">
      <div className="FileUploadField__Empty__Label">
        <div>
          <FileUploadField.UploadButton />
        </div>
      </div>
      <div>
        <div className="FileUploadField__Empty__AcceptTypes">
          Accepts mp4, jpg, png
        </div>
      </div>
    </div>
  );
};

FileUploadField.Dropzone = () => {
  const [dragging, setDragging] = useState(false);
  const context = useContext(FileUploadFileContext);
  return (
    <button
      className={joinClassNames(
        'FileUploadField__Dropzone',
        dragging && 'FileUploadField__Dropzone--dragging'
      )}
      onKeyDown={(e) => {
        console.log('Key down in dropzone:', e);
        if (
          ((e.metaKey || e.ctrlKey) && e.key === 'Backspace') ||
          e.key === 'Delete'
        ) {
          e.preventDefault();
          context?.removeFile();
        }
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        console.log(e);
        const file = e.dataTransfer?.files[0];
        if (file && context) {
          context.handleFile(file);
        }
      }}
      onPaste={(e) => {
        e.preventDefault();
        const file = e.clipboardData?.files[0];
        if (file && context) {
          context.handleFile(file);
        }
      }}
      title="Drop or paste to upload a file"
    ></button>
  );
};
