import {ActionIcon, Avatar, Loader, Tooltip} from '@mantine/core';
import {IconPaperclip, IconRobot, IconSend2, IconX} from '@tabler/icons-preact';
import {useEffect, useRef, useState} from 'preact/hooks';
import {Markdown} from '../../components/Markdown/Markdown.js';
import {Layout} from '../../layout/Layout.js';
import {joinClassNames} from '../../utils/classes.js';
import {uploadFileToGCS} from '../../utils/gcs.js';
import {autokey, numBetween} from '../../utils/rand.js';
import './AIPage.css';

interface Message {
  sender: 'user' | 'bot';
  blocks: MessageBlock[];
  key?: string;
}

interface ImageMessageBlock {
  type: 'image';
  image: {
    src: string;
    width: number;
    height: number;
    alt: string;
  };
}

/**
 * Pending message, which shows a loading state when waiting for a response from
 * the server.
 */
interface PendingMessageBlock {
  type: 'pending';
}

interface TextMessageBlock {
  type: 'text';
  text: string;
}

type MessageBlock = ImageMessageBlock | PendingMessageBlock | TextMessageBlock;

interface ChatController {
  messages: Message[];
  addMessage: (message: Message) => number;
  updateMessage: (id: number, message: Message) => void;
}

function useChat(): ChatController {
  const [messages, setMessages] = useState<Message[]>([]);

  const addMessage = (message: Message) => {
    let pendingMessageId = 0;
    setMessages((current) => {
      const pendingMessage: Message = {
        sender: 'bot',
        blocks: [{type: 'pending'}],
        key: autokey(),
      };
      const newMessages = [
        ...current,
        {...message, key: autokey()},
        pendingMessage,
      ];
      pendingMessageId = newMessages.length - 1;
      return newMessages;
    });
    return pendingMessageId;
  };

  const updateMessage = (id: number, message: Message) => {
    setMessages((current) => {
      const newMessages = [...current];
      newMessages[id] = {...message, key: autokey()};
      return newMessages;
    });
  };

  return {
    messages,
    addMessage,
    updateMessage,
  };
}

export function AIPage() {
  const chat = useChat();

  const isEnabled = window.__ROOT_CTX.experiments?.ai || false;

  return (
    <Layout>
      <div className="AIPage">
        {isEnabled ? (
          <>
            <ChatWindow chat={chat} />
            <ChatBar chat={chat} />
          </>
        ) : (
          <div className="AIPage__notEnabled">
            <div className="AIPage__notEnabled__icon">
              <IconRobot size={36} />
            </div>
            <div className="AIPage__notEnabled__title">
              Root AI is not enabled for this project.
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}

function ChatWindow(props: {chat: ChatController}) {
  const messages = props.chat.messages;
  return (
    <div className="AIPage__ChatWindow">
      {messages.length > 0 ? (
        <div className="AIPage__ChatWindow__messages">
          {props.chat.messages.map((message, i) => (
            <ChatMessage key={message.key || i} message={message} />
          ))}
        </div>
      ) : (
        <div className="AIPage__ChatWindow__welcome">
          <div className="AIPage__ChatWindow__welcome__icon">
            <IconRobot size={36} />
          </div>
          <div className="AIPage__ChatWindow__welcome__title">
            Welcome to Root AI
          </div>
        </div>
      )}
    </div>
  );
}

function ChatMessage(props: {message: Message}) {
  const message = props.message;
  const username = message.sender === 'user' ? 'You' : 'Root AI';
  const user = window.firebase.user;
  const animated = message.sender === 'bot';
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (message.sender === 'user') {
      ref.current!.scrollIntoView({behavior: 'smooth', block: 'start'});
    }
  }, []);

  return (
    <div className="AIPage__ChatMessage" ref={ref}>
      <div className="AIPage__ChatMessage__side">
        <div className="AIPage__ChatMessage__side__avatar">
          {message.sender === 'user' ? (
            <Avatar
              src={user.photoURL}
              alt={user.email!}
              size={28}
              radius="xl"
            />
          ) : (
            <IconRobot size={28} />
          )}
        </div>
      </div>
      <div className="AIPage__ChatMessage__main">
        <div className="AIPage__ChatMessage__main__username">{username}</div>
        <div className="AIPage__ChatMessage__main__blocks">
          <ChatMessageBlocks message={message} animated={animated} />
        </div>
      </div>
    </div>
  );
}

function ChatMessageBlocks(props: {message: Message; animated: boolean}) {
  const message = props.message;
  const [blocks, setBlocks] = useState<MessageBlock[]>(
    props.animated ? [] : message.blocks
  );

  function addNextBlock() {
    if (blocks.length >= message.blocks.length) {
      return;
    }
    const newBlocks = [...blocks, message.blocks[blocks.length]];
    setBlocks(newBlocks);
  }

  useEffect(() => {
    if (props.animated) {
      addNextBlock();
    }
  }, [props.animated]);

  return (
    <div className="AIPage__ChatMessageBlocks">
      {blocks.map((block, i) => {
        const key = `${i}-${block.type}`;
        if (block.type === 'image') {
          return (
            <ChatMessageImageBlock
              key={key}
              block={block}
              animated={props.animated}
            />
          );
        }
        if (block.type === 'pending') {
          return (
            <ChatMessagePendingBlock
              key={key}
              block={block}
              animated={props.animated}
            />
          );
        }
        if (block.type === 'text') {
          return (
            <ChatMessageTextBlock
              key={key}
              block={block}
              animated={props.animated}
              onAnimationComplete={() => addNextBlock()}
            />
          );
        }
        return <div>unknown block type: {block.type}</div>;
      })}
    </div>
  );
}

function ChatMessageTextBlock(props: {
  block: TextMessageBlock;
  animated: boolean;
  onAnimationComplete: () => void;
}) {
  const fullText = props.block.text;
  const [text, setText] = useState(props.animated ? '' : fullText);
  const complete = text.length >= fullText.length;

  function appendNextChar() {
    // setText((current) => {
    //   if (current.length >= fullText.length) {
    //     return fullText;
    //   }
    //   return `${current}${fullText[current.length]}`;
    // });
  }

  useEffect(() => {
    if (props.animated) {
      appendNextChar();
    }
  }, []);

  useEffect(() => {
    props.onAnimationComplete();
    // if (text.length >= fullText.length) {
    //   props.onAnimationComplete();
    //   return;
    // }
    // const delay = numBetween(10, 35);
    // setTimeout(() => appendNextChar(), delay);
  }, [text]);

  return (
    <div className="AIPage__ChatMessageTextBlock">
      {/* TODO(stevenle): convert the markdown text to "blocks" and animate each block. */}
      <Markdown code={fullText} />
      {/* <span>{text}</span> */}
      {/* {!complete && <CursorDot />} */}
    </div>
  );
}

function ChatMessagePendingBlock(props: {
  block: PendingMessageBlock;
  animated: boolean;
}) {
  return (
    <div className="AIPage__PendingMessageBlock">
      <CursorDot />
    </div>
  );
}

function CursorDot() {
  return <div className="AIPage__CursorDot" />;
}

function ChatMessageImageBlock(props: {
  block: ImageMessageBlock;
  animated: boolean;
}) {
  const image = props.block.image;
  return (
    <div className="AIPage__ImageMessageBlock">
      <img
        src={image.src}
        width={image.width}
        height={image.height}
        alt={image.alt}
      />
    </div>
  );
}

function ChatBar(props: {chat: ChatController}) {
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

    // TODO(stevenle): send request to api then update pending message.
    const prompt: any[] = [{text: textPrompt}];
    if (image) {
      prompt.push({
        media: {
          url: image.src,
          contentType: guessImageMimetype(image.filename),
        },
      });
    }

    // Allow users to provide a custom api endpoint via the
    // `{ai: {endpoint: '/api/...}}` config.
    let endpoint = '/cms/api/ai.chat';
    if (typeof window.__ROOT_CTX.experiments?.ai === 'object') {
      if (window.__ROOT_CTX.experiments.ai.endpoint) {
        endpoint = window.__ROOT_CTX.experiments.ai.endpoint;
      }
    }

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({prompt: prompt}),
    });
    if (res.status !== 200) {
      const err = await res.text();
      console.error('chat failed', err);
      props.chat.updateMessage(pendingMessageId, {
        sender: 'bot',
        blocks: [
          {
            type: 'text',
            text: `Something went wrong: ${err}`,
          },
        ],
      });
      return;
    }
    const resData = await res.json();
    props.chat.updateMessage(pendingMessageId, {
      sender: 'bot',
      blocks: [
        {
          type: 'text',
          text: resData.response || '',
        },
      ],
    });
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
        <label className="AIPage__ChatBar__prompt__imageUpload" role="button">
          <input
            className="AIPage__ChatBar__prompt__imageUpload__input"
            type="file"
            accept="image/png, image/jpeg, image/webp"
            onChange={onImageFileChange}
            ref={imageInputRef}
          />
          <ActionIcon
            // Using a <div> instead of a <button> allows the <label> parent to
            // trigger the file input.
            component="div"
            className="AIPage__ChatBar__prompt__imageUpload__icon"
            radius="xl"
          >
            <IconPaperclip size={18} />
          </ActionIcon>
        </label>
        <textarea
          className="AIPage__ChatBar__prompt__textInput"
          ref={textInputRef}
          placeholder="Enter prompt here..."
          rows={1}
          onKeyDown={onKeyDown}
          onChange={(e) => {
            setTextPrompt((e.target as HTMLTextAreaElement).value);
          }}
          value={textPrompt}
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
