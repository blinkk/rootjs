import './CommentBody.css';

import {ComponentChildren, h} from 'preact';
import {useMemo} from 'preact/hooks';
import {
  RichTextBlock,
  RichTextData,
  RichTextListItem,
} from '../../../../shared/richtext.js';
import {sanitizeInlineHtml} from '../../../../shared/sanitize.js';
import {Markdown} from '../../../components/Markdown/Markdown.js';
import {cn, joinClassNames} from '../../../utils/classes.js';
import {UserTag} from '../../users/UserTag/UserTag.js';

export interface CommentBodyProps {
  /** Rich text body of the comment. */
  body?: RichTextData | null;
  /**
   * Plain-text (markdown) content, used when the comment has no rich text
   * body (e.g. comments created before rich text support).
   */
  content?: string;
  /** Renders a "deleted" placeholder instead of the content. */
  deleted?: boolean;
  className?: string;
}

/**
 * Renders the body of a comment (task comments, field comments). Rich text
 * bodies are rendered from `RichTextData`; plain-text content is rendered as
 * markdown. Links to other CMS pages use the SPA router; external links open
 * in a new tab.
 */
export function CommentBody(props: CommentBodyProps) {
  return (
    <div
      className={cn(
        'CommentBody',
        props.deleted && 'CommentBody--deleted',
        // Long unbreakable tokens (e.g. Google Docs urls) wrap instead of
        // overflowing the popover. `anywhere` also keeps them out of the
        // min-content width, so they can't widen flex parents either.
        'whitespace-pre-wrap text-base leading-normal break-normal wrap-anywhere',
        props.deleted && 'italic text-muted',
        props.className
      )}
      onClick={onCommentBodyClick}
    >
      {props.deleted ? (
        'Comment deleted.'
      ) : props.body ? (
        <CommentRichText className="CommentBody__richText" data={props.body} />
      ) : props.content ? (
        <Markdown className="CommentBody__markdown" code={props.content} />
      ) : null}
    </div>
  );
}

/**
 * Handles clicks on links inside comment bodies. Only `/cms` links are left to
 * the SPA router; all other links open in a new window.
 */
export function onCommentBodyClick(e: MouseEvent) {
  const link = (e.target as HTMLElement)?.closest?.(
    'a[href]'
  ) as HTMLAnchorElement | null;
  if (!link) {
    return;
  }
  const href = link.getAttribute('href') || '';
  if (!href || href.startsWith('#') || isCmsInternalUrl(href)) {
    return;
  }
  e.preventDefault();
  e.stopPropagation();
  window.open(link.href, '_blank', 'noopener,noreferrer');
}

/** Returns true if a link should be handled by the CMS SPA router. */
function isCmsInternalUrl(href: string) {
  try {
    const url = new URL(href, window.location.origin);
    return (
      url.origin === window.location.origin &&
      (url.pathname === '/cms' || url.pathname.startsWith('/cms/'))
    );
  } catch {
    return false;
  }
}

/**
 * Renders sanitized inline comment HTML as Preact elements. `@mention` links
 * render as a {@link UserTag} (with the user hover card), and non-CMS links get
 * `target="_blank"` and an external-link marker class so they bypass SPA
 * navigation.
 */
function CommentInlineHtml(props: {html: string}) {
  const children = useMemo(() => {
    const template = document.createElement('template');
    template.innerHTML = sanitizeInlineHtml(props.html);
    return Array.from(template.content.childNodes).map(toVNode);
  }, [props.html]);
  return <>{children}</>;
}

/** Converts a DOM node from sanitized comment HTML into a Preact element. */
function toVNode(node: Node, key: number): ComponentChildren {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) {
    return null;
  }
  const el = node as Element;
  const children = Array.from(el.childNodes).map(toVNode);
  const mentionEmail = el.getAttribute('data-mention');
  if (el.tagName === 'A' && mentionEmail) {
    return (
      <UserTag
        key={key}
        className="CommentBody__mention whitespace-nowrap font-semibold underline underline-offset-3"
        email={mentionEmail}
      >
        {children}
      </UserTag>
    );
  }
  const attrs: Record<string, string | number | undefined> = {key};
  Array.from(el.attributes).forEach((attr) => {
    // Event handler attributes are stripped by the sanitizer; skip them here
    // too so Preact never treats them as listeners.
    if (!attr.name.toLowerCase().startsWith('on')) {
      attrs[attr.name] = attr.value;
    }
  });
  if (el.tagName === 'A') {
    const href = el.getAttribute('href') || '';
    if (!href.startsWith('#') && !isCmsInternalUrl(href)) {
      attrs.target = '_blank';
      attrs.rel = 'noopener noreferrer';
      attrs.class = joinClassNames(
        el.getAttribute('class'),
        'CommentBody__externalLink'
      );
    }
  }
  return h(el.tagName.toLowerCase(), attrs, children);
}

/** Renders `RichTextData` as read-only HTML. */
export function CommentRichText(props: {
  className?: string;
  data: RichTextData;
}) {
  return (
    <div className={joinClassNames('Prose', props.className)}>
      {(props.data.blocks || []).map((block, index) => (
        <CommentRichTextBlock key={index} block={block} />
      ))}
    </div>
  );
}

function CommentRichTextBlock(props: {block: RichTextBlock}) {
  const {block} = props;
  switch (block.type) {
    case 'paragraph':
      return <CommentRichTextHtml tag="p" html={block.data?.text} />;
    case 'heading':
      return <CommentRichTextHtml tag="h4" html={block.data?.text} />;
    case 'quote':
      return <CommentRichTextHtml tag="blockquote" html={block.data?.text} />;
    case 'orderedList':
      return (
        <ol>
          {(block.data?.items || []).map(
            (item: RichTextListItem, index: number) => (
              <CommentRichTextListItem key={index} item={item} />
            )
          )}
        </ol>
      );
    case 'unorderedList':
      return (
        <ul>
          {(block.data?.items || []).map(
            (item: RichTextListItem, index: number) => (
              <CommentRichTextListItem key={index} item={item} />
            )
          )}
        </ul>
      );
    case 'image': {
      const image = block.data?.file;
      if (!image?.url) {
        return null;
      }
      return (
        <img
          src={image.url}
          width={Number(image.width) || undefined}
          height={Number(image.height) || undefined}
          alt={image.alt || ''}
        />
      );
    }
    default:
      return null;
  }
}

function CommentRichTextHtml(props: {
  tag: 'p' | 'h4' | 'blockquote';
  html?: string;
}) {
  if (!props.html) {
    return null;
  }
  const Component = props.tag;
  return (
    <Component>
      <CommentInlineHtml html={props.html} />
    </Component>
  );
}

function CommentRichTextListItem(props: {item: RichTextListItem}) {
  return (
    <li>
      {props.item.content && (
        <span>
          <CommentInlineHtml html={props.item.content} />
        </span>
      )}
      {props.item.items && props.item.items.length > 0 && (
        <ul>
          {props.item.items.map((item, index) => (
            <CommentRichTextListItem key={index} item={item} />
          ))}
        </ul>
      )}
    </li>
  );
}

/** Converts plain text to rich text data, one paragraph per blank line. */
export function richTextFromPlainText(value: string): RichTextData | null {
  if (!value.trim()) {
    return null;
  }
  return {
    blocks: value.split(/\n{2,}/).map((text) => ({
      type: 'paragraph',
      data: {text: escapeHtml(text).replace(/\n/g, '<br>')},
    })),
    time: Date.now(),
    version: 'plain-text',
  };
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
