/**
 * Chat panel used inside the array-item "Edit with AI" modal. Built on top of
 * the Vercel AI SDK (`ai`, `@ai-sdk/react`) and streams responses DIRECTLY
 * from the browser to the model provider (see `createClientChatTransport`).
 * The non-streaming `/cms/api/ai.edit.prepare` endpoint supplies the system
 * prompt (with the JSON being edited) and the selected model's connection
 * config.
 *
 * Only a READ-ONLY tool subset is exposed — the model can inspect CMS docs and
 * schemas for context but cannot mutate Firestore. Edits are proposed as a
 * fenced ```json code block in the assistant's message; this component extracts
 * it and forwards it to the modal so it can populate the diff viewer for the
 * user to approve and save.
 */
import {useChat} from '@ai-sdk/react';
import {IconPaperclip, IconRobot, IconSend2, IconX} from '@tabler/icons-preact';
import type {UIMessage} from 'ai';
import {lastAssistantMessageIsCompleteWithToolCalls} from 'ai';
import {useCallback, useEffect, useMemo, useRef, useState} from 'preact/hooks';
import {BouncingLoader} from '../../../../components/BouncingLoader/BouncingLoader.js';
import {Markdown} from '../../../../components/Markdown/Markdown.js';
import {uploadFileToGCS} from '../../../../integrations/gcs.js';
import {IconButton} from '../../../../primitives/IconButton/IconButton.js';
import {Spinner} from '../../../../primitives/Spinner/Spinner.js';
import {Tooltip} from '../../../../primitives/Tooltip/Tooltip.js';
import {cn} from '../../../../utils/classes.js';
import {ChatErrorNotice} from '../ChatErrorNotice/ChatErrorNotice.js';
import {IconRootAI} from '../IconRootAI/IconRootAI.js';
import {createClientChatTransport} from '../RootAIChat/clientChatTransport.js';
import {createReadOnlyClientCmsTools} from '../RootAIChat/clientCmsTools.js';
import {
  createClientGoogleTools,
  maybeAuthorizeGoogle,
} from '../RootAIChat/clientGoogleTools.js';
import {executeCmsTool} from '../RootAIChat/cmsToolHandlers.js';
// Tool-call and reasoning UI is shared with the Root AI page (`RootAIChat`),
// so the two surfaces stay visually consistent.
import {ReasoningPartView, ToolPartView} from '../RootAIChat/RootAIChat.js';

/** Result emitted by the "Edit with AI" chat to the parent modal. */
export interface AiResponse {
  message: string;
  data: Record<string, any> | null;
  error?: string;
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

interface ChatPanelProps {
  children?: preact.ComponentChildren;
  /** JSON of the array item being edited. Sent to the model as context. */
  editModeData?: Record<string, any> | null;
  /** Called whenever the model emits a new proposed JSON value. */
  onEditModeResponse?: (data: AiResponse) => void;
}

export function ChatPanel(props: ChatPanelProps) {
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

  if (!config && !configError) {
    return (
      <div className="AiEditModal__ChatPanel__loading flex h-full items-center justify-center text-muted">
        <Spinner />
      </div>
    );
  }

  const isEnabled = !!config?.enabled && (config.models?.length || 0) > 0;
  if (!isEnabled) {
    return (
      <div className="AiEditModal__ChatPanel__notConfigured flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-muted">
        <div className="AiEditModal__ChatPanel__notConfigured__icon text-muted">
          <IconRobot size={32} />
        </div>
        <div className="AiEditModal__ChatPanel__notConfigured__title font-semibold">
          Root AI is not configured for this project.
        </div>
        <div className="AiEditModal__ChatPanel__notConfigured__body">
          Add an <code>ai.models</code> entry to <code>cmsPlugin()</code> in{' '}
          <code>root.config.ts</code>.
        </div>
        {configError && (
          <pre className="AiEditModal__ChatPanel__notConfigured__error mt-2 mb-0 w-full whitespace-pre-wrap rounded-sm bg-surface-hover p-2 text-left text-xs">
            {configError}
          </pre>
        )}
      </div>
    );
  }

  const defaultModel =
    config!.models!.find((m) => m.id === config!.defaultModel) ||
    config!.models![0];
  return (
    <ChatPanelInner
      model={defaultModel}
      editModeData={props.editModeData}
      onEditModeResponse={props.onEditModeResponse}
      welcome={props.children}
    />
  );
}

function ChatPanelInner(props: {
  model: ModelInfo;
  editModeData?: Record<string, any> | null;
  onEditModeResponse?: (data: AiResponse) => void;
  welcome?: preact.ComponentChildren;
}) {
  // Latest editModeData is sent on every request so the model always edits
  // against the user's current JSON (including any manual tweaks made
  // mid-conversation in the JSON tab).
  const editDataRef = useRef(props.editModeData);
  editDataRef.current = props.editModeData;

  // Streams directly from the browser. `ai.edit.prepare` (non-streaming)
  // returns the read-only edit system prompt — which embeds the current JSON
  // being edited — plus the selected model's connection config. editData can
  // change between turns, so the prompt is fetched fresh on each send.
  const transport = useMemo(
    () =>
      createClientChatTransport({
        loadTurnConfig: async () => {
          const res = await fetch('/cms/api/ai.edit.prepare', {
            method: 'POST',
            credentials: 'include',
            headers: {'content-type': 'application/json'},
            body: JSON.stringify({
              modelId: props.model.id,
              editData: editDataRef.current,
            }),
          });
          const data = await res.json();
          if (!res.ok || !data.success) {
            throw new Error(
              data.error || `ai.edit.prepare failed: ${res.status}`
            );
          }
          return {
            model: data.model,
            system: data.system,
            maxSteps: data.maxSteps,
          };
        },
        buildTools: (model) =>
          model.capabilities.tools
            ? {...createReadOnlyClientCmsTools(), ...createClientGoogleTools()}
            : {},
      }),
    [props.model.id]
  );

  const onResponseRef = useRef(props.onEditModeResponse);
  onResponseRef.current = props.onEditModeResponse;
  // Tracks the JSON snippet emitted for each assistant message id so we
  // don't re-fire onEditModeResponse on every streaming token.
  const lastEmittedRef = useRef<Map<string, string>>(new Map());

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
    transport,
    // Auto-resubmit once all tool calls in the latest assistant message have
    // results, so the model can finish its turn after consulting tools.
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    // Tools execute in the browser using the signed-in user's Firebase
    // credentials; the result is fed back to the model on the next round.
    // The server tool list is read-only, so only read handlers run here.
    onToolCall: async ({toolCall}) => {
      const output = await executeCmsTool(toolCall.toolName, toolCall.input);
      addToolOutput({
        tool: toolCall.toolName as any,
        toolCallId: toolCall.toolCallId,
        output,
      });
    },
  });

  const isStreaming = status === 'streaming' || status === 'submitted';

  // Whenever the latest assistant message changes, try to extract a
  // proposed JSON object from its text and bubble it up to the modal.
  useEffect(() => {
    const onResponse = onResponseRef.current;
    if (!onResponse) {
      return;
    }
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.role !== 'assistant') {
        continue;
      }
      const text = collectAssistantText(m);
      const json = extractLastJsonBlock(text);
      if (!json) {
        return;
      }
      const last = lastEmittedRef.current.get(m.id);
      if (last === json) {
        return;
      }
      try {
        const parsed = JSON.parse(json);
        if (parsed && typeof parsed === 'object') {
          lastEmittedRef.current.set(m.id, json);
          onResponse({message: '', data: parsed});
        }
      } catch {
        // Incomplete JSON during streaming — wait for more tokens.
      }
      return;
    }
  }, [messages]);

  return (
    <>
      <ChatTranscript
        messages={messages}
        isStreaming={isStreaming}
        welcome={props.welcome}
      />
      {error && (
        <ChatErrorNotice
          className="AiEditModal__ChatPanel__error my-2 shrink-0"
          error={error}
          busy={isStreaming}
          onRetry={() => regenerate()}
          onDismiss={clearError}
        />
      )}
      <ChatComposer
        canAttach={props.model.capabilities.attachments}
        isStreaming={isStreaming}
        onStop={stop}
        onSend={async (text, attachments) => {
          if (!text && attachments.length === 0) {
            return;
          }
          const preparedAttachments = prepareAttachmentsForSend(attachments);
          const messageText = [text, preparedAttachments.text]
            .filter(Boolean)
            .join('\n\n');
          // Grant Google access while the send click still counts as a user
          // gesture, so the Google read tools have a token mid-turn.
          await maybeAuthorizeGoogle([messageText]);
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

const TRANSCRIPT_CLASSES =
  'AiEditModal__ChatPanel__transcript min-h-0 flex-1 overflow-y-auto px-1 py-2';

function ChatTranscript(props: {
  messages: UIMessage[];
  isStreaming: boolean;
  welcome?: preact.ComponentChildren;
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
        className={cn(
          TRANSCRIPT_CLASSES,
          'AiEditModal__ChatPanel__transcript--empty flex items-center justify-center'
        )}
        ref={ref}
      >
        <div className="AiEditModal__ChatPanel__welcome flex flex-col items-center gap-2 p-6 text-center text-muted">
          <div className="AiEditModal__ChatPanel__welcome__icon w-12 rounded-full border border-border p-2 *:w-full">
            <IconRootAI />
          </div>
          <div className="AiEditModal__ChatPanel__welcome__title text-2xl font-bold leading-tight text-strong">
            Edit with Root AI
          </div>
          {props.welcome && (
            <div className="AiEditModal__ChatPanel__welcome__body max-w-150 text-center text-lg leading-normal md:px-6">
              {props.welcome}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={TRANSCRIPT_CLASSES} ref={ref}>
      <div className="AiEditModal__ChatPanel__transcript__inner flex flex-col gap-3">
        {props.messages.map((m) => (
          <MessageView key={m.id} message={m} />
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

function MessageView(props: {message: UIMessage}) {
  const message = props.message;
  const isUser = message.role === 'user';
  const username = isUser ? 'You' : 'Root AI';
  const photoURL = isUser ? window.firebase.user?.photoURL : null;
  return (
    <div
      className={cn(
        'AiEditModal__ChatPanel__message',
        `AiEditModal__ChatPanel__message--${message.role}`,
        'flex items-start gap-2'
      )}
    >
      <div className="AiEditModal__ChatPanel__message__avatar flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-chip text-muted">
        {photoURL ? (
          <img
            className="size-full object-cover"
            src={photoURL}
            alt={username}
          />
        ) : (
          <IconRobot size={18} />
        )}
      </div>
      <div className="AiEditModal__ChatPanel__message__body min-w-0 flex-1">
        <div className="AiEditModal__ChatPanel__message__username mb-0.5 text-sm font-semibold text-muted">
          {username}
        </div>
        <div className="AiEditModal__ChatPanel__message__parts flex flex-col gap-1.5">
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
    // Hide the trailing fenced ```json block from the chat UI — it's already
    // applied to the JSON editor and shown in the diff tab.
    const visibleText = stripLastJsonBlock(part.text);
    if (!visibleText) {
      return null;
    }
    return (
      <div className="AiEditModal__ChatPanel__textPart text-base leading-normal wrap-break-word">
        <Markdown code={visibleText} />
      </div>
    );
  }
  if (part.type === 'reasoning') {
    return <ReasoningPartView text={part.text} />;
  }
  if (part.type === 'file') {
    return <FilePartView part={part} />;
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
  return null;
}

function FilePartView(props: {part: any}) {
  const part = props.part;
  if (part.mediaType?.startsWith('image/')) {
    return (
      <div className="AiEditModal__ChatPanel__filePart">
        <img
          className="block max-w-50 rounded-sm"
          src={part.url}
          alt={part.filename || 'attachment'}
        />
      </div>
    );
  }
  return (
    <a
      className="AiEditModal__ChatPanel__filePart AiEditModal__ChatPanel__filePart--link inline-flex min-w-0 items-center gap-1 text-sm text-link wrap-anywhere"
      href={part.url}
      target="_blank"
    >
      <IconPaperclip size={14} />
      <span>{part.filename || part.url}</span>
    </a>
  );
}

function ChatComposer(props: {
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
      el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
    });
  };

  useEffect(fitTextarea, [text, attachments]);

  const submit = useCallback(() => {
    if (props.isStreaming) {
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
  }, [text, attachments, props.isStreaming]);

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

  const hasAttachments = uploading || attachments.length > 0;

  return (
    <div className="AiEditModal__ChatPanel__composer relative z-10 shrink-0 px-2 pt-3">
      <div className="AiEditModal__ChatPanel__composer__prompt relative mx-auto max-w-200">
        {props.canAttach && (
          <>
            <input
              ref={fileRef}
              type="file"
              className="AiEditModal__ChatPanel__composer__imageUpload__input hidden"
              aria-hidden="true"
              tabIndex={-1}
              onChange={onFileChange}
            />
            {/*
             * Positioned on a wrapper, since the tooltip's own wrapper
             * would otherwise sit in the flow and add a line box.
             */}
            <div className="AiEditModal__ChatPanel__composer__imageUpload absolute bottom-2 left-2 flex">
              <IconButton
                round
                label="Upload file"
                onClick={() => fileRef.current?.click()}
              >
                <IconPaperclip />
              </IconButton>
            </div>
          </>
        )}
        <textarea
          ref={textareaRef}
          aria-label="Message"
          className={cn(
            'AiEditModal__ChatPanel__composer__textInput box-border block max-h-50 w-full resize-none appearance-none overflow-hidden rounded-xl border border-border bg-surface px-12 py-3 font-sans text-base font-normal leading-normal text-fg transition-shadow placeholder:text-subtle focus:border-border-strong focus:shadow-sm focus:outline-none',
            hasAttachments && 'pb-22'
          )}
          placeholder="Tell me what you want to change..."
          value={text}
          rows={1}
          autofocus
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
        {hasAttachments && (
          <div className="AiEditModal__ChatPanel__composer__attachments absolute bottom-2 left-11 flex items-center gap-1.5">
            {uploading && <Spinner />}
            {attachments.map((a, i) => (
              <Tooltip key={i} label={a.filename} placement="top">
                <button
                  type="button"
                  aria-label={`Remove ${a.filename}`}
                  className="AiEditModal__ChatPanel__composer__attachment group/attachment relative m-0 size-16 cursor-pointer appearance-none rounded-lg border border-border bg-surface-active p-1 font-sans focus-visible:outline-2 focus-visible:outline-focus"
                  onClick={() =>
                    setAttachments((prev) => prev.filter((_, idx) => idx !== i))
                  }
                >
                  {a.mediaType.startsWith('image/') ? (
                    <img
                      className="size-full object-contain object-center"
                      src={a.url}
                      alt={a.filename}
                    />
                  ) : (
                    <span className="AiEditModal__ChatPanel__composer__attachment__name block text-center text-xs wrap-break-word">
                      {a.filename}
                    </span>
                  )}
                  <div className="AiEditModal__ChatPanel__composer__attachment__close absolute top-1/2 left-1/2 flex -translate-x-1/2 -translate-y-1/2 rounded-full bg-overlay p-0.5 text-inverse opacity-0 transition-opacity group-hover/attachment:opacity-100 group-focus-visible/attachment:opacity-100 pointer-coarse:opacity-100">
                    <IconX size={20} />
                  </div>
                </button>
              </Tooltip>
            ))}
          </div>
        )}
        <div className="AiEditModal__ChatPanel__composer__submit absolute right-2 bottom-2 flex">
          {props.isStreaming ? (
            <IconButton
              variant="primary"
              round
              label="Stop"
              onClick={props.onStop}
            >
              <IconX />
            </IconButton>
          ) : (
            <IconButton
              variant="primary"
              round
              label="Send"
              disabled={uploading || (!text && attachments.length === 0)}
              onClick={submit}
            >
              <IconSend2 />
            </IconButton>
          )}
        </div>
      </div>
      <div className="AiEditModal__ChatPanel__composer__disclaimer mt-3 px-5 text-center text-sm text-balance text-muted">
        Root AI is experimental and makes mistakes. Check all info.
      </div>
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

/** Concatenates all `text` parts of an assistant message. */
function collectAssistantText(message: UIMessage): string {
  return (message.parts || [])
    .filter((p: any) => p.type === 'text' && typeof p.text === 'string')
    .map((p: any) => p.text)
    .join('');
}

/**
 * Returns the contents of the LAST fenced ```json (or untagged ```) block in
 * `text`, or `null` if none is found. Used to extract the model's proposed
 * edit while ignoring earlier illustrative snippets it may have included
 * mid-explanation.
 */
function extractLastJsonBlock(text: string): string | null {
  if (!text) {
    return null;
  }
  // Match fenced ```json ... ``` blocks first; fall back to plain ``` blocks.
  const pattern = /```(?:json)?\s*\n([\s\S]*?)```/gi;
  let match: RegExpExecArray | null;
  let last: string | null = null;
  while ((match = pattern.exec(text)) !== null) {
    last = match[1].trim();
  }
  return last;
}

/**
 * Strips the trailing fenced JSON block from an assistant message's text so
 * the chat UI doesn't duplicate what the diff viewer already displays. Also
 * strips an in-flight (un-closed) ```json fence during streaming.
 */
function stripLastJsonBlock(text: string): string {
  if (!text) {
    return text;
  }
  // Find every complete fenced block; if the LAST one is at the tail of the
  // message (only whitespace after it), strip it.
  const fenced = /```(?:json)?\s*\n[\s\S]*?```/gi;
  const matches = Array.from(text.matchAll(fenced));
  let out = text;
  if (matches.length > 0) {
    const last = matches[matches.length - 1];
    const start = last.index ?? -1;
    const end = start + last[0].length;
    if (start !== -1 && /^\s*$/.test(out.slice(end))) {
      out = out.slice(0, start);
    }
  }
  // Streaming case: if the remaining text contains an odd number of
  // triple-backtick fences, the last one is an opener that hasn't been
  // closed yet — strip from it onward so the partial JSON stays out of
  // the chat transcript.
  const fenceCount = (out.match(/```/g) || []).length;
  if (fenceCount % 2 === 1) {
    const lastIdx = out.lastIndexOf('```');
    if (lastIdx !== -1) {
      out = out.slice(0, lastIdx);
    }
  }
  return out.trim();
}
