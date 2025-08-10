import './AIPage.css';

import {ActionIcon, Avatar, Tooltip} from '@mantine/core';
import {
  IconClipboard,
  IconClipboardCheck,
  IconRobot,
} from '@tabler/icons-preact';
import hljs from 'highlight.js/lib/common';
import {fromMarkdown} from 'mdast-util-from-markdown';
import {gfmFromMarkdown} from 'mdast-util-gfm';
import {gfm} from 'micromark-extension-gfm';
import {useEffect, useMemo, useRef, useState} from 'preact/hooks';
import {ChatApiRequest, ChatApiResponse} from '../../../core/api.js';
import {
  ChatPrompt,
  AiResponse,
  SendPromptOptions,
} from '../../../shared/ai/prompts.js';
import {
  ChatBar,
  ImageMessageBlock,
  Message,
  MessageBlock,
  PendingMessageBlock,
  TextMessageBlock,
} from '../../components/ChatBar/ChatBar.js';
import {Layout} from '../../layout/Layout.js';
import {autokey, numBetween} from '../../utils/rand.js';

const TYPEWRITER_ANIM_DELAY = [20, 40] as const;

hljs.configure({ignoreUnescapedHTML: true});

function typewriterDelay() {
  return numBetween(...TYPEWRITER_ANIM_DELAY);
}

export interface ChatController {
  chatId?: string;
  messages: Message[];
  addMessage: (message: Message) => number;
  updateMessage: (messageId: number, message: Message) => void;
  sendPrompt: (
    messageId: number,
    prompt: ChatPrompt | ChatPrompt[],
    options?: SendPromptOptions
  ) => Promise<AiResponse | null>;
}

export function useChat(): ChatController {
  const [messages, setMessages] = useState<Message[]>([]);
  const [chatId, setChatId] = useState('');

  const addMessage = (message: Message) => {
    let messageId = 0;
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
      messageId = newMessages.length - 1;
      return newMessages;
    });
    return messageId;
  };

  const updateMessage = (messageId: number, message: Message) => {
    setMessages((current) => {
      const newMessages = [...current];
      newMessages[messageId] = {...message, key: autokey()};
      return newMessages;
    });
  };

  const sendPrompt = async (
    messageId: number,
    prompt: ChatPrompt | ChatPrompt[],
    options?: SendPromptOptions
  ): Promise<AiResponse> => {
    // Allow users to provide a custom api endpoint via the
    // `{ai: {endpoint: '/api/...}}` config.
    let endpoint = '/cms/api/ai.chat';
    if (typeof window.__ROOT_CTX.experiments?.ai === 'object') {
      if (window.__ROOT_CTX.experiments.ai.endpoint) {
        endpoint = window.__ROOT_CTX.experiments.ai.endpoint;
      }
    }

    const req: ChatApiRequest = {
      prompt,
      chatId,
      options,
    };
    const res = await window.fetch(endpoint, {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify(req),
    });
    if (res.status !== 200) {
      const err = await res.text();
      console.error('chat failed', err);
      const errorMessage = ['Something went wrong:', '```', err, '```'].join(
        '\n'
      );
      updateMessage(messageId, {
        sender: 'bot',
        blocks: [
          {
            type: 'text',
            text: errorMessage,
          },
        ],
      });
      return {message: errorMessage, data: {}};
    }
    const resData = (await res.json()) as ChatApiResponse;
    if (resData.success && resData.chatId) {
      setChatId(resData.chatId);
      updateMessage(messageId, {
        sender: 'bot',
        data: resData.response?.data || {},
        blocks: [
          {
            type: 'text',
            text: resData.response?.message || '',
          },
        ],
      });
      return resData.response;
    }
    return {
      message: 'Sorry. Something went wrong. An unknown error occurred.',
      data: {},
    };
  };

  return {
    chatId,
    messages,
    addMessage,
    updateMessage,
    sendPrompt,
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
            <ChatWindow chat={chat}>
              <p>
                Chat with me about your website. Ask questions about the content
                and I can tell you about it.
              </p>
            </ChatWindow>
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

export function ChatWindow(props: {
  chat: ChatController;
  children?: preact.ComponentChildren;
}) {
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
            Root AI is ready
          </div>
          {props.children && (
            <div className="AIPage__ChatWindow__welcome__body">
              {props.children}
            </div>
          )}
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
              onAnimationComplete={() => addNextBlock()}
            />
          );
        }
        if (block.type === 'pending') {
          return (
            <ChatMessagePendingBlock
              key={key}
              block={block}
              animated={props.animated}
              onAnimationComplete={() => addNextBlock()}
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
        return <div>unknown block type: {(block as any).type}</div>;
      })}
    </div>
  );
}

function useAnimatedNodes<T = any>(props: {
  nodes: T[];
  animated?: boolean;
  onAnimationComplete?: () => void;
}) {
  const [nodes, setNodes] = useState(props.animated ? [] : props.nodes);
  const complete = nodes.length >= props.nodes.length;

  const appendNextNode = () => {
    setNodes((current) => {
      if (current.length >= props.nodes.length) {
        return props.nodes;
      }
      return [...current, props.nodes[current.length]];
    });
  };

  const next = () => {
    if (nodes.length >= props.nodes.length) {
      if (props.onAnimationComplete) {
        props.onAnimationComplete();
      }
      return;
    }
    window.setTimeout(() => appendNextNode(), typewriterDelay());
  };

  useEffect(() => {
    if (props.animated) {
      appendNextNode();
    }
  }, []);

  return {
    nodes,
    next,
    complete,
  };
}

function ChatMessageTextBlock(props: {
  block: TextMessageBlock;
  animated: boolean;
  onAnimationComplete: () => void;
}) {
  const markdownTree = useMemo(() => {
    const tree = fromMarkdown(props.block.text, {
      extensions: [gfm()],
      mdastExtensions: [gfmFromMarkdown()],
    });
    return tree;
  }, [props.block.text]);

  const {nodes, next} = useAnimatedNodes({
    nodes: markdownTree.children,
    animated: props.animated,
    onAnimationComplete: props.onAnimationComplete,
  });

  return (
    <div className="AIPage__ChatMessageTextBlock">
      {nodes.map((node, i) => (
        <MarkdownNode
          key={i}
          node={node}
          animated={props.animated}
          onAnimationComplete={next}
        />
      ))}
    </div>
  );
}

function MarkdownNode(props: {
  node: any;
  animated: boolean;
  onAnimationComplete: () => void;
}) {
  const node = props.node;
  if (node.type === 'code') {
    return (
      <CodeBlockNode
        text={node.value}
        language={node.lang}
        animated={props.animated}
        onAnimationComplete={props.onAnimationComplete}
      />
    );
  }
  if (node.type === 'heading') {
    const tagName = `h${node.depth || 2}` as preact.JSX.ElementType;
    return (
      <ElementNode
        as={tagName}
        nodes={node.children}
        animated={props.animated}
        onAnimationComplete={props.onAnimationComplete}
      />
    );
  }
  if (node.type === 'inlineCode') {
    return (
      <ElementNode
        as="code"
        nodes={[{type: 'text', value: node.value}]}
        animated={props.animated}
        onAnimationComplete={props.onAnimationComplete}
      />
    );
  }
  if (node.type === 'link') {
    return (
      <ElementNode
        as="a"
        attrs={{href: node.url, target: '_blank'}}
        nodes={node.children}
        animated={props.animated}
        onAnimationComplete={props.onAnimationComplete}
      />
    );
  }
  if (node.type === 'list') {
    const tagName = node.ordered ? 'ol' : 'ul';
    return (
      <ElementNode
        as={tagName}
        nodes={node.children}
        animated={props.animated}
        onAnimationComplete={props.onAnimationComplete}
      />
    );
  }
  if (node.type === 'listItem') {
    return (
      <ElementNode
        as="li"
        nodes={node.children}
        animated={props.animated}
        onAnimationComplete={props.onAnimationComplete}
      />
    );
  }
  if (node.type === 'paragraph') {
    return (
      <ElementNode
        as="p"
        nodes={node.children}
        animated={props.animated}
        onAnimationComplete={props.onAnimationComplete}
      />
    );
  }
  if (node.type === 'strong') {
    return (
      <ElementNode
        as="b"
        nodes={node.children}
        animated={props.animated}
        onAnimationComplete={props.onAnimationComplete}
      />
    );
  }
  if (node.type === 'text') {
    return (
      <TextNode
        text={node.value}
        animated={props.animated}
        onAnimationComplete={props.onAnimationComplete}
      />
    );
  }

  return <div>{JSON.stringify(props.node)}</div>;
}

function ElementNode(props: {
  as: preact.JSX.ElementType;
  attrs?: Record<string, any>;
  nodes: any[];
  animated: boolean;
  onAnimationComplete: () => void;
}) {
  const {nodes, next} = useAnimatedNodes({
    nodes: props.nodes,
    animated: props.animated,
    onAnimationComplete: props.onAnimationComplete,
  });
  const Component = props.as;
  return (
    <Component {...props.attrs}>
      {nodes.map((node, i) => (
        <MarkdownNode
          key={i}
          node={node}
          animated={props.animated}
          onAnimationComplete={() => next()}
        />
      ))}
    </Component>
  );
}

function TextNode(props: {
  text: string;
  animated: boolean;
  onAnimationComplete: () => void;
  sep?: string;
}) {
  const sep = props.sep || ' ';
  const tokens = useMemo(() => props.text.split(sep), [props.text]);
  const [index, setIndex] = useState(props.animated ? 0 : tokens.length);
  const complete = index >= tokens.length;

  useEffect(() => {
    if (!props.animated) {
      return;
    }
    if (index >= tokens.length) {
      return;
    }
    const timeout = window.setTimeout(() => {
      setIndex(index + 1);
    }, typewriterDelay());
    return () => window.clearTimeout(timeout);
  }, [props.text, index]);

  useEffect(() => {
    if (complete && props.animated) {
      props.onAnimationComplete();
    }
  }, [complete]);

  return (
    <>
      {tokens.slice(0, index).join(sep)}
      {!complete && <CursorDot />}
    </>
  );
}

function CodeBlockNode(props: {
  text: string;
  language: string;
  animated: boolean;
  onAnimationComplete: () => void;
}) {
  const preRef = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState(false);

  function highlightCode() {
    const pre = preRef.current!;
    hljs.highlightElement(pre);
    console.log('highlight:', pre);
  }

  async function copyToClipboard() {
    try {
      await navigator.clipboard.writeText(props.text);
      setCopied(true);
      window.setTimeout(() => {
        setCopied(false);
      }, 2000);
    } catch (err) {
      console.error('failed to copy to clipboard:', err);
    }
  }

  function onAnimationComplete() {
    highlightCode();
    props.onAnimationComplete();
  }

  useEffect(() => {
    if (!props.animated) {
      highlightCode();
    }
  }, [props.animated]);

  return (
    <div className="AIPage__CodeBlockNode">
      <div className="AIPage__CodeBlockNode__header">
        {props.language && (
          <div className="AIPage__CodeBlockNode__language">
            {props.language}
          </div>
        )}
        <Tooltip label="Copy code" position="bottom" transition="pop">
          <ActionIcon onClick={() => copyToClipboard()} size="xs">
            {copied ? (
              <IconClipboardCheck
                color="#80868b"
                stroke-width={1.5}
                size={16}
              />
            ) : (
              <IconClipboard color="#80868b" stroke-width={1.5} size={16} />
            )}
          </ActionIcon>
        </Tooltip>
      </div>
      <pre ref={preRef} class={`language-${props.language || 'unknown'}`}>
        <TextNode
          text={props.text}
          sep={'\n'}
          animated={props.animated}
          onAnimationComplete={onAnimationComplete}
        />
      </pre>
    </div>
  );
}

function ChatMessagePendingBlock(props: {
  block: PendingMessageBlock;
  animated: boolean;
  onAnimationComplete: () => void;
}) {
  useEffect(() => {
    if (props.animated) {
      props.onAnimationComplete();
    }
  }, []);
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
  onAnimationComplete: () => void;
}) {
  const image = props.block.image;
  useEffect(() => {
    if (props.animated) {
      props.onAnimationComplete();
    }
  }, []);
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
