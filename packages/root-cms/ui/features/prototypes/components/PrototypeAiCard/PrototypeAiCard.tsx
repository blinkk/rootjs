import {useChat} from '@ai-sdk/react';
import {
  IconArrowUp,
  IconCheck,
  IconChevronDown,
  IconMessagePlus,
  IconPaperclip,
  IconPlayerStop,
  IconRobot,
  IconSparkles,
  IconX,
} from '@tabler/icons-preact';
import type {UIMessage} from 'ai';
import {useCallback, useEffect, useMemo, useRef, useState} from 'preact/hooks';
import type {
  SerializedAiSkill,
  SerializedAiSkillSummary,
} from '../../../../../shared/ai/extensions.js';
import {
  createPrototypeAiTools,
  prettyPrototypeToolLabel,
  PROTOTYPE_AI_SKILLS,
} from '../../../../../shared/ai/prototype-tools.js';
import type {
  PrototypeBlock,
  PrototypeBoardBundle,
  PrototypeComponentSpec,
  PrototypeFrame,
  PrototypeProjectContext,
} from '../../../../../shared/prototypes.js';
import {Markdown} from '../../../../components/Markdown/Markdown.js';
import {useMediaQuery} from '../../../../hooks/useMediaQuery.js';
import {uploadFileToGCS} from '../../../../integrations/gcs.js';
import {Button} from '../../../../primitives/Button/Button.js';
import {Dialog} from '../../../../primitives/Dialog/Dialog.js';
import {IconButton} from '../../../../primitives/IconButton/IconButton.js';
import {Menu, MenuItem} from '../../../../primitives/Menu/Menu.js';
import {Spinner} from '../../../../primitives/Spinner/Spinner.js';
import {cn} from '../../../../utils/classes.js';
import {showErrorNotification} from '../../../../utils/notifications.js';
import {
  getChat as getStoredChat,
  saveChat as saveStoredChat,
} from '../../../ai/ai-chats.js';
import {ChatErrorNotice} from '../../../ai/components/ChatErrorNotice/ChatErrorNotice.js';
import {
  type ClientTurnConfig,
  createClientChatTransport,
} from '../../../ai/components/RootAIChat/clientChatTransport.js';
import {createReadOnlyClientCmsTools} from '../../../ai/components/RootAIChat/clientCmsTools.js';
import {
  apiGetPrototypeContext,
  apiPreparePrototypeAiTurn,
  apiSavePrototypeComponent,
  apiSavePrototypeFrame,
  apiUpdatePrototypeBoard,
} from '../../prototypes-client.js';

/** Props for the floating Root AI prototyping assistant card. */
export interface PrototypeAiCardProps {
  /** Hydrated prototype board state. */
  bundle: PrototypeBoardBundle;
  /** Active page id on the board. */
  activePageId: string;
  /** Currently selected frame id, if any. */
  selectedFrameId: string | null;
  /** Currently selected block key within `selectedFrameId`, if any. */
  selectedBlockKey: string | null;
  /** Optional external prompt queued from another UI control (e.g. Comments). */
  queuedPrompt?: {id: string | number; text: string} | null;
  /** Monotonic key incremented to focus the prompt textarea on demand. */
  focusKey?: number;
  /** Invoked once `queuedPrompt` has been dispatched into the chat session. */
  onQueuedPromptHandled?: () => void;
  /** Invoked to clear a single context selection chip (`frame` or `block`). */
  onClearContext?: (kind: 'frame' | 'block') => void;
  /** Invoked when AI creates/updates a frame so optimistic UI & selection stay in sync. */
  onFrameMutated?: (frame: PrototypeFrame) => void;
  /** Invoked when AI proposes/updates a component spec. */
  onComponentMutated?: (spec: PrototypeComponentSpec) => void;
  /** Invoked when an AI turn finishes so the board can refresh. */
  onTurnFinished?: () => void;
  /**
   * Invoked when the board's linked chat changes: with the chat id once the
   * first turn links one, or with an empty string when a new chat is started.
   */
  onChatLinked?: (chatId: string) => void;
  /** Invoked when the AI streaming/running state changes. */
  onStreamingChange?: (streaming: boolean) => void;
  /** Invoked when the user closes the floating Root AI card. */
  onClose: () => void;
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
  skills?: SerializedAiSkillSummary[];
}

interface ImageAttachment {
  url: string;
  filename: string;
  mediaType: string;
}

const SELECTED_MODEL_STORAGE_KEY = 'root-cms.ai.selectedModel';

const STARTER_PROMPTS: ReadonlyArray<string> = [
  '/explore-variants Explore 2 distinct layout directions for this page',
  '/propose-component Propose a comparison block matching our brand tokens',
  '/address-comments Address open comments on this frame',
];

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

function generateChatId(): string {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return `proto-${crypto.randomUUID()}`;
  }
  return `proto-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function guessImageMimeType(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.svg')) return 'image/svg+xml';
  return 'image/png';
}

/** Merges built-in prototyping skills with any additional server/project skills. */
function mergeSkills(
  serverSkills: SerializedAiSkill[] | undefined
): SerializedAiSkill[] {
  const byName = new Map<string, SerializedAiSkill>();
  for (const skill of PROTOTYPE_AI_SKILLS) {
    byName.set(skill.name, skill);
  }
  for (const skill of serverSkills || []) {
    if (!byName.has(skill.name)) {
      byName.set(skill.name, skill);
    }
  }
  return Array.from(byName.values());
}

/** Merges built-in prototyping skill summaries with project skill summaries for autocomplete. */
function mergeSkillSummaries(
  serverSummaries: SerializedAiSkillSummary[] | undefined
): SerializedAiSkillSummary[] {
  const byName = new Map<string, SerializedAiSkillSummary>();
  for (const skill of PROTOTYPE_AI_SKILLS) {
    byName.set(skill.name, {
      name: skill.name,
      description: skill.description,
    });
  }
  for (const skill of serverSummaries || []) {
    if (!byName.has(skill.name)) {
      byName.set(skill.name, skill);
    }
  }
  return Array.from(byName.values());
}

/**
 * Floating right-hand Root AI card for prototyping boards (`/cms/prototypes/:boardId`).
 * Renders as a floating panel on `md+` screens and inside a native `<Dialog>`
 * bottom sheet on narrow mobile viewports (`<768px`).
 */
export function PrototypeAiCard(props: PrototypeAiCardProps) {
  const isDesktop = useMediaQuery('(width >= 48rem)');
  const [config, setConfig] = useState<AiConfigResponse | null>(() => {
    const ctxAi =
      typeof window !== 'undefined' ? window.__ROOT_CTX?.ai : undefined;
    if (ctxAi && Array.isArray(ctxAi.models) && ctxAi.models.length > 0) {
      return {
        enabled: true,
        defaultModel: ctxAi.defaultModel,
        models: ctxAi.models,
        skills: [],
      };
    }
    return null;
  });
  const [configError, setConfigError] = useState('');
  const [initialMessages, setInitialMessages] = useState<UIMessage[] | null>(
    null
  );
  const [selectedModelId, setSelectedModelId] = useState(() => {
    const ctxAi =
      typeof window !== 'undefined' ? window.__ROOT_CTX?.ai : undefined;
    const models = ctxAi?.models || [];
    if (models.length === 0) {
      return '';
    }
    return (
      readStoredSelectedModel(models) ||
      ctxAi?.defaultModel ||
      models[0]?.id ||
      ''
    );
  });

  // Load AI model configuration once on mount.
  useEffect(() => {
    let active = true;
    fetch('/cms/api/ai.config', {credentials: 'include'})
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`ai.config returned ${res.status}`);
        }
        const data = (await res.json()) as AiConfigResponse;
        if (!active) {
          return;
        }
        setConfig(data);
        const models = data.models || [];
        setSelectedModelId((current) => {
          if (current && models.some((m) => m.id === current)) {
            return current;
          }
          return (
            readStoredSelectedModel(models) ||
            data.defaultModel ||
            models[0]?.id ||
            ''
          );
        });
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

  // The chat this card opened with. It is read once per mount: the session
  // links a new chat to the board after its first turn, and re-keying on that
  // would remount the conversation mid-flight.
  const [initialChatId, setInitialChatId] = useState(
    () => props.bundle.board.aiChatId || ''
  );
  // Incremented by "New chat" to start a fresh session.
  const [sessionNonce, setSessionNonce] = useState(0);
  const [streaming, setStreaming] = useState(false);
  const boardAiChatId = initialChatId;

  // Load persisted chat history for the board when `aiChatId` is linked.
  useEffect(() => {
    let active = true;
    if (!boardAiChatId) {
      setInitialMessages([]);
      return () => {
        active = false;
      };
    }
    setInitialMessages(null);
    getStoredChat(boardAiChatId)
      .then((stored) => {
        if (!active) {
          return;
        }
        setInitialMessages(stored?.messages || []);
        if (stored?.modelId) {
          setSelectedModelId((prev) => prev || stored.modelId || '');
        }
      })
      .catch((err) => {
        console.error('failed to load prototype AI chat history', err);
        if (active) {
          setInitialMessages([]);
        }
      });
    return () => {
      active = false;
    };
  }, [boardAiChatId]);

  const models = config?.models || [];
  const selectedModel =
    models.find((m) => m.id === selectedModelId) || models[0];
  const isEnabled = Boolean(config?.enabled) && models.length > 0;
  const skills = useMemo(
    () => mergeSkillSummaries(config?.skills),
    [config?.skills]
  );

  const selectedFrame = useMemo(
    () =>
      props.selectedFrameId
        ? props.bundle.frames.find((f) => f.id === props.selectedFrameId) ||
          null
        : null,
    [props.bundle.frames, props.selectedFrameId]
  );

  const selectedBlock = useMemo<PrototypeBlock | null>(() => {
    if (!selectedFrame || !props.selectedBlockKey) {
      return null;
    }
    const entry = selectedFrame.blocks?.[props.selectedBlockKey];
    if (entry && !Array.isArray(entry) && typeof entry === 'object') {
      return entry as PrototypeBlock;
    }
    return null;
  }, [selectedFrame, props.selectedBlockKey]);

  const subtitle = selectedFrame
    ? `Editing ${selectedFrame.title}`
    : `Editing ${props.bundle.board.title}`;

  // Starts an empty conversation. The previous chat stays stored but is
  // unlinked from the board, so reopening the panel no longer restores it.
  const handleNewChat = async () => {
    try {
      await apiUpdatePrototypeBoard({
        boardId: props.bundle.board.id,
        aiChatId: '',
      });
    } catch (err) {
      showErrorNotification(err, {title: 'Failed to start a new chat'});
      return;
    }
    props.onChatLinked?.('');
    setInitialChatId('');
    setInitialMessages([]);
    setSessionNonce((nonce) => nonce + 1);
  };

  const sessionProps: PrototypeAiCardProps = {
    ...props,
    onStreamingChange: (value) => {
      setStreaming(value);
      props.onStreamingChange?.(value);
    },
  };

  const handleSelectModel = (modelId: string) => {
    setSelectedModelId(modelId);
    persistSelectedModel(modelId);
  };

  const cardBody = (
    <>
      <div className="PrototypeAiCard__header flex shrink-0 items-center justify-between gap-2 border-b border-border bg-surface px-3.5 py-2.5">
        <div className="PrototypeAiCard__heading min-w-0 flex-1">
          <div className="PrototypeAiCard__title flex items-center gap-1.5 text-sm font-semibold leading-tight text-strong">
            <IconRobot size={15} className="shrink-0" aria-hidden="true" />
            <span>Root AI</span>
          </div>
          <div
            className="PrototypeAiCard__subtitle mt-0.5 truncate text-xs text-muted"
            title={subtitle}
          >
            {subtitle}
          </div>
        </div>
        <div className="PrototypeAiCard__headerActions flex shrink-0 items-center gap-1">
          <IconButton
            size="xs"
            label="New chat"
            tooltip={isDesktop}
            disabled={streaming || !isEnabled}
            onClick={handleNewChat}
          >
            <IconMessagePlus />
          </IconButton>
          <IconButton
            size="xs"
            label="Close Root AI"
            tooltip={isDesktop}
            onClick={props.onClose}
          >
            <IconX />
          </IconButton>
        </div>
      </div>

      {(!config && !configError) || initialMessages === null ? (
        <div className="PrototypeAiCard__loading flex min-h-40 flex-1 items-center justify-center text-muted">
          <Spinner size="md" />
        </div>
      ) : !isEnabled ? (
        <NotConfiguredNotice error={configError} />
      ) : (
        <PrototypeAiChatSession
          key={`${props.bundle.board.id}:${sessionNonce}`}
          props={sessionProps}
          initialChatId={boardAiChatId}
          initialMessages={initialMessages}
          models={models}
          selectedModel={selectedModel}
          onSelectModel={handleSelectModel}
          selectedFrame={selectedFrame}
          selectedBlock={selectedBlock}
          skills={skills}
        />
      )}
    </>
  );

  if (!isDesktop) {
    return (
      <Dialog
        open
        onClose={props.onClose}
        withCloseButton={false}
        size="full"
        aria-label="Root AI"
        className="PrototypeAiCard__dialog"
        classNames={{
          panel: 'h-full overflow-hidden',
          body: 'flex min-h-0 flex-1 flex-col overflow-hidden p-0 pt-0',
        }}
      >
        <div className="PrototypeAiCard PrototypeAiCard--mobile flex min-h-0 flex-1 flex-col bg-surface">
          {cardBody}
        </div>
      </Dialog>
    );
  }

  return (
    <aside
      aria-label="Root AI"
      className="PrototypeAiCard absolute top-14 right-3 bottom-3 z-20 flex w-92 max-w-[calc(100%-1.5rem)] flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-lg"
    >
      {cardBody}
    </aside>
  );
}

function NotConfiguredNotice(props: {error?: string}) {
  return (
    <div className="PrototypeAiCard__notEnabled flex flex-1 flex-col items-center justify-center gap-2.5 px-6 py-8 text-center">
      <div className="flex size-10 items-center justify-center rounded-full border border-border bg-page text-muted">
        <IconRobot size={20} />
      </div>
      <div className="text-sm font-semibold text-strong">
        Root AI is not configured
      </div>
      <p className="m-0 text-xs leading-normal text-muted">
        Add an{' '}
        <code className="rounded-sm bg-surface-subtle px-1 font-mono">
          ai.models
        </code>{' '}
        entry to{' '}
        <code className="rounded-sm bg-surface-subtle px-1 font-mono">
          cmsPlugin()
        </code>{' '}
        in{' '}
        <code className="rounded-sm bg-surface-subtle px-1 font-mono">
          root.config.ts
        </code>
        .
      </p>
      {props.error && (
        <pre className="mt-1 max-w-full overflow-auto rounded-md border border-danger-line bg-danger-soft px-2.5 py-1.5 font-mono text-xs text-danger">
          {props.error}
        </pre>
      )}
    </div>
  );
}

interface PrototypeAiChatSessionProps {
  props: PrototypeAiCardProps;
  initialChatId: string;
  initialMessages: UIMessage[];
  models: ModelInfo[];
  selectedModel?: ModelInfo;
  onSelectModel: (modelId: string) => void;
  selectedFrame: PrototypeFrame | null;
  selectedBlock: PrototypeBlock | null;
  skills: SerializedAiSkillSummary[];
}

function PrototypeAiChatSession({
  props,
  initialChatId,
  initialMessages,
  models,
  selectedModel,
  onSelectModel,
  selectedFrame,
  selectedBlock,
  skills,
}: PrototypeAiChatSessionProps) {
  const [chatId] = useState(() => initialChatId || generateChatId());
  const linkedChatIdRef = useRef<string>(initialChatId);
  const propsRef = useRef(props);
  propsRef.current = props;
  const selectedModelRef = useRef(selectedModel);
  selectedModelRef.current = selectedModel;

  // Keep a mutable live view of frames and components so multi-step tool calls
  // within a single turn always see mutations from previous steps immediately
  // without being overwritten by intermediate chat-stream re-renders.
  const liveFramesRef = useRef<PrototypeFrame[]>(props.bundle.frames);
  useEffect(() => {
    const incomingById = new Map<string, PrototypeFrame>();
    for (const frame of props.bundle.frames) {
      incomingById.set(frame.id, frame);
    }
    for (const prev of liveFramesRef.current) {
      const incoming = incomingById.get(prev.id);
      if (incoming && (prev.updatedAt || 0) > (incoming.updatedAt || 0)) {
        incomingById.set(prev.id, prev);
      }
    }
    liveFramesRef.current = Array.from(incomingById.values());
  }, [props.bundle.frames]);

  const liveComponentsRef = useRef<Record<string, PrototypeComponentSpec>>(
    props.bundle.components
  );
  useEffect(() => {
    const next: Record<string, PrototypeComponentSpec> = {
      ...props.bundle.components,
    };
    for (const [name, prev] of Object.entries(liveComponentsRef.current)) {
      const incoming = next[name];
      if (incoming && (prev.updatedAt || 0) > (incoming.updatedAt || 0)) {
        next[name] = prev;
      }
    }
    liveComponentsRef.current = next;
  }, [props.bundle.components]);

  const projectContextCacheRef = useRef<PrototypeProjectContext | null>(null);
  const handledQueuedPromptIdRef = useRef<string | number | null>(null);

  const handleTurnFinish = useCallback(
    async (finalMessages: UIMessage[]) => {
      const currentProps = propsRef.current;
      const boardId = currentProps.bundle.board.id;

      // Link the chat to the board first, so the refresh below (and a panel
      // that is closed and reopened) sees it and restores this conversation.
      try {
        if (!linkedChatIdRef.current) {
          await apiUpdatePrototypeBoard({boardId, aiChatId: chatId});
          linkedChatIdRef.current = chatId;
          currentProps.onChatLinked?.(chatId);
        }
      } catch (err) {
        console.error('failed to link prototype AI chat', err);
      }

      // Refresh the board so it reflects everything the AI changed this turn.
      currentProps.onTurnFinished?.();

      // Persist conversation history to Firestore.
      try {
        await saveStoredChat(chatId, {
          messages: finalMessages,
          modelId: selectedModelRef.current?.id,
          title: currentProps.bundle.board.title,
        });
      } catch (err) {
        console.error('failed to persist prototype AI chat', err);
      }
    },
    [chatId]
  );

  const transport = useMemo(
    () =>
      createClientChatTransport({
        loadTurnConfig: async (): Promise<ClientTurnConfig> => {
          const currentProps = propsRef.current;
          const config = await apiPreparePrototypeAiTurn({
            boardId: currentProps.bundle.board.id,
            modelId: selectedModelRef.current?.id,
            selectedFrameId: currentProps.selectedFrameId,
            selectedBlockKey: currentProps.selectedBlockKey,
          });
          return {
            ...config,
            skills: mergeSkills(config.skills),
          };
        },
        buildTools: (model) => {
          if (!model.capabilities.tools) {
            return {};
          }
          return {
            ...createReadOnlyClientCmsTools(),
            ...createPrototypeAiTools({
              getState: () => {
                const currentProps = propsRef.current;
                return {
                  board: currentProps.bundle.board,
                  activePageId: currentProps.activePageId,
                  selectedFrameId: currentProps.selectedFrameId,
                  selectedBlockKey: currentProps.selectedBlockKey,
                  frames: liveFramesRef.current,
                  components: liveComponentsRef.current,
                  comments: currentProps.bundle.comments,
                };
              },
              getProjectContext: async (options) => {
                if (!options?.componentNames?.length) {
                  if (projectContextCacheRef.current) {
                    return projectContextCacheRef.current;
                  }
                  const ctx = await apiGetPrototypeContext();
                  projectContextCacheRef.current = ctx;
                  return ctx;
                }
                return apiGetPrototypeContext(options);
              },
              saveFrame: async (frame) => {
                const currentProps = propsRef.current;
                const saved = await apiSavePrototypeFrame({
                  boardId: currentProps.bundle.board.id,
                  frame,
                });
                const existingIdx = liveFramesRef.current.findIndex(
                  (f) => f.id === saved.id
                );
                if (existingIdx >= 0) {
                  const next = [...liveFramesRef.current];
                  next[existingIdx] = saved;
                  liveFramesRef.current = next;
                } else {
                  liveFramesRef.current = [...liveFramesRef.current, saved];
                }
                currentProps.onFrameMutated?.(saved);
                return saved;
              },
              saveComponent: async (spec) => {
                const currentProps = propsRef.current;
                const saved = await apiSavePrototypeComponent({
                  boardId: currentProps.bundle.board.id,
                  spec,
                });
                liveComponentsRef.current = {
                  ...liveComponentsRef.current,
                  [saved.name]: saved,
                };
                currentProps.onComponentMutated?.(saved);
                return saved;
              },
            }),
          };
        },
        onFinish: handleTurnFinish,
      }),
    [handleTurnFinish]
  );

  const {messages, sendMessage, regenerate, clearError, status, error, stop} =
    useChat({
      id: chatId,
      messages: initialMessages,
      transport,
    });

  const isStreaming = status === 'streaming' || status === 'submitted';

  useEffect(() => {
    propsRef.current.onStreamingChange?.(isStreaming);
  }, [isStreaming]);

  useEffect(() => {
    return () => {
      propsRef.current.onStreamingChange?.(false);
    };
  }, []);

  const send = useCallback(
    (text: string, attachments: ImageAttachment[] = []) => {
      const trimmed = text.trim();
      if (!trimmed && attachments.length === 0) {
        return;
      }
      sendMessage({
        text: trimmed,
        files: attachments.map((attachment) => ({
          type: 'file',
          mediaType: attachment.mediaType,
          url: attachment.url,
          filename: attachment.filename,
        })),
      });
    },
    [sendMessage]
  );

  // Auto-submit external prompts queued from Comments or New Prototype modal.
  useEffect(() => {
    const queued = props.queuedPrompt;
    if (!queued || !selectedModel || isStreaming) {
      return;
    }
    if (handledQueuedPromptIdRef.current === queued.id) {
      return;
    }
    const text = queued.text.trim();
    if (!text) {
      return;
    }
    handledQueuedPromptIdRef.current = queued.id;
    send(text);
    propsRef.current.onQueuedPromptHandled?.();
  }, [
    props.queuedPrompt?.id,
    props.queuedPrompt?.text,
    selectedModel?.id,
    isStreaming,
    send,
  ]);

  return (
    <>
      <ConversationStream
        messages={messages}
        isStreaming={isStreaming}
        onSelectStarterPrompt={(prompt) => send(prompt)}
      />

      {error && (
        <ChatErrorNotice
          className="PrototypeAiCard__error mx-3 mb-2 shrink-0 px-3 py-2 text-xs"
          error={error}
          busy={isStreaming}
          onRetry={() => regenerate()}
          onDismiss={clearError}
        />
      )}

      <ComposerFooter
        disabled={!selectedModel}
        canAttach={Boolean(selectedModel?.capabilities.attachments)}
        isStreaming={isStreaming}
        focusKey={props.focusKey}
        models={models}
        selectedModel={selectedModel}
        onSelectModel={onSelectModel}
        skills={skills}
        selectedFrame={selectedFrame}
        selectedBlock={selectedBlock}
        onClearContext={props.onClearContext}
        onSend={send}
        onStop={stop}
      />
    </>
  );
}

interface ConversationStreamProps {
  messages: UIMessage[];
  isStreaming: boolean;
  onSelectStarterPrompt: (prompt: string) => void;
}

function ConversationStream(props: ConversationStreamProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [props.messages, props.isStreaming]);

  if (props.messages.length === 0) {
    return (
      <div
        ref={scrollRef}
        className="PrototypeAiCard__stream PrototypeAiCard__stream--empty flex min-h-0 flex-1 flex-col justify-center gap-3 overflow-y-auto px-4 py-6"
      >
        <div className="flex flex-col items-center gap-1.5 text-center">
          <div className="flex size-9 items-center justify-center rounded-full border border-border bg-page text-strong">
            <IconSparkles size={18} />
          </div>
          <div className="text-sm font-semibold text-strong">
            Design with Root AI
          </div>
          <p className="m-0 max-w-72 text-xs leading-relaxed text-muted">
            Generate side-by-side layout variants, refine selected blocks, or
            address open comments using your site components and brand tokens.
          </p>
        </div>
        <div className="PrototypeAiCard__starters flex flex-col gap-1.5">
          {STARTER_PROMPTS.map((prompt) => (
            <button
              key={prompt}
              type="button"
              className="PrototypeAiCard__starter cursor-pointer appearance-none rounded-md border border-border bg-page px-2.5 py-2 text-left font-sans text-xs text-fg transition-colors hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
              onClick={() => props.onSelectStarterPrompt(prompt)}
            >
              {prompt}
            </button>
          ))}
        </div>
      </div>
    );
  }

  const lastMessage = props.messages[props.messages.length - 1];
  const lastHasVisibleStreamingPart =
    lastMessage?.role === 'assistant' &&
    (lastMessage.parts || []).some((part: any) => {
      if (part.type === 'text' && part.text) {
        return true;
      }
      const isTool =
        (typeof part.type === 'string' && part.type.startsWith('tool-')) ||
        part.type === 'dynamic-tool';
      return (
        isTool &&
        (part.state === 'input-streaming' || part.state === 'input-available')
      );
    });

  return (
    <div
      ref={scrollRef}
      className="PrototypeAiCard__stream flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3.5 py-3"
    >
      {props.messages.map((message) => (
        <MessageBubble key={message.id} message={message} />
      ))}
      {props.isStreaming && !lastHasVisibleStreamingPart && (
        <div
          className="PrototypeAiCard__toolStatus flex items-center gap-2 text-xs text-muted"
          role="status"
          aria-live="polite"
        >
          <span
            className="PrototypeAiCard__toolDot size-1.5 shrink-0 animate-pulse rounded-full bg-info"
            aria-hidden="true"
          />
          <span>Thinking…</span>
        </div>
      )}
    </div>
  );
}

function MessageBubble(props: {message: UIMessage}) {
  const {message} = props;
  const parts = (message.parts || []) as any[];

  if (message.role === 'user') {
    const fileParts = parts.filter(
      (part) => part.type === 'file' && part.mediaType?.startsWith('image/')
    );
    const textParts = parts
      .filter((part) => part.type === 'text' && part.text)
      .map((part) => part.text as string);

    return (
      <div className="PrototypeAiCard__userRow flex justify-end">
        <div className="PrototypeAiCard__userBubble ml-8 flex flex-col gap-2 rounded-lg bg-surface-subtle px-3 py-2 text-sm leading-snug text-fg wrap-break-word">
          {fileParts.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {fileParts.map((part, i) => (
                <img
                  key={i}
                  src={part.url}
                  alt={part.filename || 'Attached wireframe'}
                  className="block max-h-36 max-w-full rounded-md border border-border object-cover"
                />
              ))}
            </div>
          )}
          {textParts.length > 0 && (
            <div className="whitespace-pre-wrap">{textParts.join('\n\n')}</div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="PrototypeAiCard__assistantRow flex flex-col gap-2">
      {parts.map((part, index) => (
        <AssistantPart key={index} part={part} />
      ))}
    </div>
  );
}

function AssistantPart(props: {part: any}) {
  const {part} = props;
  const [reasoningOpen, setReasoningOpen] = useState(false);

  if (part.type === 'text' && part.text) {
    return (
      <div className="PrototypeAiCard__assistantText min-w-0 text-sm leading-relaxed text-fg wrap-break-word">
        <Markdown code={part.text} />
      </div>
    );
  }

  if (part.type === 'reasoning' && part.text) {
    return (
      <div className="PrototypeAiCard__reasoning rounded-md border border-border bg-page text-xs">
        <button
          type="button"
          className="flex w-full cursor-pointer appearance-none items-center gap-1 border-0 bg-transparent px-2.5 py-1.5 text-left font-sans text-xs font-medium text-muted focus-visible:outline-2 focus-visible:outline-focus"
          aria-expanded={reasoningOpen}
          onClick={() => setReasoningOpen((open) => !open)}
        >
          <IconChevronDown
            size={12}
            className={cn(
              'shrink-0 transition-transform',
              !reasoningOpen && '-rotate-90'
            )}
          />
          <span>Thinking</span>
        </button>
        {reasoningOpen && (
          <div className="px-2.5 pb-2 text-muted wrap-break-word">
            <Markdown code={part.text} />
          </div>
        )}
      </div>
    );
  }

  const isTool =
    (typeof part.type === 'string' && part.type.startsWith('tool-')) ||
    part.type === 'dynamic-tool';
  if (isTool) {
    const toolName: string =
      typeof part.type === 'string' && part.type.startsWith('tool-')
        ? part.type.slice('tool-'.length)
        : part.toolName || 'tool';
    const state: string = part.state || '';
    if (state === 'input-streaming' || state === 'input-available') {
      return (
        <div
          className="PrototypeAiCard__toolStatus flex items-center gap-2 text-xs text-muted"
          role="status"
          aria-live="polite"
        >
          <span
            className="PrototypeAiCard__toolDot size-1.5 shrink-0 animate-pulse rounded-full bg-info"
            aria-hidden="true"
          />
          <span className="truncate">
            {prettyPrototypeToolLabel(toolName, part.input)}
          </span>
        </div>
      );
    }
    if (state === 'output-error' && part.errorText) {
      return (
        <div className="PrototypeAiCard__toolError rounded-md border border-danger-line bg-danger-soft px-2.5 py-1.5 text-xs text-danger">
          {part.errorText}
        </div>
      );
    }
  }

  return null;
}

interface ComposerFooterProps {
  disabled: boolean;
  canAttach: boolean;
  isStreaming: boolean;
  focusKey?: number;
  models: ModelInfo[];
  selectedModel?: ModelInfo;
  onSelectModel: (modelId: string) => void;
  skills: SerializedAiSkillSummary[];
  selectedFrame: PrototypeFrame | null;
  selectedBlock: PrototypeBlock | null;
  onClearContext?: (kind: 'frame' | 'block') => void;
  onSend: (text: string, attachments: ImageAttachment[]) => void;
  onStop: () => void;
}

function ComposerFooter(props: ComposerFooterProps) {
  const [text, setText] = useState('');
  const [skillIndex, setSkillIndex] = useState(0);
  const [skillMenuDismissed, setSkillMenuDismissed] = useState(false);
  const [attachments, setAttachments] = useState<ImageAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!props.focusKey || props.disabled) {
      return;
    }
    window.requestAnimationFrame(() => {
      textareaRef.current?.focus();
    });
  }, [props.focusKey, props.disabled]);

  useEffect(() => {
    window.requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) {
        return;
      }
      el.style.height = 'auto';
      el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
    });
  }, [text]);

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

  const selectSkill = (skillName: string) => {
    updateText(`/${skillName} `);
    setSkillMenuDismissed(true);
    textareaRef.current?.focus();
  };

  const submit = () => {
    if (props.disabled || props.isStreaming || uploading) {
      return;
    }
    if (!text.trim() && attachments.length === 0) {
      return;
    }
    props.onSend(text, attachments);
    setText('');
    setAttachments([]);
    if (fileRef.current) {
      fileRef.current.value = '';
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
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
        selectSkill(skillMatches[activeSkillIndex].name);
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

  const uploadImage = async (file: File) => {
    setUploading(true);
    try {
      const mediaType = file.type || guessImageMimeType(file.name);
      const data: any = await uploadFileToGCS(file, {disableGci: true});
      setAttachments((prev) => [
        ...prev,
        {
          url: data.src,
          filename: data.filename || file.name,
          mediaType,
        },
      ]);
    } catch (err) {
      showErrorNotification(err, {title: 'Attachment upload failed'});
    } finally {
      setUploading(false);
      if (fileRef.current) {
        fileRef.current.value = '';
      }
    }
  };

  const handleFileChange = (e: Event) => {
    const input = e.target as HTMLInputElement;
    const files = Array.from(input.files || []);
    files.forEach(uploadImage);
  };

  const blockChipLabel = props.selectedBlock
    ? props.selectedBlock.proposed
      ? `Proposed · ${props.selectedBlock.label}`
      : props.selectedBlock.label
    : null;

  const hasContextChips = Boolean(blockChipLabel || props.selectedFrame);

  return (
    <div className="PrototypeAiCard__composer relative shrink-0 border-t border-border bg-surface px-3 pt-2.5 pb-3">
      {skillMatches.length > 0 && (
        <div
          className="PrototypeAiCard__skillMenu absolute inset-x-3 bottom-full z-(--cms-z-dropdown) mb-1 max-h-56 overflow-y-auto rounded-lg border border-border bg-surface-raised p-1 shadow-md"
          role="listbox"
          aria-label="AI skills"
        >
          {skillMatches.map((skill, index) => (
            <button
              key={skill.name}
              type="button"
              role="option"
              aria-selected={index === activeSkillIndex}
              className="PrototypeAiCard__skillOption flex w-full cursor-pointer appearance-none flex-col gap-0.5 rounded-md border-0 bg-transparent px-2.5 py-1.5 text-left font-sans text-fg aria-selected:bg-surface-active"
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setSkillIndex(index)}
              onClick={() => selectSkill(skill.name)}
            >
              <span className="text-sm font-medium text-strong">
                /{skill.name}
              </span>
              {skill.description && (
                <span className="text-xs leading-snug text-muted">
                  {skill.description}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {hasContextChips && (
        <div className="PrototypeAiCard__context mb-2 flex flex-wrap items-center gap-1.5">
          <span className="PrototypeAiCard__contextLabel shrink-0 text-xs font-medium text-muted">
            Context
          </span>
          {blockChipLabel && (
            <span
              className={cn(
                'PrototypeAiCard__contextChip inline-flex max-w-full items-center gap-1 rounded-sm border px-1.5 py-0.5 text-xs font-medium',
                props.selectedBlock?.proposed
                  ? 'border-violet/30 bg-violet-soft text-violet-strong'
                  : 'border-border bg-chip text-fg'
              )}
            >
              <span className="truncate">{blockChipLabel}</span>
              {props.onClearContext && (
                <button
                  type="button"
                  aria-label={`Remove ${blockChipLabel} from context`}
                  className="inline-flex size-3.5 shrink-0 cursor-pointer appearance-none items-center justify-center rounded-sm border-0 bg-transparent p-0 text-current opacity-70 hover:opacity-100 focus-visible:outline-2 focus-visible:outline-focus"
                  onClick={() => props.onClearContext?.('block')}
                >
                  <IconX size={11} />
                </button>
              )}
            </span>
          )}
          {props.selectedFrame && (
            <span className="PrototypeAiCard__contextChip inline-flex max-w-full items-center gap-1 rounded-sm border border-border bg-chip px-1.5 py-0.5 text-xs font-medium text-fg">
              <span className="truncate">{props.selectedFrame.title}</span>
              {props.onClearContext && (
                <button
                  type="button"
                  aria-label={`Remove ${props.selectedFrame.title} from context`}
                  className="inline-flex size-3.5 shrink-0 cursor-pointer appearance-none items-center justify-center rounded-sm border-0 bg-transparent p-0 text-muted hover:text-fg focus-visible:outline-2 focus-visible:outline-focus"
                  onClick={() => props.onClearContext?.('frame')}
                >
                  <IconX size={11} />
                </button>
              )}
            </span>
          )}
        </div>
      )}

      {attachments.length > 0 && (
        <div className="PrototypeAiCard__attachments mb-2 flex flex-wrap gap-1.5">
          {attachments.map((attachment, i) => (
            <div
              key={`${attachment.url}-${i}`}
              className="PrototypeAiCard__attachment relative size-14 overflow-hidden rounded-md border border-border bg-surface-hover"
            >
              <img
                src={attachment.url}
                alt={attachment.filename}
                className="size-full object-cover"
              />
              <button
                type="button"
                aria-label={`Remove ${attachment.filename}`}
                className="absolute top-0.5 right-0.5 flex size-4 cursor-pointer appearance-none items-center justify-center rounded-full border-0 bg-overlay p-0 text-inverse"
                onClick={() =>
                  setAttachments((prev) => prev.filter((_, idx) => idx !== i))
                }
              >
                <IconX size={10} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="PrototypeAiCard__inputBox rounded-lg border border-input-border bg-surface p-2 transition-shadow focus-within:border-border-strong focus-within:shadow-xs">
        <textarea
          ref={textareaRef}
          aria-label="Prompt Root AI"
          className="PrototypeAiCard__textarea block max-h-36 w-full resize-none appearance-none border-0 bg-transparent p-0 font-sans text-sm leading-snug text-input-fg outline-none placeholder:text-input-placeholder"
          placeholder="Describe a change, or type / for skills"
          rows={2}
          value={text}
          disabled={props.disabled}
          onKeyDown={handleKeyDown}
          onChange={(e) => updateText((e.target as HTMLTextAreaElement).value)}
          onPaste={(e) => {
            if (!props.canAttach) {
              return;
            }
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
        />

        <div className="PrototypeAiCard__composerBar mt-2 flex items-center justify-between gap-2">
          <div className="PrototypeAiCard__quickActions flex min-w-0 flex-1 items-center gap-1">
            {props.canAttach && (
              <>
                <IconButton
                  size="xs"
                  label="Attach wireframe or screenshot"
                  disabled={props.disabled || uploading}
                  onClick={() => fileRef.current?.click()}
                >
                  {uploading ? <Spinner size="sm" /> : <IconPaperclip />}
                </IconButton>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  aria-hidden="true"
                  tabIndex={-1}
                  onChange={handleFileChange}
                />
              </>
            )}
            {props.models.length > 0 && (
              <Menu
                label="Select AI model"
                placement="top-start"
                trigger={
                  <Button
                    type="button"
                    variant="subtle"
                    size="xs"
                    className="PrototypeAiCard__modelPicker min-w-0 max-w-44 text-xs font-medium text-muted"
                    iconRight={<IconChevronDown />}
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
                      model.id === props.selectedModel?.id ? (
                        <IconCheck />
                      ) : undefined
                    }
                    onClick={() => props.onSelectModel(model.id)}
                  >
                    <div className="PrototypeAiCard__modelOption flex min-w-44 flex-col gap-0.5">
                      <div className="text-sm font-medium text-fg">
                        {model.label}
                      </div>
                      {model.description && (
                        <div className="text-xs text-muted">
                          {model.description}
                        </div>
                      )}
                    </div>
                  </MenuItem>
                ))}
              </Menu>
            )}
          </div>

          {props.isStreaming ? (
            <IconButton
              className="PrototypeAiCard__stopButton shrink-0"
              variant="subtle"
              size="xs"
              label="Stop generating"
              onClick={props.onStop}
            >
              <IconPlayerStop />
            </IconButton>
          ) : (
            <IconButton
              className="PrototypeAiCard__sendButton shrink-0"
              variant="primary"
              size="xs"
              label="Send prompt"
              disabled={
                props.disabled ||
                uploading ||
                (!text.trim() && attachments.length === 0)
              }
              onClick={submit}
            >
              <IconArrowUp />
            </IconButton>
          )}
        </div>
      </div>
    </div>
  );
}
