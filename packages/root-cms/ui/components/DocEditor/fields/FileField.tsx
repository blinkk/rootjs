import './FileField.css';

import {
  ActionIcon,
  Box,
  Button,
  Divider,
  Loader,
  LoadingOverlay,
  MantineSize,
  Modal,
  Table,
  Textarea,
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
  IconSparkles,
  IconTrash,
} from '@tabler/icons-preact';
import {IconDotsVertical} from '@tabler/icons-preact';
import {ComponentChildren, createContext} from 'preact';
import {ChangeEvent, CSSProperties, forwardRef} from 'preact/compat';
import {useContext, useMemo, useRef, useState} from 'preact/hooks';
import * as schema from '../../../../core/schema.js';
import {useDraftDocValue} from '../../../hooks/useDraftDoc.js';
import {ChatController, useChat} from '../../../pages/AIPage/AIPage.js';
import {joinClassNames} from '../../../utils/classes.js';
import {
  buildDownloadURL,
  getFileExt,
  testIsGoogleCloudImageFile,
  testIsImageFile,
  testIsVideoFile,
  UploadedFile,
  uploadFileToGCS,
} from '../../../utils/gcs.js';
import {FieldProps} from './FieldProps.js';
import {GenerateImageForm} from './GenerateImageForm.js';

/** Mimetypes accepted by the image input field. */
const IMAGE_MIMETYPES = [
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/svg+xml',
  'image/webp',
];

type FileFieldVariant = 'file' | 'image';

type FileFieldLoadingState = 'loading' | 'complete' | 'error';

type FileFieldProps = FieldProps & {
  variant?: FileFieldVariant;
};

type FileFieldValueType = UploadedFile | null;

interface FileFieldContextValue {
  field: schema.FileField;
  value: FileFieldValueType;
  setValue: (value: FileFieldValueType) => void;
  loadingState: FileFieldLoadingState | null;
  variant?: FileFieldVariant;
  /** Accepted file types. If empty, accepts all file types. */
  acceptedFileTypes: string[];
  focusDropZone: () => void;
  handleFile: (file: File | string, options?: {as?: 'svg'}) => void;
  removeFile: () => void;
  requestFileUpload: () => void;
  requestFileDownload: () => void;
  requestGenerateAltText: (chat: ChatController) => void;
  requestPlaceholderModalOpen: () => void;
  showAltText: boolean;
  altText: string;
  setAltText: (altText: string) => void;
}

const FileFieldContext = createContext<FileFieldContextValue | null>(null);

function useFileField() {
  const ctx = useContext(FileFieldContext);
  if (!ctx) {
    throw new Error(
      'useFileField() should be called within a <FileFieldContext.Provider>'
    );
  }
  return ctx;
}

export function FileField(props: FileFieldProps) {
  const field = props.field as schema.FileField;
  const theme = useMantineTheme();
  const dropZoneRef = useRef<HTMLButtonElement>(null);
  const [placeholderModalOpened, setPlaceholderModalOpened] = useState(false);
  const [value, setValue] = useDraftDocValue<FileFieldValueType>(props.deepKey);
  const [loadingState, setLoadingState] =
    useState<FileFieldLoadingState | null>(null);

  const acceptedFileTypes =
    field.exts ?? (props.variant === 'image' ? IMAGE_MIMETYPES : []);

  const altText = value?.alt || '';
  // The alt text field is visible by default, only hidden when explicitly set
  // to `false`.
  const showAltText = field.alt !== false;

  /** Uploads file data to GCS. */
  async function uploadFile(file: File) {
    try {
      setLoadingState('loading');
      const uploadedFile = await uploadFileToGCS(file, {
        preserveFilename: field.preserveFilename,
        cacheControl: field.cacheControl,
      });
      // Preserve previous alt text when a new file is uploaded.
      if (
        !uploadedFile.alt &&
        testShouldHaveAltText(uploadedFile.filename) &&
        altText
      ) {
        uploadedFile.alt = altText;
      }
      setValue(uploadedFile);
      setLoadingState('complete');
    } catch (err) {
      console.error('upload failed');
      console.error(err);
      setLoadingState('error');
      showNotification({
        title: 'Upload failed',
        message: 'Failed to upload: ' + String(err),
        color: 'red',
        autoClose: false,
      });
    }
  }

  function removeFile() {
    setValue(null);
  }

  /** Validates incoming file data and if it passes validation, uploads it. */
  function handleFile(file: File | string, options?: {as?: 'svg'}) {
    if (!file) {
      return;
    }
    // Convert text to a File.
    if (options?.as === 'svg') {
      file = new File(
        [new Blob([file], {type: 'image/svg+xml'})],
        'untitled.svg',
        {
          type: 'image/svg+xml',
        }
      );
    }
    file = file as File;
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
    if (!value?.src) {
      return;
    }
    // Google Cloud Images can be forced to download as attachments by
    // using their download URL.
    if (testIsGoogleCloudImageFile(value.src)) {
      const link = document.createElement('a');
      link.href = buildDownloadURL(value.src);
      if (value.filename) {
        link.download = value.filename;
      }
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else {
      // Other files may not download as attachments so just open them in a new tab.
      window.open(value.src, '_blank');
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

  function setAltText(altText: string) {
    if (!value?.src) {
      return;
    }
    setValue({...value, alt: altText || ''});
  }

  /** Requests generation of the alt text associated with the uploaded file. */
  async function requestGenerateAltText(chat: ChatController) {
    const uploadedFile = value;
    if (!uploadedFile?.src || !chat) {
      return;
    }
    setLoadingState('loading');
    const resp = await chat.sendPrompt(
      chat.addMessage({
        sender: 'user',
        blocks: [
          {
            type: 'image',
            image: {
              src: uploadedFile.src,
            },
          },
        ],
      }),
      [
        {
          text: 'Generate alt text for the image above.',
        },
        {
          media: {
            url: uploadedFile.src,
          },
        },
      ],
      {
        mode: 'altText',
      }
    );
    if (resp?.error) {
      showNotification({
        title: 'Sorry, something went wrong.',
        message: resp.error,
        color: 'red',
        autoClose: true,
      });
    } else if (resp?.message) {
      setAltText(resp.message);
    }
    setLoadingState('complete');
  }

  return (
    <FileFieldContext.Provider
      value={{
        field: field,
        variant: props.variant,
        value: value,
        setValue: setValue,
        loadingState: loadingState,
        removeFile: removeFile,
        acceptedFileTypes: acceptedFileTypes,
        handleFile: handleFile,
        focusDropZone: focusDropZone,
        requestGenerateAltText: requestGenerateAltText,
        requestFileUpload: requestFileUpload,
        requestFileDownload: requestFileDownload,
        requestPlaceholderModalOpen: requestPlaceholderModalOpen,
        showAltText: showAltText,
        altText: altText,
        setAltText: setAltText,
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
        <GenerateImageForm
          onSubmit={(file) => {
            setValue(file);
            setPlaceholderModalOpened(false);
          }}
        />
      </Modal>
      <div className="FileField">
        <FileField.Dropzone ref={dropZoneRef} />
        {value?.src ? (
          <FileField.Preview />
        ) : (
          <FileField.InvisibleDropzone>
            <FileField.Empty />
          </FileField.InvisibleDropzone>
        )}
      </div>
    </FileFieldContext.Provider>
  );
}

FileField.Preview = () => {
  const ctx = useFileField();
  const [dragging, setDragging] = useState(false);
  const [copied, setCopied] = useState(false);
  const chat = useChat();
  const experiments = window.__ROOT_CTX.experiments || {};

  // Videos and images are the only files that get the canvas preview.
  // Other types just show the info panel.
  const supportsCanvasPreview = testShouldHaveAltText(ctx.value?.filename);
  const [infoOpened, setInfoOpened] = useState(!supportsCanvasPreview);

  if (!ctx.value?.src) {
    return null;
  }

  return (
    <div className="FileField__Preview">
      <div className="FileField__Preview__InfoButton">
        {supportsCanvasPreview && (
          <Tooltip label="Toggle file info" position="top" withArrow>
            <ActionIcon
              onClick={() => setInfoOpened((o) => !o)}
              size="sm"
              variant="outline"
              className="FileField__Preview__InfoButton__Icon"
              aria-label="Toggle file info"
            >
              <IconInfoCircle size={16} />
            </ActionIcon>
          </Tooltip>
        )}
        <Menu
          className="FileField__Preview__Menu"
          shadow="sm"
          withinPortal={false}
          closeOnItemClick={false}
          control={
            <ActionIcon
              variant="outline"
              size="sm"
              radius="sm"
              c="black"
              className="FileField__Preview__InfoButton__Icon"
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
              disabled={!ctx.value?.src}
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
            disabled={ctx.value?.src?.startsWith('data:')}
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
                .writeText(ctx.value?.src || '')
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
          'FileField__Canvas',
          infoOpened && 'FileField__Canvas--infoOpened',
          dragging && 'dragging'
        )}
        style={canvasPreviewInlineStyles(ctx.value)}
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
          // Handle Files.
          const file = e.clipboardData?.files[0];
          if (file) {
            ctx.handleFile(file);
            return;
          }
          // Handle SVG text (supports copying SVG from Figma).
          const text = e.clipboardData?.getData('text/plain');
          if (text && testSvg(text)) {
            ctx.handleFile(text, {as: 'svg'});
            return;
          }
        }}
      >
        <LoadingOverlay visible={ctx.loadingState === 'loading'} />
        {infoOpened ? (
          <div className="FileField__Canvas__Info">
            <IconPaperclip
              size={16}
              className="FileField__Canvas__Info__Icon"
            />
            <Table
              className="FileField__Canvas__InfoTable"
              verticalSpacing="xs"
              fontSize="xs"
            >
              <tbody>
                {ctx.value?.filename && (
                  <tr>
                    <td>
                      <b>Name</b>
                    </td>
                    <td>{ctx.value.filename}</td>
                  </tr>
                )}
                {ctx.value?.uploadedAt && (
                  <tr>
                    <td>
                      <b>Uploaded</b>
                    </td>
                    <td>
                      {new Date(
                        parseInt(ctx.value.uploadedAt as string, 10)
                      ).toLocaleString()}
                      {ctx.value.uploadedBy && <> by {ctx.value.uploadedBy}</>}
                    </td>
                  </tr>
                )}
                {ctx.value?.width && ctx.value?.height && (
                  <tr>
                    <td>
                      <b>Dimensions</b>
                    </td>
                    <td>
                      {ctx.value.width}x{ctx.value.height}
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
                      value={ctx.value?.src}
                      size="xs"
                      radius={0}
                      autosize
                      maxRows={10}
                    />
                  </td>
                </tr>
              </tbody>
            </Table>
          </div>
        ) : (
          <>
            {ctx.value?.width && ctx.value?.height && (
              <Box radius="sm" className="FileField__Preview__Info">
                {ctx.value.width}x{ctx.value.height}
              </Box>
            )}
            {testIsImageFile(ctx.value?.src) && (
              <img
                onClick={() => {
                  ctx?.focusDropZone();
                }}
                onDblClick={() => {
                  ctx?.requestFileUpload();
                }}
                src={ctx.value.src}
                alt={ctx.value.alt || 'Uploaded file preview'}
                className="FileField__Preview__Image"
              />
            )}
            {testIsVideoFile(ctx.value?.src) && (
              <>
                <video
                  className="FileField__Preview__Image"
                  controls
                  muted
                  preload="metadata"
                >
                  <source
                    src={ctx.value.src}
                    type={`video/${getFileExt(ctx.value.src)}`}
                  />
                </video>
              </>
            )}
          </>
        )}
        <div className="FileField__reupload">
          <FileField.UploadButton
            className="FileField__reupload__button"
            compact
          />
        </div>
      </div>
      {ctx.showAltText &&
        (ctx.altText ||
          testShouldHaveAltText(ctx.value?.filename) ||
          ctx.variant === 'image') && (
          <div className="DocEditor__ImageField__imagePreview__Image__Alt">
            <Textarea
              radius={0}
              className="DocEditor__ImageField__imagePreview__Image__Alt__Textarea"
              value={ctx.altText}
              placeholder="Alt text"
              size="xs"
              autosize
              disabled={ctx.loadingState === 'loading'}
              onChange={(e: ChangeEvent<HTMLInputElement>) => {
                ctx?.setAltText(e.currentTarget.value);
              }}
            />
            {experiments.ai &&
              !ctx.altText &&
              ctx.value?.src?.startsWith('http') && (
                <Tooltip
                  label="Generate alt text with AI"
                  position="top"
                  withArrow
                >
                  <ActionIcon
                    className="DocEditor__ImageField__imagePreview__Image__Alt__AiButton"
                    onClick={() => {
                      ctx.requestGenerateAltText(chat);
                    }}
                    disabled={ctx.loadingState === 'loading'}
                  >
                    <IconSparkles size={20} stroke="1.75" />
                  </ActionIcon>
                </Tooltip>
              )}
          </div>
        )}
    </div>
  );
};

FileField.UploadButton = (props: {className?: string; compact?: boolean}) => {
  const ctx = useFileField();
  const loading = ctx.loadingState === 'loading';
  const iconSize = props.compact ? 14 : 16;
  return (
    <Button
      color="black"
      variant="default"
      disabled={loading}
      size={(props.compact ? 'compact-xs' : 'compact-md') as MantineSize}
      className={joinClassNames(
        'FileField__FileUploadButton',
        props.compact && 'FileField__FileUploadButton--compact'
      )}
      onClick={() => {
        ctx.requestFileUpload();
      }}
      leftIcon={
        <>
          {loading && !props.compact ? (
            <Loader size={iconSize} />
          ) : ctx?.variant === 'image' ? (
            <IconPhotoUp size={iconSize} />
          ) : (
            <IconFileUpload size={iconSize} />
          )}
        </>
      }
    >
      {loading && !props.compact
        ? 'Uploading...'
        : ctx.value?.src
        ? 'Upload'
        : 'Paste, drop, or click to upload'}
    </Button>
  );
};

FileField.InvisibleDropzone = (props: {children: ComponentChildren}) => {
  const [dragging, setDragging] = useState(false);
  const ctx = useFileField();
  return (
    <div
      className={joinClassNames(
        'FileField__InvisibleDropzone',
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
          ctx.handleFile(file);
        }
      }}
    >
      {props.children}
    </div>
  );
};

FileField.Empty = () => {
  const ctx = useFileField();
  const acceptsLabel = useMemo(() => {
    if (ctx.acceptedFileTypes.length === 0) {
      return '';
    }
    return ctx.acceptedFileTypes
      .map((mimeType) =>
        mimeType.split('/').pop()!.split('+')[0].replaceAll('.', '')
      )
      .sort()
      .join(', ');
  }, [ctx.acceptedFileTypes]);
  return (
    <div className="FileField__Empty">
      <div className="FileField__Empty__Label">
        <FileField.UploadButton />
        {testSupportsCreatePlaceholder(ctx.acceptedFileTypes) && (
          <div>
            <Tooltip label="Create placeholder image">
              <ActionIcon
                className="FileField__Empty__Label__PlaceholderButton"
                onClick={() => {
                  ctx.requestPlaceholderModalOpen();
                }}
                title="Create placeholder image"
              >
                <IconPhotoStar size={16} />
              </ActionIcon>
            </Tooltip>
          </div>
        )}
      </div>
      {acceptsLabel && (
        <div>
          <div className="FileField__Empty__AcceptTypes">
            Allowed file types: {acceptsLabel}
          </div>
        </div>
      )}
    </div>
  );
};

FileField.Dropzone = forwardRef<HTMLButtonElement, {}>((props, ref) => {
  const [dragging, setDragging] = useState(false);
  const ctx = useFileField();
  return (
    <button
      ref={ref}
      className={joinClassNames('FileField__Dropzone', dragging && 'dragging')}
      onDblClick={() => {
        ctx?.requestFileUpload();
      }}
      onCopy={(e) => {
        if (!ctx.value?.src) {
          return;
        }
        e.preventDefault();
        e.clipboardData?.setData('text/plain', ctx.value.src);
        e.clipboardData?.setData('application/json', JSON.stringify(ctx.value));
      }}
      onKeyDown={(e) => {
        if (
          ((e.metaKey || e.ctrlKey) && e.key === 'Backspace') ||
          e.key === 'Delete'
        ) {
          e.preventDefault();
          if (ctx.value?.src) {
            ctx.removeFile();
          }
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
        if (file && ctx) {
          ctx.handleFile(file);
        }
      }}
      onPaste={(e) => {
        e.preventDefault();
        if (!ctx) {
          return;
        }
        // Handle pasting from one field to another.
        const json = e.clipboardData?.getData('application/json');
        if (json) {
          try {
            const uploadedFile = JSON.parse(json);
            if (
              uploadedFile &&
              uploadedFile.src &&
              uploadedFile.filename &&
              ctx
            ) {
              console.log('Parsed JSON file:', uploadedFile);
              ctx.setValue(uploadedFile);
              return;
            }
          } catch (err) {
            console.error('error parsing json', err);
          }
        }
        // Handle files.
        const file = e.clipboardData?.files[0];
        if (file) {
          ctx.handleFile(file);
          return;
        }
        // Handle SVG text (supports copying SVG from Figma).
        const text = e.clipboardData?.getData('text/plain');
        if (text && testSvg(text)) {
          ctx.handleFile(text, {as: 'svg'});
          return;
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

/** Returns whether a string is an SVG. */
function testSvg(text: string): boolean {
  return /^(?:\uFEFF)?\s*(?:<!--[\s\S]*?-->\s*)*(?:<\?xml[\s\S]*?\?>\s*)?(?:<!DOCTYPE\s+svg[\s\S]*?>\s*)?<svg\b[^>]*?(?:\/>|>[\s\S]*?<\/svg>)\s*$/.test(
    text
  );
}
