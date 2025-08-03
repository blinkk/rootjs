import {
  ActionIcon,
  Box,
  Divider,
  Loader,
  LoadingOverlay,
  Table,
  Textarea,
  TextInput,
  Tooltip,
} from '@mantine/core';
import {Menu} from '@mantine/core';
import {showNotification} from '@mantine/notifications';
import {
  IconCopy,
  IconDownload,
  IconInfoCircle,
  IconPhotoUp,
  IconTrash,
} from '@tabler/icons-preact';
import {IconDotsVertical} from '@tabler/icons-preact';
import {createContext} from 'preact';
import {ChangeEvent, forwardRef} from 'preact/compat';
import {useContext, useEffect, useRef, useState} from 'preact/hooks';
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
  focusDropZone: () => void;
  requestFileUpload: () => void;
  requestFileDownload: () => void;
}

export const FileUploadFileContext =
  createContext<FileUploadContextValue | null>(null);

export function FileUploadField(props: FileUploadFieldProps) {
  const dropZoneRef = useRef<HTMLButtonElement>(null);
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

  function focusDropZone() {
    dropZoneRef.current?.focus();
  }

  function requestFileDownload() {
    if (!fileUploader.uploadedFile) {
      return;
    }
    const link = document.createElement('a');
    link.href = buildDownloadURL(fileUploader.uploadedFile.src);
    if (fileUploader.uploadedFile.filename) {
      link.download = fileUploader.uploadedFile.filename;
    }
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  function requestFileUpload() {
    const inputEl = document.createElement('input');
    inputEl.type = 'file';
    inputEl.accept = 'image/*,video/*';
    inputEl.onchange = (e) => {
      const target = e.target as HTMLInputElement;
      if (target.files && target.files.length > 0) {
        handleFile(target.files[0]);
      }
    };
    inputEl.click();
  }

  return (
    <FileUploadFileContext.Provider
      value={{
        fileUpload: fileUploader,
        handleFile: handleFile,
        focusDropZone: focusDropZone,
        requestFileUpload: requestFileUpload,
        requestFileDownload: requestFileDownload,
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
        <FileUploadField.Dropzone ref={dropZoneRef} />
        {fileUploader.uploadedFile?.src ? (
          <FileUploadField.Preview />
        ) : (
          <FileUploadField.Empty />
        )}
      </div>
    </FileUploadFileContext.Provider>
  );
}

function buildDownloadURL(src: string) {
  if (src.startsWith('https://lh3.googleusercontent.com/')) {
    return src.split('=')[0] + '=s0-d';
  }
  return src;
}

FileUploadField.Preview = () => {
  const ctx = useContext(FileUploadFileContext);
  const [infoOpened, setInfoOpened] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [copied, setCopied] = useState(false);
  const fileUpload = ctx?.fileUpload;
  if (!fileUpload || !fileUpload.uploadedFile) {
    return null;
  }
  const {uploadedFile} = fileUpload;
  return (
    <div className="FileUploadField__Preview">
      <div className="FileUploadField__Preview__InfoButton">
        <Tooltip label="Toggle file info" position="top" withArrow>
          <ActionIcon
            onClick={() => setInfoOpened((o) => !o)}
            size="sm"
            variant="outline"
            className="FileUploadField__Preview__InfoButton__Icon"
          >
            <IconInfoCircle size={16} />
          </ActionIcon>
        </Tooltip>
        <Menu
          className="FileUploadField__Preview__Menu"
          shadow="sm"
          withinPortal={true}
          closeOnItemClick={false}
          control={
            <ActionIcon
              variant="outline"
              size="sm"
              radius="sm"
              c="black"
              className="FileUploadField__Preview__InfoButton__Icon"
            >
              <IconDotsVertical size={16} />
            </ActionIcon>
          }
        >
          <Menu.Label size="sm">REPLACE</Menu.Label>
          <Menu.Item
            icon={<IconPhotoUp size={16} />}
            onClick={() => {
              ctx.requestFileUpload();
            }}
          >
            Upload
          </Menu.Item>
          <Divider />
          <Menu.Item
            onClick={() => {
              ctx?.requestFileDownload();
            }}
            icon={<IconDownload size={16} />}
          >
            Download file
          </Menu.Item>
          <Menu.Item
            closeOnItemClick={false}
            icon={<IconCopy size={16} />}
            onClick={() => {
              setCopied(false);
              navigator.clipboard
                .writeText(uploadedFile.src)
                .then(() => setCopied(true))
                .finally(() =>
                  setTimeout(() => {
                    setCopied(false);
                  }, 2000)
                );
            }}
          >
            {copied ? 'Copied!' : 'Copy URL'}
          </Menu.Item>
          <Divider />
          <Menu.Item
            color="red"
            onClick={() => {
              ctx?.removeFile();
            }}
            icon={<IconTrash size={16} />}
          >
            Remove file
          </Menu.Item>
        </Menu>
      </div>
      <div
        className={joinClassNames(
          'FileUploadField__Canvas',
          infoOpened && 'FileUploadField__Canvas--infoOpened',
          dragging && 'FileUploadField__Canvas--dragging'
        )}
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
          const file = e.dataTransfer?.files[0];
          if (file && ctx) {
            ctx.handleFile(file);
          }
        }}
        onPaste={(e) => {
          e.preventDefault();
          const file = e.clipboardData?.files[0];
          if (file && ctx) {
            ctx.handleFile(file);
          }
        }}
      >
        <LoadingOverlay visible={ctx.fileUpload?.state === 'uploading'} />
        {infoOpened ? (
          <div className="FileUploadField__Canvas__Info">
            <Table
              className="FileUploadField__Canvas__InfoTable"
              verticalSpacing="xs"
              fontSize="xs"
            >
              <tbody>
                {uploadedFile.uploadedAt && (
                  <tr>
                    <td>
                      <b>Uploaded</b>
                    </td>
                    <td>
                      {new Date(
                        parseInt(uploadedFile.uploadedAt as string, 10)
                      ).toLocaleString()}
                      {uploadedFile.uploadedBy && (
                        <> by {uploadedFile.uploadedBy}</>
                      )}
                    </td>
                  </tr>
                )}
                <tr>
                  <td>
                    <b>Name</b>
                  </td>
                  <td>{uploadedFile.filename}</td>
                </tr>
                <tr>
                  <td>
                    <b>Dimensions</b>
                  </td>
                  <td>
                    {uploadedFile.width}x{uploadedFile.height}
                  </td>
                </tr>
                <tr>
                  <td>
                    <b>URL</b>
                  </td>
                  <td>
                    <Textarea
                      readOnly
                      value={uploadedFile.src}
                      size="xs"
                      autosize
                      radius={0}
                    />
                  </td>
                </tr>
              </tbody>
            </Table>
          </div>
        ) : (
          <>
            <Box radius="sm" className="FileUploadField__Preview__Info">
              {uploadedFile.width}x{uploadedFile.height}
            </Box>
            <img
              onClick={() => {
                console.log('Image clicked, focusing drop zone');
                ctx?.focusDropZone();
              }}
              src={uploadedFile.src}
              alt={uploadedFile.alt || 'Uploaded file preview'}
              className="FileUploadField__Preview__Image"
            />
          </>
        )}
      </div>
      <div className="DocEditor__ImageField__imagePreview__Image__Alt">
        <Textarea
          radius={0}
          className="DocEditor__ImageField__imagePreview__Image__Alt__Textarea"
          value={uploadedFile.alt}
          placeholder="Alt text"
          size="xs"
          autosize
          onChange={(e: ChangeEvent<HTMLInputElement>) => {
            ctx?.setAltText(e.currentTarget.value);
          }}
        />
      </div>
    </div>
  );
};

FileUploadField.UploadButton = forwardRef<HTMLLabelElement, {}>(
  (props, ref) => {
    const context = useContext(FileUploadFileContext);
    const uploading = context?.fileUpload?.state === 'uploading';

    return (
      <label
        {...props}
        ref={ref}
        className="FileUploadField__FileUploadButton"
        tabIndex={0}
      >
        <input
          disabled={uploading}
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
        {uploading ? <Loader size={16} /> : <IconPhotoUp size={16} />}
        <div className="FileUploadField__FileUploadButton__Title">
          {uploading
            ? 'Uploading...'
            : context?.fileUpload?.uploadedFile?.src
            ? 'Upload'
            : 'Paste, drop, or click to upload'}
        </div>
      </label>
    );
  }
);

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

FileUploadField.Dropzone = forwardRef<HTMLButtonElement, {}>((props, ref) => {
  const [dragging, setDragging] = useState(false);
  const context = useContext(FileUploadFileContext);
  return (
    <button
      ref={ref}
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
          context?.fileUpload?.uploadedFile && context?.removeFile();
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
});
