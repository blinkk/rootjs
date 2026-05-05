/**
 * Legacy chat window used by the `AiEditModal`. Renders typewriter-animated
 * markdown responses for the Genkit-backed `/cms/api/ai.chat` endpoint.
 *
 * The new `/cms/ai` chat (Vercel AI SDK) lives in `pages/AIPage/AIPage.tsx` and
 * does not use these components.
 */
import './LegacyChatView.css';

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
import {numBetween} from '../../utils/rand.js';
import {
  ImageMessageBlock,
  Message,
  MessageBlock,
  PendingMessageBlock,
  TextMessageBlock,
} from './ChatBar.js';
import {ChatController} from './legacyChat.js';

const TYPEWRITER_ANIM_DELAY = [20, 40] as const;

hljs.configure({ignoreUnescapedHTML: true});

function typewriterDelay() {
  return numBetween(...TYPEWRITER_ANIM_DELAY);
}

export function ChatWindow(props: {
  chat: ChatController;
  children?: preact.ComponentChildren;
}) {
  const messages = props.chat.messages;
  return (
    <div className="LegacyChatView">
      {messages.length > 0 ? (
        <div className="LegacyChatView__messages">
          {props.chat.messages.map((message, i) => (
            <ChatMessage key={message.key || i} message={message} />
          ))}
        </div>
      ) : (
        <div className="LegacyChatView__welcome">
          <div className="LegacyChatView__welcome__icon">
            <IconRobot size={36} />
          </div>
          <div className="LegacyChatView__welcome__title">Root AI is ready</div>
          {props.children && (
            <div className="LegacyChatView__welcome__body">
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
    <div className="LegacyChatView__message" ref={ref}>
      <div className="LegacyChatView__message__side">
        <div className="LegacyChatView__message__side__avatar">
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
      <div className="LegacyChatView__message__main">
        <div className="LegacyChatView__message__main__username">
          {username}
        </div>
        <div className="LegacyChatView__message__main__blocks">
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
    <div className="LegacyChatView__messageBlocks">
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

  return {nodes, next, complete};
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

  useEffect(() => {
    if (markdownTree.children.length === 0 && props.animated) {
      props.onAnimationComplete();
    }
  }, [markdownTree.children.length, props.animated]);

  return (
    <div className="LegacyChatView__textBlock">
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
    <div className="LegacyChatView__codeBlock">
      <div className="LegacyChatView__codeBlock__header">
        {props.language && (
          <div className="LegacyChatView__codeBlock__language">
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
    <div className="LegacyChatView__pendingBlock">
      <CursorDot />
    </div>
  );
}

function CursorDot() {
  return <div className="LegacyChatView__cursor" />;
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
    <div className="LegacyChatView__imageBlock">
      <img
        src={image.src}
        width={image.width}
        height={image.height}
        alt={image.alt}
      />
    </div>
  );
}
