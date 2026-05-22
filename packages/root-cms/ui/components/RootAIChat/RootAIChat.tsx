/**
 * The Root AI chat experience, shared by the full-page `/cms/ai` route and the
 * right-hand AI panel on the document editor page.
 *
 * Built on the Vercel AI SDK (`ai`, `@ai-sdk/react`). The server
 * (`/cms/api/ai.*`) proxies configured providers and persists chat history to
 * Firestore. This component handles:
 *
 * - Listing past chats and resuming them (page variant only).
 * - Picking a model and an execution mode.
 * - Streaming responses with reasoning and tool-call rendering.
 * - Sending image attachments to multimodal models.
 * - Routing CMS tool calls through the browser-side handlers in
 *   `./cmsToolHandlers` so writes use the signed-in user's Firebase
 *   credentials.
 */
import './RootAIChat.css';

import {useChat} from '@ai-sdk/react';
import {ActionIcon, Badge, Button, Loader, Menu, Tooltip} from '@mantine/core';
import {
  IconCheck,
  IconChevronDown,
  IconChevronRight,
  IconCopy,
  IconMessageCirclePlus,
  IconPaperclip,
  IconPencil,
  IconRobot,
  IconSend2,
  IconTrash,
  IconX,
} from '@tabler/icons-preact';
import type {UIMessage} from 'ai';
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithToolCalls,
} from 'ai';
import {marked} from 'marked';
import type {ComponentChildren} from 'preact';
import {useCallback, useEffect, useMemo, useRef, useState} from 'preact/hooks';
import {useLocation} from 'preact-iso';
import {joinClassNames} from '../../utils/classes.js';
import {uploadFileToGCS} from '../../utils/gcs.js';
import {stableJsonStringify} from '../../utils/objects.js';
import {BouncingLoader} from '../BouncingLoader/BouncingLoader.js';
import {JsDiff} from '../JsDiff/JsDiff.js';
import {Markdown} from '../Markdown/Markdown.js';
import type {CmsToolPreview} from './cmsToolHandlers.js';
import {
  executeCmsTool,
  isCmsWriteTool,
  previewCmsWriteTool,
} from './cmsToolHandlers.js';

export type RootAIChatVariant = 'page' | 'panel';

export interface RootAIChatDocContext {
  /** "<collectionId>/<slug>" of the doc the user is currently editing. */
  docId: string;
}

export interface RootAIChatProps {
  /**
   * `page` is the full `/cms/ai` route with chat history sidebar. `panel` is
   * the compact document-page side panel: no history sidebar, a close button,
   * fresh chat per mount.
   */
  variant: RootAIChatVariant;
  /** Chat to resume on mount. Ignored in `panel` mode (always starts fresh). */
  initialChatId?: string;
  /** When set, the AI is told which document the user is currently editing. */
  docContext?: RootAIChatDocContext;
  /** Called when the user clicks close. `panel` variant only. */
  onClose?: () => void;
}

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
  textContent?: string;
  textTruncated?: boolean;
  width?: number;
  height?: number;
}

type ExecutionMode = 'read' | 'approve' | 'auto';

interface ExecutionModeInfo {
  id: ExecutionMode;
  label: string;
  description: string;
}

const EXECUTION_MODES: ExecutionModeInfo[] = [
  {
    id: 'read',
    label: 'Read only',
    description: 'Inspect CMS content without planning or applying writes.',
  },
  {
    id: 'approve',
    label: 'Ask before writing',
    description: 'Read freely, then pause for approval before draft edits.',
  },
  {
    id: 'auto',
    label: 'Auto-apply draft edits',
    description: 'Apply draft-only writes without approval in this chat.',
  },
];

const EXECUTION_MODE_STORAGE_KEY = 'root-cms.ai.executionMode';
const SELECTED_MODEL_STORAGE_KEY = 'root-cms.ai.selectedModel';

function isExecutionMode(value: string | null): value is ExecutionMode {
  return EXECUTION_MODES.some((mode) => mode.id === value);
}

function readStoredExecutionMode(): ExecutionMode {
  if (typeof window === 'undefined') {
    return 'approve';
  }
  try {
    const value = window.localStorage.getItem(EXECUTION_MODE_STORAGE_KEY);
    if (isExecutionMode(value)) {
      return value;
    }
  } catch (err) {
    console.error('failed to read AI execution mode preference', err);
  }
  return 'approve';
}

function readStoredSelectedModel(models: ModelInfo[]): string | null {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    const value = window.localStorage.getItem(SELECTED_MODEL_STORAGE_KEY);
    if (value && models.some((model) => model.id === value)) {
      return value;
    }
  } catch (err) {
    console.error('failed to read AI model preference', err);
  }
  return null;
}

function persistSelectedModel(modelId: string) {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    window.localStorage.setItem(SELECTED_MODEL_STORAGE_KEY, modelId);
  } catch (err) {
    console.error('failed to save AI model preference', err);
  }
}

function persistExecutionMode(mode: ExecutionMode) {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    window.localStorage.setItem(EXECUTION_MODE_STORAGE_KEY, mode);
  } catch (err) {
    console.error('failed to save AI execution mode preference', err);
  }
}

interface PendingToolApproval {
  toolCallId: string;
  toolName: string;
  input: any;
  preview: CmsToolPreview;
  status: 'pending' | 'executing';
}

interface ToolApprovalControls {
  approvals: Record<string, PendingToolApproval>;
  onApprove: (toolCallId: string) => void;
  onReject: (toolCallId: string) => void;
}

const NEW_CHAT_ID = '';

export function RootAIChat(props: RootAIChatProps) {
  const [config, setConfig] = useState<AiConfigResponse | null>(null);
  const [configError, setConfigError] = useState<string>('');

  useEffect(() => {
    let active = true;
    fetch('/cms/api/ai.config', {credentials: 'include'})
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
    <div
      className={joinClassNames('RootAIChat', `RootAIChat--${props.variant}`)}
    >
      {!config && !configError ? (
        <div className="RootAIChat__loading">
          <Loader size="md" color="gray" />
        </div>
      ) : isEnabled ? (
        <ChatExperience
          variant={props.variant}
          config={config!}
          initialChatId={
            props.variant === 'panel' ? undefined : props.initialChatId
          }
          docContext={props.docContext}
          onClose={props.onClose}
        />
      ) : (
        <NotConfigured error={configError} onClose={props.onClose} />
      )}
    </div>
  );
}

function NotConfigured(props: {error?: string; onClose?: () => void}) {
  return (
    <div className="RootAIChat__notEnabled">
      {props.onClose && (
        <ActionIcon
          className="RootAIChat__notEnabled__close"
          onClick={props.onClose}
          title="Close"
        >
          <IconX size={16} />
        </ActionIcon>
      )}
      <div className="RootAIChat__notEnabled__icon">
        <IconRobot size={36} />
      </div>
      <div className="RootAIChat__notEnabled__title">
        Root AI is not configured for this project.
      </div>
      <div className="RootAIChat__notEnabled__body">
        Add an <code>ai.models</code> entry to <code>cmsPlugin()</code> in{' '}
        <code>root.config.ts</code>.
      </div>
      {props.error && (
        <pre className="RootAIChat__notEnabled__error">{props.error}</pre>
      )}
    </div>
  );
}

function ChatExperience(props: {
  variant: RootAIChatVariant;
  config: AiConfigResponse;
  initialChatId?: string;
  docContext?: RootAIChatDocContext;
  onClose?: () => void;
}) {
  const isPanel = props.variant === 'panel';
  const {route} = useLocation();
  const models = props.config.models || [];
  const getPreferredModelId = () =>
    readStoredSelectedModel(models) ||
    props.config.defaultModel ||
    models[0]?.id ||
    '';
  const [selectedModelId, setSelectedModelId] =
    useState<string>(getPreferredModelId);
  const [executionMode, setExecutionMode] = useState<ExecutionMode>(
    readStoredExecutionMode
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
    if (isPanel) {
      return;
    }
    try {
      const res = await fetch('/cms/api/ai.chats.list', {
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
    if (!isPanel && props.initialChatId) {
      loadChat(props.initialChatId);
    }
  }, []);

  useEffect(() => {
    persistExecutionMode(executionMode);
  }, [executionMode]);

  /** Fetches a chat by id and applies it to state without the activeChatId guard. */
  const loadChat = async (id: string) => {
    try {
      const res = await fetch('/cms/api/ai.chats.get', {
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
    setSelectedModelId(getPreferredModelId());
    setPendingChatId(NEW_CHAT_ID);
    setActiveChatId(NEW_CHAT_ID);
    setInitialMessages([]);
    setResetKey((k) => k + 1);
    if (!isPanel) {
      route('/cms/ai');
    }
  };

  const openChat = async (id: string) => {
    if (id === activeChatId) {
      return;
    }
    try {
      const res = await fetch('/cms/api/ai.chats.get', {
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
      if (!isPanel) {
        route(`/cms/ai/chat/${id}`);
      }
    } catch (err) {
      console.error('failed to load chat', err);
    }
  };

  const deleteChat = async (id: string) => {
    try {
      await fetch('/cms/api/ai.chats.delete', {
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

  const selectModel = (id: string) => {
    setSelectedModelId(id);
    persistSelectedModel(id);
  };

  return (
    <div className="RootAIChat__layout">
      {!isPanel && (
        <ChatHistorySidebar
          chats={chats}
          activeChatId={activeChatId}
          onSelect={openChat}
          onNew={startNewChat}
          onDelete={deleteChat}
        />
      )}
      <div className="RootAIChat__main">
        {isPanel && (
          <PanelHeader onNewChat={startNewChat} onClose={props.onClose} />
        )}
        <ChatPane
          key={resetKey}
          initialChatId={pendingChatId}
          model={selectedModel}
          initialMessages={initialMessages}
          executionMode={executionMode}
          models={models}
          selectedModel={selectedModel}
          docContext={props.docContext}
          onSelectModel={selectModel}
          onSelectExecutionMode={setExecutionMode}
          onChatPersisted={(id) => {
            setActiveChatId(id);
            refreshChats();
            if (!isPanel) {
              // Update URL when the chat is first persisted (new chat).
              window.history.replaceState(null, '', `/cms/ai/chat/${id}`);
            }
          }}
        />
      </div>
    </div>
  );
}

function PanelHeader(props: {onNewChat: () => void; onClose?: () => void}) {
  return (
    <div className="RootAIChat__panelHeader">
      <div className="RootAIChat__panelHeader__title">
        <IconRobot size={14} />
        <span>Root AI</span>
      </div>
      <div className="RootAIChat__panelHeader__actions">
        <Tooltip label="New chat">
          <ActionIcon size="xs" onClick={props.onNewChat}>
            <IconMessageCirclePlus size={14} />
          </ActionIcon>
        </Tooltip>
        {props.onClose && (
          <Tooltip label="Close (⌘ + i)">
            <ActionIcon size="xs" onClick={props.onClose}>
              <IconX size={14} />
            </ActionIcon>
          </Tooltip>
        )}
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
    <aside className="RootAIChat__sidebar">
      <button
        type="button"
        className="RootAIChat__sidebar__newButton"
        onClick={props.onNew}
      >
        <IconMessageCirclePlus size={18} />
        <span>New chat</span>
      </button>
      <div className="RootAIChat__sidebar__list">
        {props.chats.length === 0 && (
          <div className="RootAIChat__sidebar__empty">No chats yet.</div>
        )}
        {props.chats.map((chat) => (
          <div
            key={chat.id}
            className={joinClassNames(
              'RootAIChat__sidebar__item',
              chat.id === props.activeChatId &&
                'RootAIChat__sidebar__item--active'
            )}
            onClick={() => props.onSelect(chat.id)}
          >
            <div
              className="RootAIChat__sidebar__item__title"
              title={chat.title || 'Untitled chat'}
            >
              {chat.title || 'Untitled chat'}
            </div>
            <button
              type="button"
              className="RootAIChat__sidebar__item__delete"
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
  executionMode: ExecutionMode;
  onSelectExecutionMode: (mode: ExecutionMode) => void;
}) {
  const selectedMode =
    EXECUTION_MODES.find((mode) => mode.id === props.executionMode) ||
    EXECUTION_MODES[0];
  return (
    <div className="RootAIChat__options">
      <Menu
        control={
          <Button
            type="button"
            className="RootAIChat__modePicker"
            variant="subtle"
            color="dark"
            size="xs"
            compact
            leftIcon={<IconPencil size={16} />}
          >
            {selectedMode.label}
          </Button>
        }
      >
        {EXECUTION_MODES.map((mode) => (
          <Menu.Item
            key={mode.id}
            onClick={() => props.onSelectExecutionMode(mode.id)}
          >
            <div className="RootAIChat__modePicker__option">
              <div className="RootAIChat__modePicker__option__label">
                {mode.label}
              </div>
              <div className="RootAIChat__modePicker__option__description">
                {mode.description}
              </div>
            </div>
          </Menu.Item>
        ))}
      </Menu>
      <Menu
        control={
          <Button
            type="button"
            className="RootAIChat__modelPicker"
            variant="subtle"
            color="dark"
            size="xs"
            compact
            leftIcon={<IconRobot size={16} />}
          >
            {props.selectedModel?.label || 'Select model'}
          </Button>
        }
      >
        {props.models.map((model) => (
          <Menu.Item
            key={model.id}
            onClick={() => props.onSelectModel(model.id)}
          >
            <div className="RootAIChat__modelPicker__option">
              <div className="RootAIChat__modelPicker__option__label">
                {model.label}
              </div>
              {model.description && (
                <div className="RootAIChat__modelPicker__option__description">
                  {model.description}
                </div>
              )}
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
  executionMode: ExecutionMode;
  models: ModelInfo[];
  selectedModel?: ModelInfo;
  docContext?: RootAIChatDocContext;
  onSelectModel: (id: string) => void;
  onSelectExecutionMode: (mode: ExecutionMode) => void;
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
  const executionModeRef = useRef(props.executionMode);
  executionModeRef.current = props.executionMode;
  const docContextRef = useRef(props.docContext);
  docContextRef.current = props.docContext;
  const [pendingApprovals, setPendingApprovals] = useState<
    Record<string, PendingToolApproval>
  >({});
  const approvalResolvers = useRef<
    Record<string, (decision: 'approve' | 'reject') => void>
  >({});

  useEffect(() => {
    return () => {
      for (const resolve of Object.values(approvalResolvers.current)) {
        resolve('reject');
      }
      approvalResolvers.current = {};
    };
  }, []);

  const waitForApproval = useCallback(
    (
      toolCallId: string,
      toolName: string,
      input: any,
      preview: CmsToolPreview
    ) =>
      new Promise<'approve' | 'reject'>((resolve) => {
        approvalResolvers.current[toolCallId] = resolve;
        setPendingApprovals((prev) => ({
          ...prev,
          [toolCallId]: {
            toolCallId,
            toolName,
            input,
            preview,
            status: 'pending',
          },
        }));
      }),
    []
  );

  const approveToolCall = useCallback((toolCallId: string) => {
    setPendingApprovals((prev) => {
      const approval = prev[toolCallId];
      if (!approval) {
        return prev;
      }
      return {
        ...prev,
        [toolCallId]: {...approval, status: 'executing'},
      };
    });
    approvalResolvers.current[toolCallId]?.('approve');
    delete approvalResolvers.current[toolCallId];
  }, []);

  const rejectToolCall = useCallback((toolCallId: string) => {
    setPendingApprovals((prev) => {
      const next = {...prev};
      delete next[toolCallId];
      return next;
    });
    approvalResolvers.current[toolCallId]?.('reject');
    delete approvalResolvers.current[toolCallId];
  }, []);

  const resolveToolOutput = useCallback(
    async (toolCall: {toolCallId: string; toolName: string; input: any}) => {
      if (!isCmsWriteTool(toolCall.toolName)) {
        return await executeCmsTool(toolCall.toolName, toolCall.input);
      }

      const mode = executionModeRef.current;
      if (mode === 'read') {
        return {
          success: false,
          error: 'WRITE_BLOCKED_BY_MODE',
          message:
            'The current execution mode is read only. Do not call write tools.',
        };
      }

      let preview: CmsToolPreview;
      try {
        preview = await previewCmsWriteTool(toolCall.toolName, toolCall.input);
      } catch (err: any) {
        return {
          success: false,
          error: 'PREVIEW_FAILED',
          message: err?.message || String(err),
        };
      }
      if (preview.error) {
        return {
          success: false,
          error: preview.error,
          message: preview.summary,
          errors: preview.errors,
          hint: preview.hint,
        };
      }

      if (mode === 'approve') {
        const decision = await waitForApproval(
          toolCall.toolCallId,
          toolCall.toolName,
          toolCall.input,
          preview
        );
        if (decision === 'reject') {
          return {
            success: false,
            error: 'USER_REJECTED',
            message:
              'The user rejected this draft change. Do not retry unless they ask for a revised version.',
          };
        }
      }

      try {
        return await executeCmsTool(toolCall.toolName, toolCall.input);
      } finally {
        setPendingApprovals((prev) => {
          if (!prev[toolCall.toolCallId]) {
            return prev;
          }
          const next = {...prev};
          delete next[toolCall.toolCallId];
          return next;
        });
      }
    },
    [waitForApproval]
  );

  const transport = useMemo(
    () =>
      new DefaultChatTransport<UIMessage>({
        api: '/cms/api/ai.chat',
        credentials: 'include',
        // Send only the latest message (the new user turn, or a tool-result
        // turn after an auto-resubmit). The server has the rest of the
        // history persisted in Firestore under `chatId` and merges it in
        // before calling `streamText`. Without this, every turn would
        // re-POST the full conversation (including any prior tool results)
        // and large chats would exceed body-parser's payload limit.
        prepareSendMessagesRequest: ({messages}) => ({
          body: {
            message: messages.at(-1),
            chatId: effectiveChatId,
            modelId: modelRef.current,
            executionMode: executionModeRef.current,
            docId: docContextRef.current?.docId,
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
      const output = await resolveToolOutput(toolCall);
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
        toolApprovals={{
          approvals: pendingApprovals,
          onApprove: approveToolCall,
          onReject: rejectToolCall,
        }}
      />
      {error && (
        <div className="RootAIChat__error">
          <strong>Error:</strong> {error.message}
        </div>
      )}
      <ChatComposer
        disabled={!props.model}
        canAttach={props.model?.capabilities.attachments ?? false}
        isStreaming={isStreaming}
        onStop={stop}
        controls={
          <ChatHeader
            models={props.models}
            selectedModel={props.selectedModel}
            onSelectModel={props.onSelectModel}
            executionMode={props.executionMode}
            onSelectExecutionMode={props.onSelectExecutionMode}
          />
        }
        onSend={(text, attachments) => {
          if (!text && attachments.length === 0) {
            return;
          }
          const preparedAttachments = prepareAttachmentsForSend(attachments);
          const messageText = [text, preparedAttachments.text]
            .filter(Boolean)
            .join('\n\n');
          sendMessage({
            text: messageText,
            files: preparedAttachments.files.map((a) => ({
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
  toolApprovals?: ToolApprovalControls;
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
      <div
        className="RootAIChat__transcript RootAIChat__transcript--empty"
        ref={ref}
      >
        <div className="RootAIChat__welcome">
          <div className="RootAIChat__welcome__icon">
            <IconRobot size={36} />
          </div>
          <div className="RootAIChat__welcome__title">Root AI</div>
          <div className="RootAIChat__welcome__body">
            {props.emptyMessage || 'What are we going to get done today?'}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="RootAIChat__transcript" ref={ref}>
      <div className="RootAIChat__transcript__inner">
        {props.messages.map((m) => (
          <MessageView
            key={m.id}
            message={m}
            toolApprovals={props.toolApprovals}
          />
        ))}
        {props.isStreaming && (
          <div className="RootAIChat__streamingIndicator">
            <BouncingLoader size={6} />
          </div>
        )}
      </div>
    </div>
  );
}

function MessageView(props: {
  message: UIMessage;
  toolApprovals?: ToolApprovalControls;
}) {
  const message = props.message;
  const isUser = message.role === 'user';
  const username = isUser ? 'You' : 'Root AI';
  const photoURL = isUser ? window.firebase.user?.photoURL : null;
  const [copied, setCopied] = useState(false);

  const getMessageMarkdown = useCallback(() => {
    return (message.parts || [])
      .filter((part: any) => part.type === 'text' && part.text)
      .map((part: any) => part.text)
      .join('\n\n');
  }, [message.parts]);

  const handleCopy = useCallback(async () => {
    const markdown = getMessageMarkdown();
    if (!markdown) return;
    const html = marked.parse(markdown) as string;
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([html], {type: 'text/html'}),
          'text/plain': new Blob([markdown], {type: 'text/plain'}),
        }),
      ]);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback to plain text copy.
      await navigator.clipboard.writeText(markdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [getMessageMarkdown]);

  return (
    <div
      className={joinClassNames(
        'RootAIChat__message',
        `RootAIChat__message--${message.role}`
      )}
    >
      <div className="RootAIChat__message__avatar">
        {photoURL ? (
          <img src={photoURL} alt={username} />
        ) : (
          <IconRobot size={20} />
        )}
      </div>
      <div className="RootAIChat__message__body">
        <div className="RootAIChat__message__username">{username}</div>
        <div className="RootAIChat__message__parts">
          {(message.parts || []).map((part, i) => (
            <PartView key={i} part={part} toolApprovals={props.toolApprovals} />
          ))}
        </div>
        <button
          type="button"
          className={joinClassNames(
            'RootAIChat__message__copy',
            copied && 'RootAIChat__message__copy--copied'
          )}
          title={copied ? 'Copied!' : 'Copy message'}
          onClick={handleCopy}
        >
          {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
        </button>
      </div>
    </div>
  );
}

function PartView(props: {part: any; toolApprovals?: ToolApprovalControls}) {
  const part = props.part;
  if (part.type === 'text') {
    if (!part.text) {
      return null;
    }
    return (
      <div className="RootAIChat__textPart">
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
      <a
        className="RootAIChat__sourcePart"
        href={part.url}
        target="_blank"
        rel="noopener noreferrer"
      >
        {part.title || part.url}
      </a>
    );
  }
  if (typeof part.type === 'string' && part.type.startsWith('tool-')) {
    return <ToolPartView part={part} toolApprovals={props.toolApprovals} />;
  }
  if (part.type === 'dynamic-tool') {
    return <ToolPartView part={part} toolApprovals={props.toolApprovals} />;
  }
  if (part.type === 'step-start') {
    return null;
  }
  return (
    <div className="RootAIChat__unknownPart">
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
        'RootAIChat__reasoning',
        open && 'RootAIChat__reasoning--open'
      )}
    >
      <button
        type="button"
        className="RootAIChat__reasoning__toggle"
        onClick={() => setOpen(!open)}
      >
        <IconChevronDown
          size={14}
          style={{transform: open ? 'rotate(0deg)' : 'rotate(-90deg)'}}
        />
        <span>Thinking</span>
      </button>
      {open && (
        <div className="RootAIChat__reasoning__body">
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
      <div className="RootAIChat__filePart">
        <img src={part.url} alt={part.filename || 'attachment'} />
      </div>
    );
  }
  return (
    <a
      className="RootAIChat__filePart RootAIChat__filePart--link"
      href={part.url}
      target="_blank"
      rel="noopener noreferrer"
    >
      <IconPaperclip size={14} />
      <span>{part.filename || part.url}</span>
    </a>
  );
}

function ToolPartView(props: {
  part: any;
  toolApprovals?: ToolApprovalControls;
}) {
  const part = props.part;
  // Static tool parts are typed `tool-<toolName>`; dynamic-tool uses
  // `toolName`.
  const toolName: string =
    typeof part.type === 'string' && part.type.startsWith('tool-')
      ? part.type.slice('tool-'.length)
      : part.toolName || 'tool';
  const state: string = part.state || '';
  const toolCallId = getToolCallId(part);
  const approvalControls = props.toolApprovals;
  const approval = toolCallId
    ? approvalControls?.approvals[toolCallId]
    : undefined;
  const [open, setOpen] = useState(!!approval);

  // Auto-open only for pending approvals, which need a user decision.
  useEffect(() => {
    if (approval) {
      setOpen(true);
    }
  }, [approval]);

  return (
    <div className="RootAIChat__tool">
      <button
        type="button"
        className="RootAIChat__tool__header"
        onClick={() => setOpen(!open)}
      >
        <IconChevronDown
          className={joinClassNames(
            'RootAIChat__tool__header__icon',
            open && 'RootAIChat__tool__header__icon--open'
          )}
          size={14}
        />
        <Badge color="dark" variant="filled" size="xs">
          {toolName}
        </Badge>
        <span className="RootAIChat__tool__title">
          {prettyToolName(toolName, part.input)}
        </span>
        <span className="RootAIChat__tool__state">
          {approval
            ? prettyApprovalState(approval.status)
            : prettyToolState(state)}
        </span>
      </button>
      {open && (
        <div className="RootAIChat__tool__body">
          {approval && approvalControls && (
            <ToolApprovalCard
              approval={approval}
              onApprove={() => approvalControls.onApprove(approval.toolCallId)}
              onReject={() => approvalControls.onReject(approval.toolCallId)}
            />
          )}
          {part.output?.receipt && <ToolReceipt output={part.output} />}
          {part.input && (
            <details>
              <summary>
                <IconChevronRight
                  size={14}
                  className="RootAIChat__tool__json__icon"
                />
                <span>Input</span>
              </summary>
              <pre>{JSON.stringify(part.input, null, 2)}</pre>
            </details>
          )}
          {part.output && (
            <details>
              <summary>
                <IconChevronRight
                  size={14}
                  className="RootAIChat__tool__json__icon"
                />
                <span>Output</span>
              </summary>
              <pre>{JSON.stringify(part.output, null, 2)}</pre>
            </details>
          )}
          {part.errorText && (
            <div className="RootAIChat__tool__error">{part.errorText}</div>
          )}
        </div>
      )}
    </div>
  );
}

function getToolCallId(part: any): string {
  return part.toolCallId || part.id || '';
}

function prettyToolName(toolName: string, input: any): string {
  switch (toolName) {
    case 'collections_list':
      return 'List collections';
    case 'docs_list':
      return `List ${input?.collectionId || 'documents'}`;
    case 'docs_search':
      return `Search docs${input?.query ? ` for "${input.query}"` : ''}`;
    case 'doc_get':
      return `Read ${input?.docId || 'document'}`;
    case 'doc_getVersion':
      return `Read ${input?.docId || 'document'} version`;
    case 'doc_set':
      return `Replace ${input?.docId || 'draft fields'}`;
    case 'doc_create':
      return `Create ${input?.docId || 'draft document'}`;
    case 'doc_updateField':
      return `Update ${input?.path || 'field'}`;
    case 'doc_edit':
      return `Edit ${input?.docId || 'document'}`;
    case 'doc_duplicate':
      return `Duplicate ${input?.fromDocId || 'document'}`;
    case 'doc_listVersions':
      return `List versions for ${input?.docId || 'document'}`;
    case 'doc_translateField':
      return 'Translate field text';
    case 'schema_get':
      return `Read ${input?.collectionId || 'collection'} schema`;
    default:
      return toolName;
  }
}

function ToolApprovalCard(props: {
  approval: PendingToolApproval;
  onApprove: () => void;
  onReject: () => void;
}) {
  const preview = props.approval.preview;
  const hasDiff = preview.before !== undefined && preview.after !== undefined;
  return (
    <div className="RootAIChat__approval">
      <div className="RootAIChat__approval__header">
        <div>
          <div className="RootAIChat__approval__title">{preview.title}</div>
          <div className="RootAIChat__approval__summary">{preview.summary}</div>
        </div>
        <Badge
          className="RootAIChat__approval__status"
          variant="light"
          color="gray"
        >
          {props.approval.status === 'executing' ? 'Applying' : 'Review'}
        </Badge>
      </div>
      {preview.details.length > 0 && (
        <div className="RootAIChat__approval__details">
          {preview.details.map((detail) => (
            <div key={`${detail.label}:${detail.value}`}>
              <span>{detail.label}</span>
              <strong>{detail.value}</strong>
            </div>
          ))}
        </div>
      )}
      {hasDiff && (
        <JsDiff
          className="RootAIChat__approval__diff"
          oldCode={stableJsonStringify(preview.before)}
          newCode={stableJsonStringify(preview.after)}
        />
      )}
      <div className="RootAIChat__approval__actions">
        <Button
          variant="default"
          color="dark"
          size="xs"
          type="button"
          className="RootAIChat__approval__button"
          disabled={props.approval.status === 'executing'}
          onClick={props.onReject}
        >
          Reject
        </Button>
        <Button
          variant="filled"
          color="green"
          size="xs"
          type="button"
          className="RootAIChat__approval__button RootAIChat__approval__button--primary"
          disabled={props.approval.status === 'executing'}
          onClick={props.onApprove}
        >
          Approve draft edit
        </Button>
      </div>
    </div>
  );
}

function ToolReceipt(props: {output: any}) {
  const receipt = props.output.receipt;
  return (
    <div className="RootAIChat__receipt">
      <div className="RootAIChat__receipt__title">
        <IconCheck size={14} />
        <span>{receipt.title}</span>
      </div>
      <div className="RootAIChat__receipt__summary">{receipt.summary}</div>
      {receipt.details?.length > 0 && (
        <div className="RootAIChat__receipt__details">
          {receipt.details.map((detail: any) => (
            <div key={`${detail.label}:${detail.value}`}>
              <span>{detail.label}</span>
              <strong>{detail.value}</strong>
            </div>
          ))}
        </div>
      )}
      {receipt.adminUrl && (
        <Button
          component="a"
          className="RootAIChat__receipt__link"
          variant="default"
          size="xs"
          compact
          href={receipt.adminUrl}
        >
          Open document
        </Button>
      )}
    </div>
  );
}

function prettyApprovalState(status: PendingToolApproval['status']): string {
  return status === 'executing' ? 'applying…' : 'waiting for approval';
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
  controls?: ComponentChildren;
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
      const mediaType = file.type || guessMimeType(file.name);
      const inlineText = await readInlineAttachmentText(file, mediaType);
      const data: any = await uploadFileToGCS(file, {disableGci: true});
      setAttachments((prev) => [
        ...prev,
        {
          url: data.src,
          filename: data.filename || file.name,
          mediaType,
          textContent: inlineText?.text,
          textTruncated: inlineText?.truncated,
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
    <div className="RootAIChat__composer">
      {attachments.length > 0 && (
        <div className="RootAIChat__composer__attachments">
          {attachments.map((a, i) => (
            <div key={i} className="RootAIChat__composer__attachment">
              {a.mediaType.startsWith('image/') ? (
                <img src={a.url} alt={a.filename} />
              ) : (
                <span className="RootAIChat__composer__attachment__name">
                  {a.filename}
                </span>
              )}
              <button
                type="button"
                className="RootAIChat__composer__attachment__remove"
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
      <div className="RootAIChat__composer__row">
        <Tooltip
          label={
            props.canAttach
              ? 'Attach file'
              : "Model doesn't support attachments"
          }
          className="RootAIChat__composer__attachTooltip"
        >
          <ActionIcon
            component="label"
            radius="xl"
            className={joinClassNames(
              'RootAIChat__composer__attach',
              !props.canAttach && 'RootAIChat__composer__attach--disabled'
            )}
            disabled={!props.canAttach}
          >
            {uploading ? <Loader size="xs" /> : <IconPaperclip size={18} />}
            <input
              ref={fileRef}
              type="file"
              style={{display: 'none'}}
              onChange={onFileChange}
            />
          </ActionIcon>
        </Tooltip>
        <textarea
          ref={textareaRef}
          className="RootAIChat__composer__textarea"
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
              if (item.kind === 'file') {
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
            className="RootAIChat__composer__button RootAIChat__composer__stopButton"
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
            className="RootAIChat__composer__button RootAIChat__composer__submitButton"
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
      {props.controls}
    </div>
  );
}

const MAX_INLINE_ATTACHMENT_CHARS = 100_000;

function prepareAttachmentsForSend(attachments: AttachmentPreview[]): {
  files: AttachmentPreview[];
  text: string;
} {
  const files = attachments.filter(shouldSendAsModelFile);
  const textBlocks = attachments
    .filter((attachment) => !shouldSendAsModelFile(attachment))
    .map(formatAttachmentForPrompt);
  return {
    files,
    text: textBlocks.length
      ? `Attached files:\n\n${textBlocks.join('\n\n')}`
      : '',
  };
}

function shouldSendAsModelFile(attachment: AttachmentPreview): boolean {
  return attachment.mediaType.startsWith('image/');
}

function formatAttachmentForPrompt(attachment: AttachmentPreview): string {
  const title = `File: ${attachment.filename} (${attachment.mediaType})`;
  if (attachment.textContent !== undefined) {
    const truncated = attachment.textTruncated
      ? '\n\n[Content truncated before sending to the model.]'
      : '';
    return `${title}\nURL: ${attachment.url}\n\n~~~\n${attachment.textContent}${truncated}\n~~~`;
  }
  return `${title}\nURL: ${attachment.url}\n\n[The file was uploaded, but its binary content was not inlined into this chat message.]`;
}

async function readInlineAttachmentText(
  file: File,
  mediaType: string
): Promise<{text: string; truncated: boolean} | null> {
  if (!isTextLikeAttachment(file.name, mediaType)) {
    return null;
  }
  const text = await file.text();
  if (text.length <= MAX_INLINE_ATTACHMENT_CHARS) {
    return {text, truncated: false};
  }
  return {
    text: text.slice(0, MAX_INLINE_ATTACHMENT_CHARS),
    truncated: true,
  };
}

function isTextLikeAttachment(filename: string, mediaType: string): boolean {
  if (mediaType.startsWith('text/')) {
    return true;
  }
  return [
    '.css',
    '.js',
    '.jsx',
    '.json',
    '.md',
    '.mdx',
    '.mjs',
    '.scss',
    '.ts',
    '.tsx',
    '.txt',
    '.yaml',
    '.yml',
  ].some((ext) => filename.toLowerCase().endsWith(ext));
}

function guessMimeType(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.svg')) return 'image/svg+xml';
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.json')) return 'application/json';
  if (lower.endsWith('.csv')) return 'text/csv';
  if (lower.endsWith('.md')) return 'text/markdown';
  if (lower.endsWith('.txt')) return 'text/plain';
  return 'application/octet-stream';
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
