/**
 * `/cms/ai` page. Built on top of the Vercel AI SDK (`ai`, `@ai-sdk/react`).
 *
 * The server (`/cms/api/ai.v2.*`) proxies the configured providers and
 * persists chat history to Firestore. This page is responsible for:
 *
 * - Listing past chats and resuming them.
 * - Picking a model from the configured list.
 * - Streaming responses with reasoning and tool-call rendering.
 * - Sending image attachments to multimodal models.
 */
import './AIPage.css';

import {useChat} from '@ai-sdk/react';
import {ActionIcon, Loader, Menu, Tooltip} from '@mantine/core';
import {
  IconChevronDown,
  IconMessageCirclePlus,
  IconPaperclip,
  IconRobot,
  IconSend2,
  IconTool,
  IconTrash,
  IconX,
} from '@tabler/icons-preact';
import type {UIMessage} from 'ai';
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithToolCalls,
} from 'ai';
import {useEffect, useMemo, useRef, useState} from 'preact/hooks';
import {useLocation} from 'preact-iso';
import {Markdown} from '../../components/Markdown/Markdown.js';
import {usePageTitle} from '../../hooks/usePageTitle.js';
import {Layout} from '../../layout/Layout.js';
import {joinClassNames} from '../../utils/classes.js';
import {uploadFileToGCS} from '../../utils/gcs.js';
import {executeCmsTool} from './cmsToolHandlers.js';

interface ModelInfo {
  id: string;
  label: string;
  description?: string;
  provider: string;
  capabilities: {
    tools: boolean;
    reasoning: boolean;
    attachments: boolean;
  };
}

interface ChatSummary {
  id: string;
  title?: string;
  modelId?: string;
  createdAt: number;
  modifiedAt: number;
}

interface AiConfigResponse {
  enabled: boolean;
  defaultModel?: string;
  models?: ModelInfo[];
}

interface AttachmentPreview {
  url: string;
  filename: string;
  mediaType: string;
  width?: number;
  height?: number;
}

const NEW_CHAT_ID = '';

export function AIPage(props: {chatId?: string}) {
  usePageTitle('AI');

  const [config, setConfig] = useState<AiConfigResponse | null>(null);
  const [configError, setConfigError] = useState<string>('');

  useEffect(() => {
    let active = true;
    fetch('/cms/api/ai.v2.config', {credentials: 'include'})
      .then(async (res) => {
        const data = (await res.json()) as AiConfigResponse;
        if (active) {
          setConfig(data);
        }
      })
      .catch((err) => {
        if (active) {
          setConfigError(String(err));
        }
      });
    return () => {
      active = false;
    };
  }, []);

  const isEnabled = !!config?.enabled && (config.models?.length || 0) > 0;

  return (
    <Layout>
      <div className="AIPage">
        {!config && !configError ? (
          <div className="AIPage__loading">
            <Loader size="md" />
          </div>
        ) : isEnabled ? (
          <ChatExperience config={config!} initialChatId={props.chatId} />
        ) : (
          <NotConfigured error={configError} />
        )}
      </div>
    </Layout>
  );
}

function NotConfigured(props: {error?: string}) {
  return (
    <div className="AIPage__notEnabled">
      <div className="AIPage__notEnabled__icon">
        <IconRobot size={36} />
      </div>
      <div className="AIPage__notEnabled__title">
        Root AI is not configured for this project.
      </div>
      <div className="AIPage__notEnabled__body">
        Add an <code>ai.models</code> entry to <code>cmsPlugin()</code> in{' '}
        <code>root.config.ts</code>.
      </div>
      {props.error && (
        <pre className="AIPage__notEnabled__error">{props.error}</pre>
      )}
    </div>
  );
}

function ChatExperience(props: {
  config: AiConfigResponse;
  initialChatId?: string;
}) {
  const {route} = useLocation();
  const models = props.config.models || [];
  const [selectedModelId, setSelectedModelId] = useState<string>(
    props.config.defaultModel || models[0]?.id || ''
  );
  // The chat id used for the next mount of `ChatPane`. Empty for "new chat".
  const [pendingChatId, setPendingChatId] = useState<string>(
    props.initialChatId || NEW_CHAT_ID
  );
  // The chat id of the chat the user is currently looking at. Used for the
  // sidebar highlight; updated both when switching chats and when ChatPane
  // auto-creates a new chat after the first message.
  const [activeChatId, setActiveChatId] = useState<string>(
    props.initialChatId || NEW_CHAT_ID
  );
  const [initialMessages, setInitialMessages] = useState<UIMessage[]>([]);
  const [chats, setChats] = useState<ChatSummary[]>([]);
  // Bumped to force ChatPane to remount on explicit user actions ("new chat",
  // "open chat"). Auto-assigning a chat id from ChatPane does NOT bump this,
  // so messages aren't lost mid-conversation.
  const [resetKey, setResetKey] = useState(0);

  const refreshChats = async () => {
    try {
      const res = await fetch('/cms/api/ai.v2.chats.list', {
        method: 'POST',
        credentials: 'include',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (data.success) {
        setChats(data.chats || []);
      }
    } catch (err) {
      console.error('failed to load chat list', err);
    }
  };

  useEffect(() => {
    refreshChats();
    // If a chat id was provided via the URL, load it on mount.
    if (props.initialChatId) {
      loadChat(props.initialChatId);
    }
  }, []);

  /** Fetches a chat by id and applies it to state without the activeChatId guard. */
  const loadChat = async (id: string) => {
    try {
      const res = await fetch('/cms/api/ai.v2.chats.get', {
        method: 'POST',
        credentials: 'include',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify({id}),
      });
      const data = await res.json();
      if (!data.success) {
        return;
      }
      setPendingChatId(id);
      setActiveChatId(id);
      setInitialMessages((data.chat.messages || []) as UIMessage[]);
      if (data.chat.modelId) {
        const exists = models.find((m) => m.id === data.chat.modelId);
        if (exists) {
          setSelectedModelId(data.chat.modelId);
        }
      }
      setResetKey((k) => k + 1);
    } catch (err) {
      console.error('failed to load chat', err);
    }
  };

  const startNewChat = () => {
    setPendingChatId(NEW_CHAT_ID);
    setActiveChatId(NEW_CHAT_ID);
    setInitialMessages([]);
    setResetKey((k) => k + 1);
    route('/cms/ai');
  };

  const openChat = async (id: string) => {
    if (id === activeChatId) {
      return;
    }
    try {
      const res = await fetch('/cms/api/ai.v2.chats.get', {
        method: 'POST',
        credentials: 'include',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify({id}),
      });
      const data = await res.json();
      if (!data.success) {
        return;
      }
      setPendingChatId(id);
      setActiveChatId(id);
      setInitialMessages((data.chat.messages || []) as UIMessage[]);
      if (data.chat.modelId) {
        const exists = models.find((m) => m.id === data.chat.modelId);
        if (exists) {
          setSelectedModelId(data.chat.modelId);
        }
      }
      setResetKey((k) => k + 1);
      route(`/cms/ai/chat/${id}`);
    } catch (err) {
      console.error('failed to load chat', err);
    }
  };

  const deleteChat = async (id: string) => {
    try {
      await fetch('/cms/api/ai.v2.chats.delete', {
        method: 'POST',
        credentials: 'include',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify({id}),
      });
      if (activeChatId === id) {
        startNewChat();
      }
      refreshChats();
    } catch (err) {
      console.error('failed to delete chat', err);
    }
  };

  const selectedModel =
    models.find((m) => m.id === selectedModelId) || models[0];

  return (
    <div className="AIPage__layout">
      <ChatHistorySidebar
        chats={chats}
        activeChatId={activeChatId}
        onSelect={openChat}
        onNew={startNewChat}
        onDelete={deleteChat}
      />
      <div className="AIPage__main">
        <ChatHeader
          models={models}
          selectedModel={selectedModel}
          onSelectModel={setSelectedModelId}
        />
        <ChatPane
          key={resetKey}
          initialChatId={pendingChatId}
          model={selectedModel}
          initialMessages={initialMessages}
          onChatPersisted={(id) => {
            setActiveChatId(id);
            refreshChats();
            // Update URL when the chat is first persisted (new chat).
            window.history.replaceState(null, '', `/cms/ai/chat/${id}`);
          }}
        />
      </div>
    </div>
  );
}

function ChatHistorySidebar(props: {
  chats: ChatSummary[];
  activeChatId: string;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
}) {
  return (
    <aside className="AIPage__sidebar">
      <button
        type="button"
        className="AIPage__sidebar__newButton"
        onClick={props.onNew}
      >
        <IconMessageCirclePlus size={18} />
        <span>New chat</span>
      </button>
      <div className="AIPage__sidebar__list">
        {props.chats.length === 0 && (
          <div className="AIPage__sidebar__empty">No chats yet.</div>
        )}
        {props.chats.map((chat) => (
          <div
            key={chat.id}
            className={joinClassNames(
              'AIPage__sidebar__item',
              chat.id === props.activeChatId && 'AIPage__sidebar__item--active'
            )}
            onClick={() => props.onSelect(chat.id)}
          >
            <div
              className="AIPage__sidebar__item__title"
              title={chat.title || 'Untitled chat'}
            >
              {chat.title || 'Untitled chat'}
            </div>
            <button
              type="button"
              className="AIPage__sidebar__item__delete"
              title="Delete chat"
              onClick={(e) => {
                e.stopPropagation();
                if (window.confirm('Delete this chat?')) {
                  props.onDelete(chat.id);
                }
              }}
            >
              <IconTrash size={14} />
            </button>
          </div>
        ))}
      </div>
    </aside>
  );
}

function ChatHeader(props: {
  models: ModelInfo[];
  selectedModel?: ModelInfo;
  onSelectModel: (id: string) => void;
}) {
  return (
    <div className="AIPage__header">
      <Menu
        control={
          <button type="button" className="AIPage__modelPicker">
            <IconRobot size={16} />
            <span>{props.selectedModel?.label || 'Select model'}</span>
            <IconChevronDown size={14} />
          </button>
        }
      >
        {props.models.map((model) => (
          <Menu.Item
            key={model.id}
            onClick={() => props.onSelectModel(model.id)}
          >
            <div className="AIPage__modelPicker__option">
              <div className="AIPage__modelPicker__option__label">
                {model.label}
              </div>
              {model.description && (
                <div className="AIPage__modelPicker__option__description">
                  {model.description}
                </div>
              )}
              {/* <div className="AIPage__modelPicker__option__caps">
                {model.capabilities.tools && <span>tools</span>}
                {model.capabilities.reasoning && <span>reasoning</span>}
                {model.capabilities.attachments && <span>attachments</span>}
              </div> */}
            </div>
          </Menu.Item>
        ))}
      </Menu>
    </div>
  );
}

function ChatPane(props: {
  initialChatId: string;
  model?: ModelInfo;
  initialMessages: UIMessage[];
  onChatPersisted: (id: string) => void;
}) {
  // Lock in the chat id for the lifetime of this mount. We generate one
  // client-side for new chats (the AI SDK doesn't expose response headers,
  // so the server can't communicate an id back). Subsequent prop changes do
  // NOT update this so an in-flight conversation isn't disrupted when the
  // parent learns the id via `onChatPersisted`.
  const [effectiveChatId] = useState<string>(
    () => props.initialChatId || generateChatId()
  );
  const modelRef = useRef(props.model?.id);
  modelRef.current = props.model?.id;

  const transport = useMemo(
    () =>
      new DefaultChatTransport<UIMessage>({
        api: '/cms/api/ai.v2.chat',
        credentials: 'include',
        prepareSendMessagesRequest: ({messages}) => ({
          body: {
            messages,
            chatId: effectiveChatId,
            modelId: modelRef.current,
          },
        }),
      }),
    [effectiveChatId]
  );

  const {messages, sendMessage, status, error, stop, addToolOutput} = useChat({
    id: effectiveChatId,
    messages: props.initialMessages,
    transport,
    // Auto-resubmit once all tool calls in the latest assistant message have
    // results. Without this, the model would stall after a tool call.
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    // Tools execute in the browser using the signed-in user's Firebase
    // credentials. The result is fed back to the model on the next round.
    onToolCall: async ({toolCall}) => {
      const output = await executeCmsTool(toolCall.toolName, toolCall.input);
      addToolOutput({
        tool: toolCall.toolName as any,
        toolCallId: toolCall.toolCallId,
        output,
      });
    },
    onFinish: () => {
      props.onChatPersisted(effectiveChatId);
    },
  });

  const isStreaming = status === 'streaming' || status === 'submitted';

  return (
    <>
      <ChatTranscript
        messages={messages}
        isStreaming={isStreaming}
        emptyMessage={!props.model ? 'Select a model to start.' : undefined}
      />
      {error && (
        <div className="AIPage__error">
          <strong>Error:</strong> {error.message}
        </div>
      )}
      <ChatComposer
        disabled={!props.model}
        canAttach={props.model?.capabilities.attachments ?? false}
        isStreaming={isStreaming}
        onStop={stop}
        onSend={(text, attachments) => {
          if (!text && attachments.length === 0) {
            return;
          }
          sendMessage({
            text,
            files: attachments.map((a) => ({
              type: 'file',
              mediaType: a.mediaType,
              url: a.url,
              filename: a.filename,
            })),
          });
        }}
      />
    </>
  );
}

function ChatTranscript(props: {
  messages: UIMessage[];
  isStreaming: boolean;
  emptyMessage?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [props.messages]);

  if (props.messages.length === 0) {
    return (
      <div className="AIPage__transcript AIPage__transcript--empty" ref={ref}>
        <div className="AIPage__welcome">
          <div className="AIPage__welcome__icon">
            <IconRobot size={36} />
          </div>
          <div className="AIPage__welcome__title">Root AI</div>
          <div className="AIPage__welcome__body">
            {props.emptyMessage || 'What are we going to get done today?'}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="AIPage__transcript" ref={ref}>
      <div className="AIPage__transcript__inner">
        {props.messages.map((m) => (
          <MessageView key={m.id} message={m} />
        ))}
        {props.isStreaming && (
          <div className="AIPage__streamingIndicator">
            <Loader size="xs" />
            <span>Thinking…</span>
          </div>
        )}
      </div>
    </div>
  );
}

function MessageView(props: {message: UIMessage}) {
  const message = props.message;
  const isUser = message.role === 'user';
  const username = isUser ? 'You' : 'Root AI';
  const photoURL = isUser ? window.firebase.user?.photoURL : null;

  return (
    <div
      className={joinClassNames(
        'AIPage__message',
        `AIPage__message--${message.role}`
      )}
    >
      <div className="AIPage__message__avatar">
        {photoURL ? (
          <img src={photoURL} alt={username} />
        ) : (
          <IconRobot size={20} />
        )}
      </div>
      <div className="AIPage__message__body">
        <div className="AIPage__message__username">{username}</div>
        <div className="AIPage__message__parts">
          {(message.parts || []).map((part, i) => (
            <PartView key={i} part={part} />
          ))}
        </div>
      </div>
    </div>
  );
}

function PartView(props: {part: any}) {
  const part = props.part;
  if (part.type === 'text') {
    if (!part.text) {
      return null;
    }
    return (
      <div className="AIPage__textPart">
        <Markdown code={part.text} />
      </div>
    );
  }
  if (part.type === 'reasoning') {
    return <ReasoningPartView text={part.text} />;
  }
  if (part.type === 'file') {
    return <FilePartView part={part} />;
  }
  if (part.type === 'source-url') {
    return (
      <a className="AIPage__sourcePart" href={part.url} target="_blank">
        {part.title || part.url}
      </a>
    );
  }
  if (typeof part.type === 'string' && part.type.startsWith('tool-')) {
    return <ToolPartView part={part} />;
  }
  if (part.type === 'dynamic-tool') {
    return <ToolPartView part={part} />;
  }
  if (part.type === 'step-start') {
    return null;
  }
  return (
    <div className="AIPage__unknownPart">
      <pre>{JSON.stringify(part, null, 2)}</pre>
    </div>
  );
}

function ReasoningPartView(props: {text: string}) {
  const [open, setOpen] = useState(false);
  if (!props.text) {
    return null;
  }
  return (
    <div
      className={joinClassNames(
        'AIPage__reasoning',
        open && 'AIPage__reasoning--open'
      )}
    >
      <button
        type="button"
        className="AIPage__reasoning__toggle"
        onClick={() => setOpen(!open)}
      >
        <IconChevronDown
          size={14}
          style={{transform: open ? 'rotate(0deg)' : 'rotate(-90deg)'}}
        />
        <span>Thinking</span>
      </button>
      {open && (
        <div className="AIPage__reasoning__body">
          <Markdown code={props.text} />
        </div>
      )}
    </div>
  );
}

function FilePartView(props: {part: any}) {
  const part = props.part;
  if (part.mediaType?.startsWith('image/')) {
    return (
      <div className="AIPage__filePart">
        <img src={part.url} alt={part.filename || 'attachment'} />
      </div>
    );
  }
  return (
    <a
      className="AIPage__filePart AIPage__filePart--link"
      href={part.url}
      target="_blank"
    >
      <IconPaperclip size={14} />
      <span>{part.filename || part.url}</span>
    </a>
  );
}

function ToolPartView(props: {part: any}) {
  const part = props.part;
  // Static tool parts are typed `tool-<toolName>`; dynamic-tool uses
  // `toolName`.
  const toolName: string =
    typeof part.type === 'string' && part.type.startsWith('tool-')
      ? part.type.slice('tool-'.length)
      : part.toolName || 'tool';
  const state: string = part.state || '';
  const [open, setOpen] = useState(false);

  return (
    <div className="AIPage__tool">
      <button
        type="button"
        className="AIPage__tool__header"
        onClick={() => setOpen(!open)}
      >
        <IconTool size={14} />
        <code>{toolName}</code>
        <span className="AIPage__tool__state">{prettyToolState(state)}</span>
        <IconChevronDown
          size={14}
          style={{
            marginLeft: 'auto',
            transform: open ? 'rotate(0deg)' : 'rotate(-90deg)',
          }}
        />
      </button>
      {open && (
        <div className="AIPage__tool__body">
          {part.input && (
            <details open>
              <summary>Input</summary>
              <pre>{JSON.stringify(part.input, null, 2)}</pre>
            </details>
          )}
          {part.output && (
            <details open>
              <summary>Output</summary>
              <pre>{JSON.stringify(part.output, null, 2)}</pre>
            </details>
          )}
          {part.errorText && (
            <div className="AIPage__tool__error">{part.errorText}</div>
          )}
        </div>
      )}
    </div>
  );
}

function prettyToolState(state: string): string {
  switch (state) {
    case 'input-streaming':
      return 'preparing…';
    case 'input-available':
      return 'running…';
    case 'output-available':
      return 'done';
    case 'output-error':
      return 'error';
    default:
      return state;
  }
}

function ChatComposer(props: {
  disabled: boolean;
  canAttach: boolean;
  isStreaming: boolean;
  onSend: (text: string, attachments: AttachmentPreview[]) => void;
  onStop: () => void;
}) {
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState<AttachmentPreview[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const fitTextarea = () => {
    window.requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) {
        return;
      }
      el.style.height = 'auto';
      el.style.height = `${Math.min(el.scrollHeight, 240)}px`;
    });
  };

  useEffect(fitTextarea, [text, attachments]);

  const submit = () => {
    if (props.disabled || props.isStreaming) {
      return;
    }
    if (!text && attachments.length === 0) {
      return;
    }
    props.onSend(text, attachments);
    setText('');
    setAttachments([]);
    if (fileRef.current) {
      fileRef.current.value = '';
    }
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  const uploadFile = async (file: File) => {
    setUploading(true);
    try {
      const data: any = await uploadFileToGCS(file, {disableGci: true});
      setAttachments((prev) => [
        ...prev,
        {
          url: data.src,
          filename: data.filename || file.name,
          mediaType: file.type || guessMimeType(file.name),
          width: data.width,
          height: data.height,
        },
      ]);
    } catch (err) {
      console.error('upload failed', err);
    } finally {
      setUploading(false);
      if (fileRef.current) {
        fileRef.current.value = '';
      }
    }
  };

  const onFileChange = (e: Event) => {
    const input = e.target as HTMLInputElement;
    const files = Array.from(input.files || []);
    files.forEach(uploadFile);
  };

  return (
    <div className="AIPage__composer">
      {attachments.length > 0 && (
        <div className="AIPage__composer__attachments">
          {attachments.map((a, i) => (
            <div key={i} className="AIPage__composer__attachment">
              {a.mediaType.startsWith('image/') ? (
                <img src={a.url} alt={a.filename} />
              ) : (
                <span className="AIPage__composer__attachment__name">
                  {a.filename}
                </span>
              )}
              <button
                type="button"
                className="AIPage__composer__attachment__remove"
                onClick={() =>
                  setAttachments((prev) => prev.filter((_, idx) => idx !== i))
                }
              >
                <IconX size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="AIPage__composer__row">
        {props.canAttach && (
          <Tooltip
            label="Attach file"
            className="AIPage__composer__attachTooltip"
          >
            <ActionIcon
              component="label"
              radius="xl"
              className="AIPage__composer__attach"
            >
              {uploading ? <Loader size="xs" /> : <IconPaperclip size={18} />}
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                style={{display: 'none'}}
                onChange={onFileChange}
              />
            </ActionIcon>
          </Tooltip>
        )}
        <textarea
          ref={textareaRef}
          className="AIPage__composer__textarea"
          placeholder={props.disabled ? 'Select a model…' : 'Ask anything…'}
          value={text}
          rows={1}
          autofocus
          disabled={props.disabled}
          onKeyDown={onKeyDown}
          onChange={(e) => setText((e.target as HTMLTextAreaElement).value)}
          onPaste={(e) => {
            const items = e.clipboardData?.items || [];
            for (const item of items) {
              if (item.kind === 'file' && item.type.startsWith('image/')) {
                const file = item.getAsFile();
                if (file && props.canAttach) {
                  uploadFile(file);
                }
              }
            }
          }}
        />
        {props.isStreaming ? (
          <ActionIcon
            radius="xl"
            color="dark"
            variant="filled"
            onClick={props.onStop}
            title="Stop"
          >
            <IconX size={18} />
          </ActionIcon>
        ) : (
          <ActionIcon
            radius="xl"
            color="dark"
            variant="filled"
            disabled={
              props.disabled || uploading || (!text && attachments.length === 0)
            }
            onClick={submit}
            title="Send"
          >
            <IconSend2 size={18} />
          </ActionIcon>
        )}
      </div>
      <div className="AIPage__composer__disclaimer">
        Root AI is experimental and can make mistakes. Use with caution.
      </div>
    </div>
  );
}

function guessMimeType(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  return 'image/jpeg';
}

/** Generates a stable chat id used for both client state and Firestore. */
function generateChatId(): string {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return crypto.randomUUID();
  }
  return `chat-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
