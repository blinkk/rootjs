import {ActionIcon, Loader, Tooltip} from '@mantine/core';
import {IconPaperclip, IconSend2, IconX} from '@tabler/icons-preact';
import {useEffect, useRef, useState} from 'preact/hooks';
import {
  ChatPrompt,
  AiResponse,
  SendPromptOptions,
} from '../../../shared/ai/prompts.js';
import {ChatController} from '../../pages/AIPage/AIPage.js';
import {joinClassNames} from '../../utils/classes.js';
import {uploadFileToGCS} from '../../utils/gcs.js';

export interface Message {
  sender: 'user' | 'bot';
  blocks: MessageBlock[];
  key?: string;
  data?: Record<string, any>;
}

export interface ImageMessageBlock {
  type: 'image';
  image: {
    src: string;
    width?: number;
    height?: number;
    alt?: string;
  };
}

/**
 * Pending message, which shows a loading state when waiting for a response from
 * the server.
 */
export interface PendingMessageBlock {
  type: 'pending';
}

export interface TextMessageBlock {
  type: 'text';
  text: string;
}

export type MessageBlock =
  | ImageMessageBlock
  | PendingMessageBlock
  | TextMessageBlock;

export function ChatBar(props: {
  chat: ChatController;
  options?: SendPromptOptions;
  onData?: (data: AiResponse | null) => void;
}) {
  const [textPrompt, setTextPrompt] = useState('');
  const textInputRef = useRef<HTMLTextAreaElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [image, setImage] = useState<any>(null);
  const [imageUploading, setImageUploading] = useState(false);

  const formDisabled = !textPrompt;

  /** Naively guesses image mimetype. */
  function guessImageMimetype(filename: string) {
    if (filename.endsWith('.jpg')) {
      return 'image/jpeg';
    }
    return 'image/png';
  }

  async function onSubmit() {
    if (!textPrompt) {
      return;
    }
    const messageBlocks: MessageBlock[] = [{type: 'text', text: textPrompt}];
    if (image) {
      messageBlocks.push({
        type: 'image',
        image: {
          src: image.src,
          width: image.width,
          height: image.height,
          alt: image.filename,
        },
      });
    }
    const pendingMessageId = props.chat.addMessage({
      sender: 'user',
      blocks: messageBlocks,
    });
    setTextPrompt('');
    setImage(null);
    updateTextareaHeight();

    const prompt: ChatPrompt[] = [{text: textPrompt}];
    if (image) {
      prompt.push({
        media: {
          url: image.src,
          contentType: guessImageMimetype(image.filename),
        },
      });
    }
    const response = await props.chat.sendPrompt(
      pendingMessageId,
      prompt,
      props.options
    );
    if (props.onData && response) {
      props.onData(response);
    }
  }

  function updateTextareaHeight() {
    window.requestAnimationFrame(() => {
      const textarea = textInputRef.current!;
      textarea.style.height = 'auto';
      textarea.style.height = `${textarea.scrollHeight}px`;
    });
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSubmit();
      return;
    }
  }

  async function uploadImage(file: File) {
    try {
      setImageUploading(true);
      updateTextareaHeight();
      const data: any = await uploadFileToGCS(file, {disableGci: true});
      setImage({
        src: data.src,
        width: data.width,
        height: data.height,
        filename: data.filename,
      });
      setImageUploading(false);
    } catch (err) {
      setImageUploading(false);
    }
    // Reset the input element in case the user wishes to re-upload the image.
    if (imageInputRef.current) {
      const imageInputEl = imageInputRef.current;
      imageInputEl.value = '';
    }
  }

  function onImageFileChange(e: Event) {
    const inputEl = e.target as HTMLInputElement;
    const files = inputEl.files || [];
    const file = files[0];
    if (file) {
      uploadImage(file);
    }
  }

  function removeImage() {
    setImage(null);
    updateTextareaHeight();
  }

  // Whenever the text prompt changes, update the <textarea> height.
  useEffect(() => {
    updateTextareaHeight();
  }, [textPrompt]);

  return (
    <div className="AIPage__ChatBar">
      <div
        className={joinClassNames(
          'AIPage__ChatBar__prompt',
          (imageUploading || image) && 'AIPage__ChatBar__prompt--hasImage'
        )}
      >
        <label className="AIPage__ChatBar__prompt__imageUpload">
          <input
            className="AIPage__ChatBar__prompt__imageUpload__input"
            type="file"
            accept="image/png, image/jpeg, image/webp"
            onChange={onImageFileChange}
            ref={imageInputRef}
          />
          <Tooltip label="Upload image">
            <ActionIcon
              // Using a <div> instead of a <button> allows the <label> parent to
              // trigger the file input.
              component="div"
              className="AIPage__ChatBar__prompt__imageUpload__icon"
              radius="xl"
            >
              <IconPaperclip size={18} />
            </ActionIcon>
          </Tooltip>
        </label>
        <textarea
          className="AIPage__ChatBar__prompt__textInput"
          ref={textInputRef}
          placeholder="Enter prompt..."
          rows={1}
          onKeyDown={onKeyDown}
          onPaste={(e) => {
            // If the user pastes an image, upload it.
            const items = e.clipboardData?.items || [];
            for (const item of items) {
              if (item.kind === 'file' && item.type.startsWith('image/')) {
                const file = item.getAsFile();
                if (file) {
                  uploadImage(file);
                }
              }
            }
          }}
          onChange={(e) => {
            setTextPrompt((e.target as HTMLTextAreaElement).value);
          }}
          value={textPrompt}
          autofocus={true}
        />
        {(imageUploading || image) && (
          <div className="AIPage__ChatBar__prompt__imagePreview">
            {imageUploading ? (
              <Loader size="sm" />
            ) : (
              <Tooltip
                label={image.filename}
                transition="pop"
                position="right"
                withArrow
              >
                <button
                  className="AIPage__ChatBar__prompt__imagePreview__closeButton"
                  onClick={() => removeImage()}
                >
                  <img
                    src={image.src}
                    width={image.width}
                    height={image.height}
                    alt="attachment"
                  />
                  <div className="AIPage__ChatBar__prompt__imagePreview__closeButton__icon">
                    <IconX size={24} color="white" />
                  </div>
                </button>
              </Tooltip>
            )}
          </div>
        )}
        <ActionIcon
          className="AIPage__ChatBar__prompt__submit"
          variant="filled"
          color="dark"
          radius="xl"
          onClick={() => onSubmit()}
          disabled={formDisabled}
        >
          <IconSend2 size={18} />
        </ActionIcon>
      </div>
      <div className="AIPage__ChatBar__disclaimer">
        Root AI is experimental and makes mistakes. Check all info.
      </div>
    </div>
  );
}
