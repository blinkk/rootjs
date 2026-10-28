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
import {
  IconCheck,
  IconChevronDown,
  IconChevronRight,
  IconCopy,
  IconHistory,
  IconMessageCirclePlus,
  IconPaperclip,
  IconPencil,
  IconRobot,
  IconSend2,
  IconTrash,
  IconX,
} from '@tabler/icons-preact';
import type {UIMessage} from 'ai';
import {lastAssistantMessageIsCompleteWithToolCalls} from 'ai';
import {marked} from 'marked';
import {createContext} from 'preact';
import type {ComponentChildren} from 'preact';
import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'preact/hooks';
import {useLocation} from 'preact-iso';
import {isGoogleWriteTool} from '../../../../../core/ai-tools-google.js';
import type {SerializedAiSkillSummary} from '../../../../../shared/ai/extensions.js';
import {
  testClientModelExpired,
  type SerializedClientModel,
} from '../../../../../shared/ai/models.js';
import {BouncingLoader} from '../../../../components/BouncingLoader/BouncingLoader.js';
import {JsDiff} from '../../../../components/JsDiff/JsDiff.js';
import {Markdown} from '../../../../components/Markdown/Markdown.js';
import {uploadFileToGCS} from '../../../../integrations/gcs.js';
import {Badge} from '../../../../primitives/Badge/Badge.js';
import {Button} from '../../../../primitives/Button/Button.js';
import {Dialog} from '../../../../primitives/Dialog/Dialog.js';
import {IconButton} from '../../../../primitives/IconButton/IconButton.js';
import {Menu, MenuItem} from '../../../../primitives/Menu/Menu.js';
import {Spinner} from '../../../../primitives/Spinner/Spinner.js';
import {cn} from '../../../../utils/classes.js';
import {stableJsonStringify} from '../../../../utils/objects.js';
import {
  ChatSummary,
  deleteChat as deleteStoredChat,
  generateChatTitle,
  getChat as getStoredChat,
  listChats as listStoredChats,
  saveChat as saveStoredChat,
} from '../../ai-chats.js';
import {ChatErrorNotice} from '../ChatErrorNotice/ChatErrorNotice.js';
import {
  ClientTurnConfig,
  createClientChatTransport,
} from './clientChatTransport.js';
import {
  createClientCmsTools,
  createReadOnlyClientCmsTools,
} from './clientCmsTools.js';
import {
  createClientGoogleTools,
  maybeAuthorizeGoogle,
} from './clientGoogleTools.js';
import {
  createClientPluginTools,
  executePluginTool,
  previewPluginWriteTool,
} from './clientPluginTools.js';
import type {CmsToolPreview} from './cmsToolHandlers.js';
import {
  executeCmsTool,
  isCmsWriteTool,
  previewCmsWriteTool,
} from './cmsToolHandlers.js';
import {
  executeGoogleWriteTool,
  previewGoogleWriteTool,
} from './googleToolHandlers.js';
import {prettyToolName, prettyToolState} from './toolLabels.js';

export type RootAIChatVariant = 'page' | 'panel';

export interface RootAIChatDocContext {
  /** "<collectionId>/<slug>" of the doc the user is currently editing. */
  docId: string;
}

export interface RootAIChatReleaseContext {
  /** Id of the release the user is currently viewing. */
  releaseId: string;
}

/** A message to send to the chat on behalf of the user. */
export interface RootAIChatPrompt {
  /**
   * Unique id for the prompt. Changing the id sends the prompt again, e.g.
   * when the user clicks the same "summarize" button twice.
   */
  id: string | number;
  text: string;
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
  /** When set, the AI is told which release the user is currently viewing. */
  releaseContext?: RootAIChatReleaseContext;
  /**
   * A message to send once the chat is ready. Sent at most once per prompt
   * id, into the current conversation.
   */
  prompt?: RootAIChatPrompt;
  /** Example prompts shown as shortcuts when the chat is empty. */
  suggestedPrompts?: string[];
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

interface AiConfigResponse {
  enabled: boolean;
  defaultModel?: string;
  models?: ModelInfo[];
  /** Whether the signed-in user may use the auto-apply execution mode. */
  canAutoApply?: boolean;
  /** Skills the user can invoke with `/<name>` in the composer. */
  skills?: SerializedAiSkillSummary[];
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

/** The chat's variant, so nested views can size themselves for the panel. */
const ChatVariantContext = createContext<RootAIChatVariant>('page');

/** Whether the chat is rendered as the compact side panel. */
function useIsPanel() {
  return useContext(ChatVariantContext) === 'panel';
}

/** Inline `<code>` in the "not configured" message. */
const CODE_CLASSES =
  'rounded-sm border border-border bg-surface-hover px-1 font-mono';

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
    <ChatVariantContext.Provider value={props.variant}>
      <div
        className={cn(
          'RootAIChat',
          `RootAIChat--${props.variant}`,
          'relative flex min-h-0 flex-col bg-page',
          // On the AI page, `.Layout__main > *:first-child` sizes it.
          props.variant === 'panel' && 'size-full overflow-hidden'
        )}
      >
        {!config && !configError ? (
          <div className="RootAIChat__loading flex flex-1 items-center justify-center text-muted">
            <Spinner size="lg" />
          </div>
        ) : isEnabled ? (
          <ChatExperience
            variant={props.variant}
            config={config!}
            initialChatId={
              props.variant === 'panel' ? undefined : props.initialChatId
            }
            docContext={props.docContext}
            releaseContext={props.releaseContext}
            prompt={props.prompt}
            suggestedPrompts={props.suggestedPrompts}
            onClose={props.onClose}
          />
        ) : (
          <NotConfigured error={configError} onClose={props.onClose} />
        )}
      </div>
    </ChatVariantContext.Provider>
  );
}

function NotConfigured(props: {error?: string; onClose?: () => void}) {
  const isPanel = useIsPanel();
  return (
    <div className="RootAIChat__notEnabled absolute inset-x-0 top-1/2 flex -translate-y-1/2 flex-col items-center gap-3 px-6 text-center">
      {props.onClose && (
        <div className="RootAIChat__notEnabled__close absolute top-2 right-2 flex">
          <IconButton label="Close" onClick={props.onClose}>
            <IconX />
          </IconButton>
        </div>
      )}
      <div className="RootAIChat__notEnabled__icon flex rounded-full border border-border p-1.5">
        <IconRobot size={36} />
      </div>
      <div
        className={cn(
          'RootAIChat__notEnabled__title font-bold leading-tight',
          isPanel ? 'text-xl' : 'text-2xl'
        )}
      >
        Root AI is not configured for this project.
      </div>
      <div className="RootAIChat__notEnabled__body text-base text-muted">
        Add an <code className={CODE_CLASSES}>ai.models</code> entry to{' '}
        <code className={CODE_CLASSES}>cmsPlugin()</code> in{' '}
        <code className={CODE_CLASSES}>root.config.ts</code>.
      </div>
      {props.error && (
        <pre className="RootAIChat__notEnabled__error mt-3 mb-0 max-w-150 overflow-auto rounded-md border border-danger-line bg-danger-soft px-3 py-2 font-mono text-sm text-danger">
          {props.error}
        </pre>
      )}
    </div>
  );
}

function ChatExperience(props: {
  variant: RootAIChatVariant;
  config: AiConfigResponse;
  initialChatId?: string;
  docContext?: RootAIChatDocContext;
  releaseContext?: RootAIChatReleaseContext;
  prompt?: RootAIChatPrompt;
  suggestedPrompts?: string[];
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
  // Title of the chat being resumed, so ChatPane doesn't regenerate it.
  const [initialTitle, setInitialTitle] = useState<string>('');
  const [chats, setChats] = useState<ChatSummary[]>([]);
  // Bumped to force ChatPane to remount on explicit user actions ("new chat",
  // "open chat"). Auto-assigning a chat id from ChatPane does NOT bump this,
  // so messages aren't lost mid-conversation.
  const [resetKey, setResetKey] = useState(0);
  // Id of the last prompt sent, so a remounted ChatPane (e.g. "new chat")
  // doesn't send it again.
  const [sentPromptId, setSentPromptId] = useState<string | number | null>(
    null
  );
  const pendingPrompt =
    props.prompt && props.prompt.id !== sentPromptId ? props.prompt : undefined;

  const refreshChats = async () => {
    if (isPanel) {
      return;
    }
    try {
      const chats = await listStoredChats();
      setChats(chats);
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

  /** Fetches a chat by id and applies it to state. */
  const applyChat = async (id: string): Promise<boolean> => {
    try {
      const chat = await getStoredChat(id);
      if (!chat) {
        return false;
      }
      setPendingChatId(id);
      setActiveChatId(id);
      setInitialMessages((chat.messages || []) as UIMessage[]);
      setInitialTitle(chat.title || '');
      if (chat.modelId) {
        const exists = models.find((m) => m.id === chat.modelId);
        if (exists) {
          setSelectedModelId(chat.modelId);
        }
      }
      setResetKey((k) => k + 1);
      return true;
    } catch (err) {
      console.error('failed to load chat', err);
      return false;
    }
  };

  const loadChat = (id: string) => applyChat(id);

  const startNewChat = () => {
    setSelectedModelId(getPreferredModelId());
    setPendingChatId(NEW_CHAT_ID);
    setActiveChatId(NEW_CHAT_ID);
    setInitialMessages([]);
    setInitialTitle('');
    setResetKey((k) => k + 1);
    if (!isPanel) {
      route('/cms/ai');
    }
  };

  const openChat = async (id: string) => {
    if (id === activeChatId) {
      return;
    }
    const ok = await applyChat(id);
    if (ok && !isPanel) {
      route(`/cms/ai/chat/${id}`);
    }
  };

  const deleteChat = async (id: string) => {
    try {
      await deleteStoredChat(id);
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
    <div className="RootAIChat__layout flex min-h-0 flex-1">
      {!isPanel && (
        <ChatHistorySidebar
          className="hidden md:flex"
          chats={chats}
          activeChatId={activeChatId}
          onSelect={openChat}
          onNew={startNewChat}
          onDelete={deleteChat}
        />
      )}
      <div className="RootAIChat__main relative flex min-h-0 min-w-0 flex-1 flex-col">
        {isPanel ? (
          <PanelHeader onNewChat={startNewChat} onClose={props.onClose} />
        ) : (
          <MobileHeader
            chats={chats}
            activeChatId={activeChatId}
            onSelect={openChat}
            onNew={startNewChat}
            onDelete={deleteChat}
          />
        )}
        <ChatPane
          key={resetKey}
          initialChatId={pendingChatId}
          initialTitle={initialTitle}
          model={selectedModel}
          initialMessages={initialMessages}
          executionMode={executionMode}
          canAutoApply={props.config.canAutoApply ?? false}
          skills={props.config.skills || []}
          models={models}
          selectedModel={selectedModel}
          docContext={props.docContext}
          releaseContext={props.releaseContext}
          prompt={pendingPrompt}
          onPromptSent={setSentPromptId}
          suggestedPrompts={props.suggestedPrompts}
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
    <div className="RootAIChat__panelHeader flex h-9 shrink-0 items-center justify-between gap-2 border-b border-border bg-surface px-3">
      <div className="RootAIChat__panelHeader__title flex items-center gap-1.5 text-sm font-semibold">
        <IconRobot size={14} />
        <span>Root AI</span>
      </div>
      <div className="RootAIChat__panelHeader__actions flex items-center gap-0.5">
        <IconButton size="xs" label="New chat" onClick={props.onNewChat}>
          <IconMessageCirclePlus />
        </IconButton>
        {props.onClose && (
          <IconButton size="xs" label="Close (⌘ + i)" onClick={props.onClose}>
            <IconX />
          </IconButton>
        )}
      </div>
    </div>
  );
}

interface ChatHistoryProps {
  chats: ChatSummary[];
  activeChatId: string;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
}

/**
 * The page variant's header below `md`, where the history sidebar is hidden:
 * opens the chat history in a drawer, and starts a new chat.
 */
function MobileHeader(props: ChatHistoryProps) {
  const [open, setOpen] = useState(false);
  const activeChat = props.chats.find((c) => c.id === props.activeChatId);
  return (
    <div className="RootAIChat__mobileHeader flex h-10 shrink-0 items-center gap-1 border-b border-border bg-surface px-2 md:hidden">
      <IconButton
        label="Chat history"
        tooltip={false}
        onClick={() => setOpen(true)}
      >
        <IconHistory />
      </IconButton>
      <div className="RootAIChat__mobileHeader__title min-w-0 flex-1 truncate text-sm font-semibold">
        {activeChat?.title || 'New chat'}
      </div>
      <IconButton label="New chat" tooltip={false} onClick={props.onNew}>
        <IconMessageCirclePlus />
      </IconButton>
      <Dialog
        className="RootAIChat__historyDrawer"
        bodyClassName="flex flex-col px-0 pb-0"
        open={open}
        onClose={() => setOpen(false)}
        position="left"
        size={280}
        title="Chats"
      >
        <ChatHistoryList
          {...props}
          onSelect={(id) => {
            setOpen(false);
            props.onSelect(id);
          }}
          onNew={() => {
            setOpen(false);
            props.onNew();
          }}
        />
      </Dialog>
    </div>
  );
}

function ChatHistorySidebar(props: ChatHistoryProps & {className?: string}) {
  const {className, ...listProps} = props;
  return (
    <aside
      className={cn(
        'RootAIChat__sidebar min-h-0 w-65 shrink-0 flex-col overflow-hidden border-r border-border bg-surface',
        className
      )}
    >
      <ChatHistoryList {...listProps} />
    </aside>
  );
}

/** The "New chat" button and the list of past chats. */
function ChatHistoryList(props: ChatHistoryProps) {
  return (
    <>
      <button
        type="button"
        className="RootAIChat__sidebar__newButton m-3 flex shrink-0 cursor-pointer appearance-none items-center gap-2 rounded-lg border border-border bg-page px-3 py-2.5 font-sans text-base font-semibold text-fg transition-colors hover:bg-surface-active focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        onClick={props.onNew}
      >
        <IconMessageCirclePlus size={18} />
        <span>New chat</span>
      </button>
      <div className="RootAIChat__sidebar__list flex min-h-0 flex-1 flex-col gap-0.5 overflow-auto px-2 pb-3">
        {props.chats.length === 0 && (
          <div className="RootAIChat__sidebar__empty p-3 text-center text-sm text-muted">
            No chats yet.
          </div>
        )}
        {props.chats.map((chat) => {
          const active = chat.id === props.activeChatId;
          return (
            <div
              key={chat.id}
              className={cn(
                'RootAIChat__sidebar__item group/item flex items-center gap-1 rounded-md pr-1 transition-colors hover:bg-surface-active',
                active && 'bg-surface-hover'
              )}
            >
              <button
                type="button"
                className="RootAIChat__sidebar__item__title min-w-0 flex-1 cursor-pointer appearance-none truncate rounded-md border-0 bg-transparent py-2 pl-3 text-left font-sans text-sm text-fg focus-visible:outline-2 focus-visible:outline-focus pointer-coarse:py-3"
                title={chat.title || 'Untitled chat'}
                aria-current={active ? 'true' : undefined}
                onClick={() => props.onSelect(chat.id)}
              >
                {chat.title || 'Untitled chat'}
              </button>
              <IconButton
                size="xs"
                label="Delete chat"
                className="RootAIChat__sidebar__item__delete text-muted opacity-0 transition-opacity focus-visible:opacity-100 group-hover/item:opacity-100 pointer-coarse:opacity-100"
                onClick={() => {
                  if (window.confirm('Delete this chat?')) {
                    props.onDelete(chat.id);
                  }
                }}
              >
                <IconTrash />
              </IconButton>
            </div>
          );
        })}
      </div>
    </>
  );
}

function ChatHeader(props: {
  models: ModelInfo[];
  selectedModel?: ModelInfo;
  onSelectModel: (id: string) => void;
  executionMode: ExecutionMode;
  canAutoApply: boolean;
  onSelectExecutionMode: (mode: ExecutionMode) => void;
}) {
  // Auto-apply requires a publisher role; hide it otherwise (the server also
  // downgrades it defensively).
  const availableModes = props.canAutoApply
    ? EXECUTION_MODES
    : EXECUTION_MODES.filter((mode) => mode.id !== 'auto');
  const selectedMode =
    availableModes.find((mode) => mode.id === props.executionMode) ||
    availableModes[0];
  return (
    <div className="RootAIChat__options mx-auto mt-2.5 flex max-w-200 flex-wrap items-center justify-between gap-2">
      <Menu
        label="Execution mode"
        width={300}
        trigger={
          <Button
            type="button"
            className="RootAIChat__modePicker min-w-0"
            variant="subtle"
            size="xs"
            icon={<IconPencil />}
          >
            {selectedMode.label}
          </Button>
        }
      >
        {availableModes.map((mode) => (
          <MenuItem
            key={mode.id}
            hint={mode.id === selectedMode.id ? <IconCheck /> : undefined}
            onClick={() => props.onSelectExecutionMode(mode.id)}
          >
            <div className="RootAIChat__modePicker__option flex flex-col gap-0.5">
              <div className="RootAIChat__modePicker__option__label mb-1 font-medium">
                {mode.label}
              </div>
              <div className="RootAIChat__modePicker__option__description text-sm leading-snug text-muted">
                {mode.description}
              </div>
            </div>
          </MenuItem>
        ))}
      </Menu>
      <Menu
        label="Model"
        placement="bottom-end"
        trigger={
          <Button
            type="button"
            className="RootAIChat__modelPicker min-w-0"
            variant="subtle"
            size="xs"
            icon={<IconRobot />}
          >
            <span className="truncate">
              {props.selectedModel?.label || 'Select model'}
            </span>
          </Button>
        }
      >
        {props.models.map((model) => (
          <MenuItem
            key={model.id}
            hint={
              model.id === props.selectedModel?.id ? <IconCheck /> : undefined
            }
            onClick={() => props.onSelectModel(model.id)}
          >
            <div className="RootAIChat__modelPicker__option flex min-w-50 flex-col gap-0.5">
              <div className="RootAIChat__modelPicker__option__label font-medium">
                {model.label}
              </div>
              {model.description && (
                <div className="RootAIChat__modelPicker__option__description text-sm text-muted">
                  {model.description}
                </div>
              )}
            </div>
          </MenuItem>
        ))}
      </Menu>
    </div>
  );
}

function ChatPane(props: {
  initialChatId: string;
  initialTitle: string;
  model?: ModelInfo;
  initialMessages: UIMessage[];
  executionMode: ExecutionMode;
  canAutoApply: boolean;
  skills: SerializedAiSkillSummary[];
  models: ModelInfo[];
  selectedModel?: ModelInfo;
  docContext?: RootAIChatDocContext;
  releaseContext?: RootAIChatReleaseContext;
  prompt?: RootAIChatPrompt;
  onPromptSent: (id: string | number) => void;
  suggestedPrompts?: string[];
  onSelectModel: (id: string) => void;
  onSelectExecutionMode: (mode: ExecutionMode) => void;
  onChatPersisted: (id: string) => void;
}) {
  // Lock in the chat id for the lifetime of this mount. We generate one
  // client-side for new chats. Subsequent prop changes do NOT update this so
  // an in-flight conversation isn't disrupted when the parent learns the id
  // via `onChatPersisted`.
  const [effectiveChatId] = useState<string>(
    () => props.initialChatId || generateChatId()
  );
  const modelRef = useRef(props.model?.id);
  modelRef.current = props.model?.id;
  const executionModeRef = useRef(props.executionMode);
  executionModeRef.current = props.executionMode;
  const docContextRef = useRef(props.docContext);
  docContextRef.current = props.docContext;
  const releaseContextRef = useRef(props.releaseContext);
  releaseContextRef.current = props.releaseContext;
  const onChatPersistedRef = useRef(props.onChatPersisted);
  onChatPersistedRef.current = props.onChatPersisted;
  // The connection config + effective execution mode from the most recent
  // `ai.chat.prepare` call. Cached so we don't re-prepare every turn; reused by
  // the approval flow, tool set, persistence and title generation.
  const modelConfigRef = useRef<SerializedClientModel | null>(null);
  const effectiveModeRef = useRef<ExecutionMode>(props.executionMode);
  const titleRef = useRef<string>(props.initialTitle);
  const turnCacheRef = useRef<{key: string; config: ClientTurnConfig} | null>(
    null
  );
  // Names of the custom (plugin) write tools offered in the current turn.
  const pluginWriteToolsRef = useRef<Set<string>>(new Set());
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
      // Custom write tools can act outside the CMS (there's no draft to fall
      // back on), so they always pause for approval, even in auto mode.
      if (pluginWriteToolsRef.current.has(toolCall.toolName)) {
        const decision = await waitForApproval(
          toolCall.toolCallId,
          toolCall.toolName,
          toolCall.input,
          previewPluginWriteTool(toolCall.toolName, toolCall.input)
        );
        if (decision === 'reject') {
          return {
            success: false,
            error: 'USER_REJECTED',
            message:
              'The user rejected this tool call. Do not retry unless they ask you to.',
          };
        }
        try {
          return await executePluginTool(toolCall.toolName, toolCall.input);
        } finally {
          setPendingApprovals((prev) => {
            const next = {...prev};
            delete next[toolCall.toolCallId];
            return next;
          });
        }
      }

      const isGoogleWrite = isGoogleWriteTool(toolCall.toolName);
      if (!isGoogleWrite && !isCmsWriteTool(toolCall.toolName)) {
        return await executeCmsTool(toolCall.toolName, toolCall.input);
      }

      // Use the mode the server actually applied (it downgrades auto→approve
      // for non-publishers) so the approval flow matches the system prompt.
      const mode = effectiveModeRef.current;
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
        preview = isGoogleWrite
          ? await previewGoogleWriteTool(toolCall.toolName, toolCall.input)
          : await previewCmsWriteTool(toolCall.toolName, toolCall.input);
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

      // Google edits change files outside the CMS (there's no draft to fall
      // back on), so they always pause for approval, even in auto mode.
      if (mode === 'approve' || isGoogleWrite) {
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
              'The user rejected this change. Do not retry unless they ask for a revised version.',
          };
        }
      }

      try {
        return isGoogleWrite
          ? await executeGoogleWriteTool(toolCall.toolName, toolCall.input)
          : await executeCmsTool(toolCall.toolName, toolCall.input);
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

  // Persists the conversation to Firestore from the browser once a stream
  // finishes, generating a title on the first assistant response.
  const persistChat = useCallback(
    async (finalMessages: UIMessage[]) => {
      const model = modelConfigRef.current;
      try {
        let title = titleRef.current;
        if (!title && model) {
          const generated = await generateChatTitle(model, finalMessages);
          if (generated && generated !== 'New chat') {
            title = generated;
            titleRef.current = generated;
          }
        }
        await saveStoredChat(effectiveChatId, {
          messages: finalMessages,
          modelId: model?.id || modelRef.current,
          title: title || undefined,
        });
      } catch (err) {
        console.error('failed to persist chat history', err);
      }
      onChatPersistedRef.current(effectiveChatId);
    },
    [effectiveChatId]
  );

  // Streams directly from the browser to the provider. A non-streaming
  // `ai.chat.prepare` call supplies the system prompt + selected model's
  // connection config (cached per model/mode/doc until any short-lived
  // credentials it carries expire).
  const transport = useMemo(
    () =>
      createClientChatTransport({
        loadTurnConfig: async () => {
          const modelId = modelRef.current;
          const mode = executionModeRef.current;
          const docId = docContextRef.current?.docId;
          const releaseId = releaseContextRef.current?.releaseId;
          const key = `${modelId}|${mode}|${docId || ''}|${releaseId || ''}`;
          const cached = turnCacheRef.current;
          if (
            cached &&
            cached.key === key &&
            !testClientModelExpired(cached.config.model)
          ) {
            return cached.config;
          }
          const res = await fetch('/cms/api/ai.chat.prepare', {
            method: 'POST',
            credentials: 'include',
            headers: {'content-type': 'application/json'},
            body: JSON.stringify({
              modelId,
              executionMode: mode,
              docId,
              releaseId,
            }),
          });
          const data = await res.json();
          if (!res.ok || !data.success) {
            throw new Error(
              data.error || `ai.chat.prepare failed: ${res.status}`
            );
          }
          const config: ClientTurnConfig = {
            model: data.model,
            system: data.system,
            maxSteps: data.maxSteps,
            tools: data.tools || [],
            skills: data.skills || [],
          };
          modelConfigRef.current = data.model;
          effectiveModeRef.current = (data.executionMode ||
            mode) as ExecutionMode;
          turnCacheRef.current = {key, config};
          return config;
        },
        buildTools: (model, turn) => {
          const pluginTools = turn.tools || [];
          pluginWriteToolsRef.current = new Set(
            pluginTools.filter((t) => t.write).map((t) => t.name)
          );
          if (!model.capabilities.tools) {
            return {};
          }
          const readOnly = effectiveModeRef.current === 'read';
          const cmsTools = readOnly
            ? createReadOnlyClientCmsTools()
            : createClientCmsTools();
          // The Google read tools are offered in every execution mode, the
          // write tools in every mode but read-only (both are empty unless
          // `gapi` is configured).
          return {
            ...cmsTools,
            ...createClientGoogleTools({write: !readOnly}),
            ...createClientPluginTools(pluginTools),
          };
        },
        onFinish: persistChat,
      }),
    [persistChat]
  );

  const {
    messages,
    sendMessage,
    regenerate,
    clearError,
    status,
    error,
    stop,
    addToolOutput,
  } = useChat({
    id: effectiveChatId,
    messages: props.initialMessages,
    transport,
    // Auto-resubmit once all tool calls in the latest assistant message have
    // results. Without this, the model would stall after a tool call.
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    // Write tools execute in the browser via the signed-in user's Firebase
    // credentials (read tools run inside the streamText loop). The result is
    // fed back to the model on the next round.
    onToolCall: async ({toolCall}) => {
      const output = await resolveToolOutput(toolCall);
      addToolOutput({
        tool: toolCall.toolName as any,
        toolCallId: toolCall.toolCallId,
        output,
      });
    },
  });

  const isStreaming = status === 'streaming' || status === 'submitted';

  const send = async (text: string, attachments: AttachmentPreview[] = []) => {
    if (!text && attachments.length === 0) {
      return;
    }
    const preparedAttachments = prepareAttachmentsForSend(attachments);
    const messageText = [text, preparedAttachments.text]
      .filter(Boolean)
      .join('\n\n');
    // Grant Google access up front (while the send click still counts as
    // a user gesture) when the chat references a Drive/Docs/Sheets link
    // or already used a Google tool, so the tools have a token mid-turn.
    await maybeAuthorizeGoogle(
      [messageText, ...messages.map(getMessageText)],
      messages
    );
    sendMessage({
      text: messageText,
      files: preparedAttachments.files.map((a) => ({
        type: 'file',
        mediaType: a.mediaType,
        url: a.url,
        filename: a.filename,
      })),
    });
  };

  // Sends a prompt provided by the parent, e.g. from a "summarize" button.
  useEffect(() => {
    const prompt = props.prompt;
    if (!prompt || !props.model || isStreaming) {
      return;
    }
    props.onPromptSent(prompt.id);
    send(prompt.text);
  }, [props.prompt?.id, props.model?.id, isStreaming]);

  return (
    <>
      <ChatTranscript
        messages={messages}
        isStreaming={isStreaming}
        emptyMessage={!props.model ? 'Select a model to start.' : undefined}
        suggestedPrompts={props.model ? props.suggestedPrompts : undefined}
        onSelectSuggestedPrompt={(text) => send(text)}
        toolApprovals={{
          approvals: pendingApprovals,
          onApprove: approveToolCall,
          onReject: rejectToolCall,
        }}
      />
      {error && (
        <ChatErrorNotice
          className="RootAIChat__error mx-3 mb-3 shrink-0 md:mx-auto md:w-full md:max-w-200"
          error={error}
          busy={isStreaming}
          onRetry={() => regenerate()}
          onDismiss={clearError}
        />
      )}
      <ChatComposer
        disabled={!props.model}
        canAttach={props.model?.capabilities.attachments ?? false}
        isStreaming={isStreaming}
        skills={props.skills}
        onStop={stop}
        controls={
          <ChatHeader
            models={props.models}
            selectedModel={props.selectedModel}
            onSelectModel={props.onSelectModel}
            executionMode={props.executionMode}
            canAutoApply={props.canAutoApply}
            onSelectExecutionMode={props.onSelectExecutionMode}
          />
        }
        onSend={send}
      />
    </>
  );
}

function ChatTranscript(props: {
  messages: UIMessage[];
  isStreaming: boolean;
  emptyMessage?: string;
  suggestedPrompts?: string[];
  onSelectSuggestedPrompt?: (text: string) => void;
  toolApprovals?: ToolApprovalControls;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [props.messages]);

  const isPanel = useIsPanel();
  const transcriptClasses = cn(
    'RootAIChat__transcript relative min-h-0 flex-1 overflow-y-auto scroll-smooth',
    isPanel ? 'px-3.5 pt-6 pb-4' : 'px-4 pt-8 pb-8 md:px-5 md:pt-18'
  );

  if (props.messages.length === 0) {
    return (
      <div
        className={cn(
          transcriptClasses,
          'RootAIChat__transcript--empty flex items-center justify-center'
        )}
        ref={ref}
      >
        <div className="RootAIChat__welcome flex flex-col items-center gap-3 text-center">
          <div className="RootAIChat__welcome__icon flex rounded-full border border-border p-2">
            <IconRobot size={36} />
          </div>
          <div
            className={cn(
              'RootAIChat__welcome__title font-bold leading-tight',
              isPanel ? 'text-xl' : 'text-2xl'
            )}
          >
            Root AI
          </div>
          <div
            className={cn(
              'RootAIChat__welcome__body max-w-120 text-muted',
              isPanel ? 'text-base' : 'text-lg'
            )}
          >
            {props.emptyMessage || 'What are we going to get done today?'}
          </div>
          {props.suggestedPrompts && props.suggestedPrompts.length > 0 && (
            <div className="RootAIChat__welcome__suggestions mt-1 flex w-full max-w-90 flex-col items-stretch gap-1.5">
              {props.suggestedPrompts.map((text) => (
                <button
                  key={text}
                  type="button"
                  className="RootAIChat__welcome__suggestion cursor-pointer appearance-none rounded-lg border border-border bg-surface px-3 py-2 text-left font-sans text-sm text-fg transition-colors hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                  onClick={() => props.onSelectSuggestedPrompt?.(text)}
                >
                  {text}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={transcriptClasses} ref={ref}>
      <div
        className={cn(
          'RootAIChat__transcript__inner mx-auto flex max-w-200 flex-col',
          isPanel ? 'gap-5' : 'gap-8'
        )}
      >
        {props.messages.map((m) => (
          <MessageView
            key={m.id}
            message={m}
            toolApprovals={props.toolApprovals}
          />
        ))}
        {props.isStreaming && (
          <div className="RootAIChat__streamingIndicator mt-2 pl-11">
            <BouncingLoader size={6} />
          </div>
        )}
      </div>
    </div>
  );
}

/** Concatenates the text parts of a message (ignores files and tool calls). */
function getMessageText(message: UIMessage): string {
  return (message.parts || [])
    .filter((part: any) => part.type === 'text' && part.text)
    .map((part: any) => part.text)
    .join('\n\n');
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

  const isPanel = useIsPanel();
  return (
    <div
      className={cn(
        'RootAIChat__message',
        `RootAIChat__message--${message.role}`,
        'group/message flex',
        isPanel ? 'gap-2.5' : 'gap-4'
      )}
    >
      <div className="RootAIChat__message__avatar flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-surface">
        {photoURL ? (
          <img
            className="size-full object-cover"
            src={photoURL}
            alt={username}
          />
        ) : (
          <IconRobot size={20} />
        )}
      </div>
      <div className="RootAIChat__message__body relative min-w-0 flex-1">
        <div className="RootAIChat__message__username font-bold leading-7">
          {username}
        </div>
        <div
          className={cn(
            'RootAIChat__message__parts mt-1 flex flex-col gap-3 text-base',
            isPanel ? 'leading-normal' : 'leading-relaxed'
          )}
        >
          {(message.parts || []).map((part, i) => (
            <PartView key={i} part={part} toolApprovals={props.toolApprovals} />
          ))}
        </div>
        <IconButton
          variant="default"
          label={copied ? 'Copied!' : 'Copy message'}
          className={cn(
            'RootAIChat__message__copy absolute top-0 right-0 text-muted transition-opacity hover:text-fg focus-visible:opacity-100 group-hover/message:opacity-100 pointer-coarse:opacity-100',
            copied ? 'opacity-100' : 'opacity-0'
          )}
          onClick={handleCopy}
        >
          {copied ? <IconCheck /> : <IconCopy />}
        </IconButton>
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
      <div className="RootAIChat__textPart whitespace-normal wrap-break-word">
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
        className="RootAIChat__sourcePart inline-block text-sm text-link wrap-anywhere"
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
      <pre className="m-0 whitespace-pre-wrap rounded-sm border border-dashed border-border bg-surface-hover p-1.5 font-mono text-sm text-muted wrap-anywhere">
        {JSON.stringify(part, null, 2)}
      </pre>
    </div>
  );
}

/**
 * A collapsible "Thinking" block for a reasoning part. Shared with the
 * "Edit with AI" chat panel.
 */
export function ReasoningPartView(props: {text: string}) {
  const [open, setOpen] = useState(false);
  if (!props.text) {
    return null;
  }
  return (
    <div className="RootAIChat__reasoning rounded-lg border border-border bg-surface-hover text-base">
      <button
        type="button"
        className="RootAIChat__reasoning__toggle group/toggle flex w-full cursor-pointer appearance-none items-center gap-1.5 border-0 bg-transparent px-3 py-2 text-left font-sans text-base font-semibold text-muted focus-visible:outline-2 focus-visible:outline-focus"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <IconChevronDown
          size={14}
          className="-rotate-90 transition-transform group-aria-expanded/toggle:rotate-0"
        />
        <span>Thinking</span>
      </button>
      {open && (
        <div className="RootAIChat__reasoning__body px-3 pb-3 text-muted wrap-break-word">
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
      <div className="RootAIChat__filePart max-w-80">
        <img
          className="block max-h-60 max-w-full rounded-lg border border-border"
          src={part.url}
          alt={part.filename || 'attachment'}
        />
      </div>
    );
  }
  return (
    <a
      className="RootAIChat__filePart RootAIChat__filePart--link inline-flex min-w-0 items-center gap-1.5 text-base text-link wrap-anywhere"
      href={part.url}
      target="_blank"
      rel="noopener noreferrer"
    >
      <IconPaperclip size={14} />
      <span>{part.filename || part.url}</span>
    </a>
  );
}

/**
 * A tool call: a header that expands to show its input, output and, for
 * writes that need a decision, the approval card. Shared with the "Edit with
 * AI" chat panel.
 */
export function ToolPartView(props: {
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
    <div className="RootAIChat__tool text-sm">
      <button
        type="button"
        className="RootAIChat__tool__header group/tool flex w-full cursor-pointer appearance-none items-center gap-1.5 border-0 bg-transparent px-0 py-1 text-left font-sans text-sm text-fg focus-visible:outline-2 focus-visible:outline-focus"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <IconChevronDown
          className="RootAIChat__tool__header__icon shrink-0 -rotate-90 transition-transform group-aria-expanded/tool:rotate-0"
          size={14}
        />
        <Badge
          className="max-w-32 shrink-0 truncate"
          variant="filled"
          size="xs"
        >
          {toolName}
        </Badge>
        <span className="RootAIChat__tool__title min-w-0 truncate font-semibold text-strong">
          {prettyToolName(toolName, part.input)}
        </span>
        <span className="RootAIChat__tool__state shrink-0 text-sm text-muted">
          {approval
            ? prettyApprovalState(approval.status)
            : prettyToolState(state)}
        </span>
      </button>
      {open && (
        <div className="RootAIChat__tool__body flex flex-col gap-2 pt-1 pb-2 pl-5">
          {approval && approvalControls && (
            <ToolApprovalCard
              approval={approval}
              onApprove={() => approvalControls.onApprove(approval.toolCallId)}
              onReject={() => approvalControls.onReject(approval.toolCallId)}
            />
          )}
          {part.output?.receipt && <ToolReceipt output={part.output} />}
          {part.input && (
            <details className={TOOL_DETAILS_CLASSES}>
              <summary className={TOOL_SUMMARY_CLASSES}>
                <IconChevronRight
                  size={14}
                  className={TOOL_JSON_ICON_CLASSES}
                />
                <span>Input</span>
              </summary>
              <pre className={TOOL_PRE_CLASSES}>
                {JSON.stringify(part.input, null, 2)}
              </pre>
            </details>
          )}
          {part.output && (
            <details className={TOOL_DETAILS_CLASSES}>
              <summary className={TOOL_SUMMARY_CLASSES}>
                <IconChevronRight
                  size={14}
                  className={TOOL_JSON_ICON_CLASSES}
                />
                <span>Output</span>
              </summary>
              <pre className={TOOL_PRE_CLASSES}>
                {JSON.stringify(part.output, null, 2)}
              </pre>
            </details>
          )}
          {part.errorText && (
            <div className="RootAIChat__tool__error font-mono text-sm text-danger wrap-anywhere">
              {part.errorText}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** The `<details>` around a tool call's input or output JSON. */
const TOOL_DETAILS_CLASSES =
  'group/details rounded-md border border-border bg-surface px-2.5 py-1.5';
const TOOL_SUMMARY_CLASSES =
  'flex cursor-pointer list-none items-center gap-1 text-sm font-semibold';
const TOOL_JSON_ICON_CLASSES =
  'RootAIChat__tool__json__icon shrink-0 transition-transform group-open/details:rotate-90';
const TOOL_PRE_CLASSES =
  'mt-1.5 mb-0 max-h-60 overflow-auto whitespace-pre-wrap font-mono text-sm wrap-break-word';

function getToolCallId(part: any): string {
  return part.toolCallId || part.id || '';
}

function ToolApprovalCard(props: {
  approval: PendingToolApproval;
  onApprove: () => void;
  onReject: () => void;
}) {
  const preview = props.approval.preview;
  const hasDiff = preview.before !== undefined && preview.after !== undefined;
  return (
    <div className="RootAIChat__approval overflow-hidden rounded-lg border border-info-line bg-surface">
      <div className="RootAIChat__approval__header flex justify-between gap-4 border-b border-border p-3">
        <div className="min-w-0">
          <div className="RootAIChat__approval__title font-bold text-strong">
            {preview.title}
          </div>
          <div className="RootAIChat__approval__summary mt-0.5 text-muted">
            {preview.summary}
          </div>
        </div>
        <Badge className="RootAIChat__approval__status self-start">
          {props.approval.status === 'executing' ? 'Applying' : 'Review'}
        </Badge>
      </div>
      {preview.details.length > 0 && (
        <DetailsList
          className="RootAIChat__approval__details"
          details={preview.details}
        />
      )}
      {hasDiff && (
        <JsDiff
          className="RootAIChat__approval__diff max-h-80 border-b border-border"
          oldCode={formatDiffValue(preview.before)}
          newCode={formatDiffValue(preview.after)}
        />
      )}
      <div className="RootAIChat__approval__actions flex flex-wrap justify-end gap-2 px-3 py-2.5">
        <Button
          variant="default"
          size="xs"
          type="button"
          className="RootAIChat__approval__button"
          disabled={props.approval.status === 'executing'}
          onClick={props.onReject}
        >
          Reject
        </Button>
        <Button
          variant="green"
          size="xs"
          type="button"
          className="RootAIChat__approval__button RootAIChat__approval__button--primary"
          disabled={props.approval.status === 'executing'}
          onClick={props.onApprove}
        >
          {preview.approveLabel || 'Approve draft edit'}
        </Button>
      </div>
    </div>
  );
}

/** Label/value pairs in an approval card or a receipt. */
function DetailsList(props: {
  className: string;
  details: Array<{label: string; value: ComponentChildren}>;
}) {
  return (
    <div
      className={cn(
        props.className,
        'flex flex-wrap gap-2 border-b border-border px-3 py-2.5'
      )}
    >
      {props.details.map((detail) => (
        <div
          key={`${detail.label}:${detail.value}`}
          className="min-w-0 flex-1 basis-45"
        >
          <span className="block text-xs font-bold uppercase text-muted">
            {detail.label}
          </span>
          <strong className="mt-0.5 block text-sm text-strong wrap-anywhere">
            {detail.value}
          </strong>
        </div>
      ))}
    </div>
  );
}

/** Diffs text (e.g. Google Doc edits) as-is, and anything else as JSON. */
function formatDiffValue(value: unknown): string {
  return typeof value === 'string' ? value : stableJsonStringify(value);
}

function ToolReceipt(props: {output: any}) {
  const receipt = props.output.receipt;
  return (
    <div className="RootAIChat__receipt overflow-hidden rounded-lg border border-success-line bg-surface">
      <div className="RootAIChat__receipt__title flex items-center gap-1.5 px-3 pt-2.5 font-bold text-success">
        <IconCheck size={14} />
        <span>{receipt.title}</span>
      </div>
      <div className="RootAIChat__receipt__summary px-3 pt-1 pb-2.5 text-fg">
        {receipt.summary}
      </div>
      {receipt.details?.length > 0 && (
        <DetailsList
          className="RootAIChat__receipt__details"
          details={receipt.details}
        />
      )}
      {receipt.adminUrl && (
        <Button
          className="RootAIChat__receipt__link mx-3 my-2.5"
          variant="default"
          size="xs"
          href={receipt.adminUrl}
          {...(/^https?:/.test(receipt.adminUrl)
            ? {target: '_blank', rel: 'noopener noreferrer'}
            : {})}
        >
          {receipt.linkLabel || 'Open document'}
        </Button>
      )}
    </div>
  );
}

function prettyApprovalState(status: PendingToolApproval['status']): string {
  return status === 'executing' ? 'applying…' : 'waiting for approval';
}

function ChatComposer(props: {
  disabled: boolean;
  canAttach: boolean;
  isStreaming: boolean;
  skills: SerializedAiSkillSummary[];
  onSend: (text: string, attachments: AttachmentPreview[]) => void;
  onStop: () => void;
  controls?: ComponentChildren;
}) {
  const [text, setText] = useState('');
  const [skillIndex, setSkillIndex] = useState(0);
  const [skillMenuDismissed, setSkillMenuDismissed] = useState(false);
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
  const isPanel = useIsPanel();

  // While the text is just `/` plus a partial name, suggest matching skills.
  const skillQuery = text.match(/^\/([a-zA-Z0-9_-]*)$/)?.[1];
  const skillMatches =
    skillQuery !== undefined && !skillMenuDismissed
      ? props.skills.filter((skill) =>
          skill.name.toLowerCase().startsWith(skillQuery.toLowerCase())
        )
      : [];
  const activeSkillIndex = Math.min(skillIndex, skillMatches.length - 1);

  const updateText = (value: string) => {
    setText(value);
    setSkillIndex(0);
    setSkillMenuDismissed(false);
  };

  const selectSkill = (skill: SerializedAiSkillSummary) => {
    updateText(`/${skill.name} `);
    textareaRef.current?.focus();
  };

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
    if (skillMatches.length > 0) {
      const count = skillMatches.length;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const step = e.key === 'ArrowDown' ? 1 : -1;
        setSkillIndex((activeSkillIndex + step + count) % count);
        return;
      }
      if ((e.key === 'Enter' && !e.shiftKey) || e.key === 'Tab') {
        e.preventDefault();
        selectSkill(skillMatches[activeSkillIndex]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setSkillMenuDismissed(true);
        return;
      }
    }
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
    <div
      className={cn(
        'RootAIChat__composer relative z-10 shrink-0 border-t border-border bg-page',
        isPanel ? 'px-3 pt-2.5 pb-3' : 'px-3 pt-3 pb-3 md:px-5 md:pb-5'
      )}
    >
      {skillMatches.length > 0 && (
        <div
          className={cn(
            'RootAIChat__skillMenu absolute bottom-full mx-auto -mb-1 max-h-60 max-w-200 overflow-y-auto rounded-xl border border-border bg-surface p-1 shadow-md',
            isPanel ? 'inset-x-3' : 'inset-x-3 md:inset-x-5'
          )}
          role="listbox"
        >
          {skillMatches.map((skill, i) => (
            <button
              key={skill.name}
              type="button"
              role="option"
              aria-selected={i === activeSkillIndex}
              className="RootAIChat__skillMenu__item flex w-full cursor-pointer appearance-none flex-col gap-0.5 rounded-lg border-0 bg-transparent px-2.5 py-1.5 text-left font-sans text-fg aria-selected:bg-surface-active"
              // Keep focus in the textarea.
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setSkillIndex(i)}
              onClick={() => selectSkill(skill)}
            >
              <span className="RootAIChat__skillMenu__name text-base font-medium">
                /{skill.name}
              </span>
              {skill.description && (
                <span className="RootAIChat__skillMenu__description text-sm text-muted">
                  {skill.description}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
      {attachments.length > 0 && (
        <div className="RootAIChat__composer__attachments mx-auto mb-2 flex max-w-200 flex-wrap gap-2">
          {attachments.map((a, i) => (
            <div
              key={i}
              className="RootAIChat__composer__attachment relative size-16 overflow-hidden rounded-lg border border-border bg-surface-hover"
            >
              {a.mediaType.startsWith('image/') ? (
                <img
                  className="size-full object-cover"
                  src={a.url}
                  alt={a.filename}
                />
              ) : (
                <span className="RootAIChat__composer__attachment__name block p-2 text-xs break-all">
                  {a.filename}
                </span>
              )}
              <button
                type="button"
                aria-label={`Remove ${a.filename}`}
                className="RootAIChat__composer__attachment__remove absolute top-0.5 right-0.5 flex size-4.5 cursor-pointer appearance-none items-center justify-center rounded-full border-0 bg-overlay p-0 text-inverse"
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
      <div className="RootAIChat__composer__row mx-auto flex max-w-200 items-end gap-2 rounded-xl border border-border bg-surface px-3 py-2 transition-shadow focus-within:border-border-strong focus-within:shadow-sm">
        <IconButton
          round
          className="RootAIChat__composer__attach"
          label={
            props.canAttach
              ? 'Attach file'
              : "Model doesn't support attachments"
          }
          disabled={!props.canAttach}
          onClick={() => fileRef.current?.click()}
        >
          {uploading ? <Spinner size="sm" /> : <IconPaperclip />}
        </IconButton>
        <input
          ref={fileRef}
          type="file"
          className="hidden"
          aria-hidden="true"
          tabIndex={-1}
          onChange={onFileChange}
        />
        <textarea
          ref={textareaRef}
          aria-label="Message"
          className={cn(
            'RootAIChat__composer__textarea max-h-60 min-w-0 flex-1 resize-none appearance-none border-0 bg-transparent px-0 py-0.5 font-sans leading-6 text-fg outline-none placeholder:text-subtle',
            isPanel ? 'text-base' : 'text-lg'
          )}
          placeholder={
            props.disabled
              ? 'Select a model…'
              : props.skills.length > 0
                ? 'Ask anything, or type / for skills…'
                : 'Ask anything…'
          }
          value={text}
          rows={1}
          autofocus
          disabled={props.disabled}
          onKeyDown={onKeyDown}
          onChange={(e) => updateText((e.target as HTMLTextAreaElement).value)}
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
          <IconButton
            className="RootAIChat__composer__button RootAIChat__composer__stopButton"
            round
            variant="primary"
            label="Stop"
            onClick={props.onStop}
          >
            <IconX />
          </IconButton>
        ) : (
          <IconButton
            className="RootAIChat__composer__button RootAIChat__composer__submitButton"
            round
            variant="primary"
            label="Send"
            disabled={
              props.disabled || uploading || (!text && attachments.length === 0)
            }
            onClick={submit}
          >
            <IconSend2 />
          </IconButton>
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
