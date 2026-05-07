/**
 * Chat panel used inside the array-item "Edit with AI" modal. Built on top of
 * the Vercel AI SDK (`ai`, `@ai-sdk/react`) and streams responses from
 * `/cms/api/ai.v2.editObject`.
 *
 * The endpoint exposes a READ-ONLY tool subset — the model can inspect CMS
 * docs and schemas for context but cannot mutate Firestore. Edits are
 * proposed as a fenced ```json code block in the assistant's message; this
 * component extracts it and forwards it to the modal so it can populate the
 * diff viewer for the user to approve and save.
 */
import {useChat} from '@ai-sdk/react';
import {ActionIcon, Loader, Tooltip} from '@mantine/core';
import {
  IconChevronDown,
  IconPaperclip,
  IconRobot,
  IconSend2,
  IconTool,
  IconX,
} from '@tabler/icons-preact';
import type {UIMessage} from 'ai';
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithToolCalls,
} from 'ai';
import {useCallback, useEffect, useMemo, useRef, useState} from 'preact/hooks';
import {AiResponse} from '../../../shared/ai/prompts.js';
import {executeCmsTool} from '../../pages/AIPage/cmsToolHandlers.js';
import {joinClassNames} from '../../utils/classes.js';
import {uploadFileToGCS} from '../../utils/gcs.js';
import {IconRootAI} from '../IconRootAI/IconRootAI.js';
import {Markdown} from '../Markdown/Markdown.js';

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

  if (!config && !configError) {
    return (
      <div className="AiEditModal__ChatPanel__loading">
        <Loader size="sm" color="gray" />
      </div>
    );
  }

  const isEnabled = !!config?.enabled && (config.models?.length || 0) > 0;
  if (!isEnabled) {
    return (
      <div className="AiEditModal__ChatPanel__notConfigured">
        <div className="AiEditModal__ChatPanel__notConfigured__icon">
          <IconRobot size={32} />
        </div>
        <div className="AiEditModal__ChatPanel__notConfigured__title">
          Root AI is not configured for this project.
        </div>
        <div className="AiEditModal__ChatPanel__notConfigured__body">
          Add an <code>ai.models</code> entry to <code>cmsPlugin()</code> in{' '}
          <code>root.config.ts</code>.
        </div>
        {configError && (
          <pre className="AiEditModal__ChatPanel__notConfigured__error">
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

  const transport = useMemo(
    () =>
      new DefaultChatTransport<UIMessage>({
        api: '/cms/api/ai.v2.editObject',
        credentials: 'include',
        prepareSendMessagesRequest: ({messages}) => ({
          body: {
            messages,
            modelId: props.model.id,
            editData: editDataRef.current,
          },
        }),
      }),
    [props.model.id]
  );

  const onResponseRef = useRef(props.onEditModeResponse);
  onResponseRef.current = props.onEditModeResponse;
  // Tracks the JSON snippet emitted for each assistant message id so we
  // don't re-fire onEditModeResponse on every streaming token.
  const lastEmittedRef = useRef<Map<string, string>>(new Map());

  const {messages, sendMessage, status, error, stop, addToolOutput} = useChat({
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
        <div className="AiEditModal__ChatPanel__error">
          <strong>Error:</strong> {error.message}
        </div>
      )}
      <ChatComposer
        canAttach={props.model.capabilities.attachments}
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
        className="AiEditModal__ChatPanel__transcript AiEditModal__ChatPanel__transcript--empty"
        ref={ref}
      >
        <div className="AiEditModal__ChatPanel__welcome">
          <div className="AiEditModal__ChatPanel__welcome__icon">
            <IconRootAI />
          </div>
          <div className="AiEditModal__ChatPanel__welcome__title">
            Edit with Root AI
          </div>
          {props.welcome && (
            <div className="AiEditModal__ChatPanel__welcome__body">
              {props.welcome}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="AiEditModal__ChatPanel__transcript" ref={ref}>
      <div className="AiEditModal__ChatPanel__transcript__inner">
        {props.messages.map((m) => (
          <MessageView key={m.id} message={m} />
        ))}
        {props.isStreaming && (
          <div className="AiEditModal__ChatPanel__streamingIndicator">
            <Loader size="xs" color="gray" />
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
        'AiEditModal__ChatPanel__message',
        `AiEditModal__ChatPanel__message--${message.role}`
      )}
    >
      <div className="AiEditModal__ChatPanel__message__avatar">
        {photoURL ? (
          <img src={photoURL} alt={username} />
        ) : (
          <IconRobot size={18} />
        )}
      </div>
      <div className="AiEditModal__ChatPanel__message__body">
        <div className="AiEditModal__ChatPanel__message__username">
          {username}
        </div>
        <div className="AiEditModal__ChatPanel__message__parts">
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
      <div className="AiEditModal__ChatPanel__textPart">
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

function ReasoningPartView(props: {text: string}) {
  const [open, setOpen] = useState(false);
  if (!props.text) {
    return null;
  }
  return (
    <div
      className={joinClassNames(
        'AiEditModal__ChatPanel__reasoning',
        open && 'AiEditModal__ChatPanel__reasoning--open'
      )}
    >
      <button
        type="button"
        className="AiEditModal__ChatPanel__reasoning__toggle"
        onClick={() => setOpen(!open)}
      >
        <IconChevronDown
          size={14}
          style={{transform: open ? 'rotate(0deg)' : 'rotate(-90deg)'}}
        />
        <span>Thinking</span>
      </button>
      {open && (
        <div className="AiEditModal__ChatPanel__reasoning__body">
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
      <div className="AiEditModal__ChatPanel__filePart">
        <img src={part.url} alt={part.filename || 'attachment'} />
      </div>
    );
  }
  return (
    <a
      className="AiEditModal__ChatPanel__filePart AiEditModal__ChatPanel__filePart--link"
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
  const toolName: string =
    typeof part.type === 'string' && part.type.startsWith('tool-')
      ? part.type.slice('tool-'.length)
      : part.toolName || 'tool';
  const state: string = part.state || '';
  const [open, setOpen] = useState(false);
  return (
    <div className="AiEditModal__ChatPanel__tool">
      <button
        type="button"
        className="AiEditModal__ChatPanel__tool__header"
        onClick={() => setOpen(!open)}
      >
        <IconTool size={14} />
        <code>{toolName}</code>
        <span className="AiEditModal__ChatPanel__tool__state">
          {prettyToolState(state)}
        </span>
        <IconChevronDown
          size={14}
          style={{
            marginLeft: 'auto',
            transform: open ? 'rotate(0deg)' : 'rotate(-90deg)',
          }}
        />
      </button>
      {open && (
        <div className="AiEditModal__ChatPanel__tool__body">
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
            <div className="AiEditModal__ChatPanel__tool__error">
              {part.errorText}
            </div>
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
    <div className="AiEditModal__ChatPanel__composer">
      <div
        className={joinClassNames(
          'AiEditModal__ChatPanel__composer__prompt',
          (uploading || attachments.length > 0) &&
            'AiEditModal__ChatPanel__composer__prompt--hasImage'
        )}
      >
        {props.canAttach && (
          <label className="AiEditModal__ChatPanel__composer__imageUpload">
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="AiEditModal__ChatPanel__composer__imageUpload__input"
              onChange={onFileChange}
            />
            <Tooltip label="Upload image">
              <ActionIcon
                component="div"
                className="AiEditModal__ChatPanel__composer__imageUpload__icon"
                radius="xl"
              >
                <IconPaperclip size={18} />
              </ActionIcon>
            </Tooltip>
          </label>
        )}
        <textarea
          ref={textareaRef}
          className="AiEditModal__ChatPanel__composer__textInput"
          placeholder="Tell me what you want to change..."
          value={text}
          rows={1}
          autofocus
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
        {(uploading || attachments.length > 0) && (
          <div className="AiEditModal__ChatPanel__composer__attachments">
            {uploading && <Loader size="sm" />}
            {attachments.map((a, i) => (
              <Tooltip
                key={i}
                label={a.filename}
                transition="pop"
                position="top"
                withArrow
              >
                <button
                  className="AiEditModal__ChatPanel__composer__attachment"
                  onClick={() =>
                    setAttachments((prev) => prev.filter((_, idx) => idx !== i))
                  }
                >
                  {a.mediaType.startsWith('image/') ? (
                    <img src={a.url} alt={a.filename} />
                  ) : (
                    <span className="AiEditModal__ChatPanel__composer__attachment__name">
                      {a.filename}
                    </span>
                  )}
                  <div className="AiEditModal__ChatPanel__composer__attachment__close">
                    <IconX size={20} color="white" />
                  </div>
                </button>
              </Tooltip>
            ))}
          </div>
        )}
        {props.isStreaming ? (
          <ActionIcon
            className="AiEditModal__ChatPanel__composer__submit"
            variant="filled"
            color="dark"
            radius="xl"
            onClick={props.onStop}
            title="Stop"
          >
            <IconX size={18} />
          </ActionIcon>
        ) : (
          <ActionIcon
            className="AiEditModal__ChatPanel__composer__submit"
            variant="filled"
            color="dark"
            radius="xl"
            disabled={uploading || (!text && attachments.length === 0)}
            onClick={submit}
            title="Send"
          >
            <IconSend2 size={18} />
          </ActionIcon>
        )}
      </div>
      <div className="AiEditModal__ChatPanel__composer__disclaimer">
        Root AI is experimental and makes mistakes. Check all info.
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
