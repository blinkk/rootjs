import {
  ActionIcon,
  Box,
  Button,
  ColorInput,
  Divider,
  Loader,
  LoadingOverlay,
  MantineSize,
  Modal,
  Stack,
  Table,
  Textarea,
  TextInput,
  Tooltip,
  useMantineTheme,
} from '@mantine/core';
import {Menu} from '@mantine/core';
import {showNotification} from '@mantine/notifications';
import {
  IconCopy,
  IconDownload,
  IconFileUpload,
  IconInfoCircle,
  IconPaperclip,
  IconPhotoStar,
  IconPhotoUp,
  IconTrash,
} from '@tabler/icons-preact';
import {IconDotsVertical} from '@tabler/icons-preact';
import {createContext} from 'preact';
import {ChangeEvent, CSSProperties, forwardRef} from 'preact/compat';
import {useContext, useEffect, useRef, useState} from 'preact/hooks';
import {joinClassNames} from '../../utils/classes.js';
import {
  buildDownloadURL,
  getFileExt,
  testIsGoogleCloudImageFile,
  testIsImageFile,
  testIsVideoFile,
  UploadedFile,
  uploadFileToGCS,
} from '../../utils/gcs.js';

import './FileUploadField.css';
import {testHasExperimentParam} from '../../utils/url-params.js';

/** Mimetypes accepted by the image input field. */
const IMAGE_MIMETYPES = [
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/svg+xml',
  'image/webp',
];

/** Default placeholder colors (from https://v4.mantine.dev/core/color-picker/#with-swatches). */
const PLACEHOLDER_COLORS = [
  '#25262b',
  '#868e96',
  '#fa5252',
  '#e64980',
  '#be4bdb',
  '#7950f2',
  '#4c6ef5',
  '#228be6',
  '#15aabf',
  '#12b886',
  '#40c057',
  '#82c91e',
  '#fab005',
  '#fd7e14',
];

type FileUploadFieldVariant = 'file' | 'image';

const DISABLE_AUTOSIZE = testHasExperimentParam('DisableTextareaAutosize');

interface FileUploadFieldProps {
  children?: preact.ComponentChildren;
  file?: UploadedFile | null;
  variant?: FileUploadFieldVariant;
  onFileChange?: (file: UploadedFile | null) => void;
  /** Set to false to disable alt text input. */
  alt?: boolean;
  /**
   * Limit the accepted file extensions. The value may be any unique file type specifier.
   * @see https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Attributes/accept#unique_file_type_specifiers
   */
  exts?: string[];
  /**
   * Cache-control header to set on the GCS object.
   */
  cacheControl?: string;
  /**
   * Whether to preserve the final serving filename when a user uploads a file.
   * By default, the filename is hashed for obfuscation purposes.
   */
  preserveFilename?: boolean;
}

interface FileUploader {
  uploadedFile?: UploadedFile | null;
  state?: 'uploading' | 'finished' | 'error';
  file?: File;
}

interface FileUploadContextValue {
  fileUpload: FileUploader | null;
  variant?: FileUploadFieldVariant;
  /** Set to false to disable alt text input. */
  alt?: boolean;
  /** Accepted file types. If empty, accepts all file types. */
  acceptedFileTypes: string[];
  focusDropZone: () => void;
  handleFile: (file: File) => void;
  removeFile: () => void;
  requestFileUpload: () => void;
  requestFileDownload: () => void;
  requestPlaceholderModalOpen: () => void;
  setFileData: (uploadedFile: UploadedFile) => void;
  setAltText: (altText: string) => void;
}

export const FileUploadFileContext =
  createContext<FileUploadContextValue | null>(null);

export function FileUploadField(props: FileUploadFieldProps) {
  const theme = useMantineTheme();
  const dropZoneRef = useRef<HTMLButtonElement>(null);
  const [placeholderModalOpened, setPlaceholderModalOpened] = useState(false);
  const [fileUploader, setFileUploader] = useState<FileUploader>({
    uploadedFile: props.file,
  });
  const acceptedFileTypes =
    props.exts ?? (props.variant === 'image' ? IMAGE_MIMETYPES : []);

  useEffect(() => {
    setFileUploader((prev) => ({...prev, uploadedFile: props.file}));
  }, [props.file]);

  /** Uploads file data to GCS. */
  async function uploadFile(file: File) {
    try {
      setFileUploader((prev) => ({
        ...prev,
        state: 'uploading',
        file,
      }));
      const uploadedFile = await uploadFileToGCS(file, {
        preserveFilename: props.preserveFilename,
        cacheControl: props.cacheControl,
      });
      setFileData(uploadedFile);
    } catch (err) {
      console.error('upload failed');
      console.error(err);
      setFileUploader((prev) => ({
        ...prev,
        state: 'error',
      }));
      showNotification({
        title: 'Upload failed',
        message: 'Failed to upload: ' + String(err),
        color: 'red',
        autoClose: false,
      });
    }
  }

  /** Updates the uploaded file data in the state and invokes the callback (so the JSON data can be saved in the document that references the field). */
  function setFileData(uploadedFile: UploadedFile) {
    setFileUploader((prev) => ({
      ...prev,
      uploadedFile: {
        ...prev.uploadedFile,
        ...uploadedFile,
      },
    }));
    props.onFileChange?.(uploadedFile);
    setFileUploader((prev) => ({
      ...prev,
      uploadedFile: uploadedFile,
      state: 'finished',
    }));
  }

  /** Validates incoming file data and if it passes validation, uploads it. */
  function handleFile(file: File) {
    if (!file) {
      return;
    }
    const ext = getFileExt(file.name);
    if (
      acceptedFileTypes.length > 0 &&
      !acceptedFileTypes.some(
        (type) =>
          type.endsWith(ext) ||
          type === `*/${ext}` ||
          type === '*/*' ||
          type === file.type
      )
    ) {
      showNotification({
        title: 'Invalid file type',
        message: `File type ${ext} is not allowed.`,
        color: 'red',
        autoClose: true,
      });
      return;
    }
    uploadFile(file);
  }

  function focusDropZone() {
    dropZoneRef.current?.focus();
  }

  /** Downloads the file. */
  function requestFileDownload() {
    if (!fileUploader.uploadedFile) {
      return;
    }
    // Google Cloud Images can be forced to download as attachments by
    // using their download URL.
    if (testIsGoogleCloudImageFile(fileUploader.uploadedFile.src)) {
      const link = document.createElement('a');
      link.href = buildDownloadURL(fileUploader.uploadedFile.src);
      if (fileUploader.uploadedFile.filename) {
        link.download = fileUploader.uploadedFile.filename;
      }
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else {
      // Other files may not download as attachments so just open them in a new tab.
      window.open(fileUploader.uploadedFile.src, '_blank');
    }
  }

  /** Starts the file upload flow by opening a file picker dialog. */
  function requestFileUpload() {
    const inputEl = document.createElement('input');
    inputEl.type = 'file';
    if (acceptedFileTypes.length > 0) {
      inputEl.accept = acceptedFileTypes.join(',');
    }
    inputEl.onchange = (e) => {
      const target = e.target as HTMLInputElement;
      if (target.files && target.files.length > 0) {
        handleFile(target.files[0]);
      }
    };
    inputEl.click();
    inputEl.remove();
  }

  /** Opens the "create placeholder" modal. */
  function requestPlaceholderModalOpen() {
    setPlaceholderModalOpened(true);
  }

  return (
    <FileUploadFileContext.Provider
      value={{
        fileUpload: fileUploader,
        variant: props.variant,
        alt: props.alt,
        acceptedFileTypes: acceptedFileTypes,
        handleFile: handleFile,
        focusDropZone: focusDropZone,
        requestFileUpload: requestFileUpload,
        requestFileDownload: requestFileDownload,
        requestPlaceholderModalOpen: requestPlaceholderModalOpen,
        setFileData: setFileData,
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
      <Modal
        size="sm"
        opened={placeholderModalOpened}
        onClose={() => setPlaceholderModalOpened(false)}
        title="Placeholder image"
        centered
        overlayColor={
          theme.colorScheme === 'dark'
            ? theme.colors.dark[9]
            : theme.colors.gray[2]
        }
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const formData = new FormData(e.currentTarget);
            const width = parseInt(formData.get('width') as string, 10);
            const height = parseInt(formData.get('height') as string, 10);
            const backgroundColor = formData.get('backgroundColor') as string;
            const label =
              (formData.get('label') as string) || `${width}x${height}`;

            let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" fill="${backgroundColor}" />`;
            if (label) {
              const maxTextWidthRatio = 0.5;
              const estimatedCharWidth = 0.6;
              const fontSize =
                (width * maxTextWidthRatio) /
                (label.length * estimatedCharWidth);
              svg += `<text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-size="${fontSize}" fill="#fff">${label}</text>`;
            }
            svg += '</svg>';

            const encoder = new TextEncoder();
            const uint8Array = encoder.encode(svg);
            const src = `data:image/svg+xml;base64,${btoa(
              String.fromCharCode(...uint8Array)
            )}`;
            const placeholderFile: UploadedFile = {
              src: src,
              filename: 'placeholder.svg',
              width: width,
              height: height,
              alt: '',
            };
            setFileData(placeholderFile);
            setPlaceholderModalOpened(false);
          }}
        >
          <Stack gap="xs">
            <TextInput
              label="Width"
              name="width"
              type="number"
              defaultValue={1600}
              data-autofocus
            />
            <TextInput
              label="Height"
              name="height"
              type="number"
              defaultValue={900}
            />
            <TextInput name="label" label="Label" defaultValue="" autofocus />
            <ColorInput
              name="backgroundColor"
              label="Background color"
              format="hex"
              defaultValue="#868e96"
              swatches={PLACEHOLDER_COLORS}
            />
          </Stack>
          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              marginTop: '1rem',
            }}
          >
            <Button variant="filled" type="submit">
              Create
            </Button>
          </div>
        </form>
      </Modal>
      <div className="FileUploadField">
        <FileUploadField.Dropzone ref={dropZoneRef} />
        {fileUploader.uploadedFile?.src ? (
          <FileUploadField.Preview />
        ) : (
          <FileUploadField.InvisibleDropzone>
            <FileUploadField.Empty />
          </FileUploadField.InvisibleDropzone>
        )}
      </div>
    </FileUploadFileContext.Provider>
  );
}

FileUploadField.Preview = () => {
  const ctx = useContext(FileUploadFileContext);
  const [dragging, setDragging] = useState(false);
  const [copied, setCopied] = useState(false);
  const fileUpload = ctx?.fileUpload;
  if (!fileUpload || !fileUpload.uploadedFile) {
    return null;
  }
  // Videos and images are the only files that get the canvas preview.
  // Other types just show the info panel.
  const supportsCanvasPreview = testShouldHaveAltText(
    ctx?.fileUpload?.uploadedFile?.filename
  );
  const [infoOpened, setInfoOpened] = useState(!supportsCanvasPreview);

  const {uploadedFile} = fileUpload;
  return (
    <div className="FileUploadField__Preview">
      <div className="FileUploadField__Preview__InfoButton">
        {supportsCanvasPreview && (
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
        )}
        <Menu
          className="FileUploadField__Preview__Menu"
          shadow="sm"
          withinPortal={false}
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
            icon={
              ctx.variant === 'image' ? (
                <IconPhotoUp size={16} />
              ) : (
                <IconFileUpload size={16} />
              )
            }
            onClick={() => ctx.requestFileUpload()}
          >
            Upload {ctx.variant === 'image' ? 'image' : 'file'}
          </Menu.Item>
          {testSupportsCreatePlaceholder(ctx.acceptedFileTypes) && (
            <Menu.Item
              disabled={!uploadedFile.src}
              icon={<IconPhotoStar size={16} />}
              onClick={() => {
                ctx.requestPlaceholderModalOpen();
              }}
            >
              Placeholder image
            </Menu.Item>
          )}
          <Divider />
          <Menu.Item
            disabled={uploadedFile.src.startsWith('data:')}
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
          dragging && 'dragging'
        )}
        style={canvasPreviewInlineStyles(uploadedFile)}
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
            <IconPaperclip
              size={16}
              className="FileUploadField__Canvas__Info__Icon"
            />
            <Table
              className="FileUploadField__Canvas__InfoTable"
              verticalSpacing="xs"
              fontSize="xs"
            >
              <tbody>
                {uploadedFile.filename && (
                  <tr>
                    <td>
                      <b>Name</b>
                    </td>
                    <td>{uploadedFile.filename}</td>
                  </tr>
                )}
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
                {uploadedFile.width !== undefined &&
                  uploadedFile.height !== undefined && (
                    <tr>
                      <td>
                        <b>Dimensions</b>
                      </td>
                      <td>
                        {uploadedFile.width}x{uploadedFile.height}
                      </td>
                    </tr>
                  )}
                <tr>
                  <td>
                    <b>URL</b>
                  </td>
                  <td>
                    <Textarea
                      readOnly
                      value={uploadedFile.src}
                      size="xs"
                      autosize={!DISABLE_AUTOSIZE}
                      radius={0}
                    />
                  </td>
                </tr>
              </tbody>
            </Table>
          </div>
        ) : (
          <>
            {uploadedFile.width !== undefined &&
              uploadedFile.height !== undefined && (
                <Box radius="sm" className="FileUploadField__Preview__Info">
                  {uploadedFile.width}x{uploadedFile.height}
                </Box>
              )}
            {testIsImageFile(uploadedFile.src) && (
              <img
                onClick={() => {
                  ctx?.focusDropZone();
                }}
                onDblClick={() => {
                  ctx?.requestFileUpload();
                }}
                src={uploadedFile.src}
                alt={uploadedFile.alt || 'Uploaded file preview'}
                className="FileUploadField__Preview__Image"
              />
            )}
            {testIsVideoFile(uploadedFile.src) && (
              <>
                <video
                  className="FileUploadField__Preview__Image"
                  controls
                  muted
                  preload="metadata"
                >
                  <source
                    src={uploadedFile.src}
                    type={`video/${getFileExt(uploadedFile.src)}`}
                  />
                </video>
              </>
            )}
          </>
        )}
        <div className="FileUploadField__reupload">
          <FileUploadField.UploadButton
            className="FileUploadField__reupload__button"
            compact
          />
        </div>
      </div>
      {ctx.alt !== false &&
        (uploadedFile.alt ||
          testShouldHaveAltText(uploadedFile.filename) ||
          ctx.variant === 'image') && (
          <div className="DocEditor__ImageField__imagePreview__Image__Alt">
            <Textarea
              radius={0}
              className="DocEditor__ImageField__imagePreview__Image__Alt__Textarea"
              value={uploadedFile.alt}
              placeholder="Alt text"
              size="xs"
              autosize
              disabled={ctx.fileUpload?.state === 'uploading'}
              onChange={(e: ChangeEvent<HTMLInputElement>) => {
                ctx?.setAltText(e.currentTarget.value);
              }}
            />
          </div>
        )}
    </div>
  );
};

FileUploadField.UploadButton = (props: {
  className?: string;
  compact?: boolean;
}) => {
  const context = useContext(FileUploadFileContext);
  const uploading = context?.fileUpload?.state === 'uploading';
  if (!context) {
    return null;
  }
  const iconSize = props.compact ? 14 : 16;
  return (
    <Button
      color="black"
      variant="default"
      disabled={uploading}
      size={(props.compact ? 'compact-xs' : 'compact-md') as MantineSize}
      className={joinClassNames(
        'FileUploadField__FileUploadButton',
        props.compact && 'FileUploadField__FileUploadButton--compact'
      )}
      onClick={() => {
        context.requestFileUpload();
      }}
      leftIcon={
        <>
          {uploading && !props.compact ? (
            <Loader size={iconSize} />
          ) : context?.variant === 'image' ? (
            <IconPhotoUp size={iconSize} />
          ) : (
            <IconFileUpload size={iconSize} />
          )}
        </>
      }
    >
      {uploading && !props.compact
        ? 'Uploading...'
        : context?.fileUpload?.uploadedFile?.src
        ? 'Upload'
        : 'Paste, drop, or click to upload'}
    </Button>
  );
};

FileUploadField.InvisibleDropzone = (props: {
  children: preact.ComponentChildren;
}) => {
  const [dragging, setDragging] = useState(false);
  const context = useContext(FileUploadFileContext);
  if (!context) {
    return null;
  }
  return (
    <div
      className={joinClassNames(
        'FileUploadField__InvisibleDropzone',
        dragging && 'dragging'
      )}
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setDragging(false);
        const file = e.dataTransfer?.files[0];
        if (file) {
          context.handleFile(file);
        }
      }}
    >
      {props.children}
    </div>
  );
};

FileUploadField.Empty = () => {
  const context = useContext(FileUploadFileContext);
  if (!context) {
    return null;
  }
  const acceptsLabel = context.acceptedFileTypes
    .map((mimeType) =>
      mimeType.split('/').pop()!.split('+')[0].replaceAll('.', '')
    )
    .sort();
  return (
    <div className="FileUploadField__Empty">
      <div className="FileUploadField__Empty__Label">
        <FileUploadField.UploadButton />
        {testSupportsCreatePlaceholder(context.acceptedFileTypes) && (
          <div>
            <Tooltip label="Create placeholder image">
              <ActionIcon
                className="FileUploadField__Empty__Label__PlaceholderButton"
                onClick={() => {
                  context.requestPlaceholderModalOpen();
                }}
                title="Create placeholder image"
              >
                <IconPhotoStar size={16} />
              </ActionIcon>
            </Tooltip>
          </div>
        )}
      </div>
      {context.acceptedFileTypes.length > 0 && (
        <div>
          <div className="FileUploadField__Empty__AcceptTypes">
            Allowed file types: {acceptsLabel.join(',  ')}
          </div>
        </div>
      )}
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
        dragging && 'dragging'
      )}
      onDblClick={() => {
        context?.requestFileUpload();
      }}
      onCopy={(e) => {
        if (!context?.fileUpload?.uploadedFile) {
          return;
        }
        e.preventDefault();
        e.clipboardData?.setData(
          'text/plain',
          context.fileUpload.uploadedFile.src
        );
        e.clipboardData?.setData(
          'application/json',
          JSON.stringify(context.fileUpload.uploadedFile)
        );
      }}
      onKeyDown={(e) => {
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
        // Handle pasting from one field to another.
        const json = e.clipboardData?.getData('application/json');
        if (json) {
          try {
            const uploadedFile = JSON.parse(json);
            if (
              uploadedFile &&
              uploadedFile.src &&
              uploadedFile.filename &&
              context
            ) {
              console.log('Parsed JSON file:', uploadedFile);
              context.setFileData(uploadedFile);
              return;
            }
          } catch (err) {
            console.error('error parsing json', err);
          }
        }
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

/** Returns whether a file should display the alt text field (based on its filename). */
function testShouldHaveAltText(filename: string | undefined): boolean {
  if (!filename) {
    return false;
  }
  return testIsImageFile(filename) || testIsVideoFile(filename);
}

function testSupportsCreatePlaceholder(acceptedFileTypes: string[]) {
  return (
    acceptedFileTypes.some((type) => type.startsWith('image/')) ||
    acceptedFileTypes.length === 0
  );
}

function canvasPreviewInlineStyles(uploadedFile: UploadedFile) {
  const inlineStyles: CSSProperties = {};
  if (uploadedFile.width && uploadedFile.height) {
    inlineStyles[
      '--canvas-aspect-ratio'
    ] = `${uploadedFile.width} / ${uploadedFile.height}`;

    inlineStyles['--canvas-asset-width'] = `${uploadedFile.width}px`;
    let maxHeight = Math.min(uploadedFile.height, 280);
    if (maxHeight < 80) {
      maxHeight = 80;
    }
    inlineStyles['--canvas-max-height'] = `${maxHeight}px`;
  }

  if (uploadedFile.canvasBgColor === 'dark') {
    inlineStyles['--canvas-bg-color'] = '#000';
  }
  return inlineStyles;
}
