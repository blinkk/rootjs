import './CommentBody.css';

import {
  RichTextBlock,
  RichTextData,
  RichTextListItem,
} from '../../../shared/richtext.js';
import {sanitizeInlineHtml} from '../../../shared/sanitize.js';
import {joinClassNames} from '../../utils/classes.js';
import {Markdown} from '../Markdown/Markdown.js';

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
      className={joinClassNames(
        'CommentBody',
        props.deleted && 'CommentBody--deleted',
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
 * Decorates sanitized comment HTML: `@mention` links get a marker class and
 * non-CMS links get `target="_blank"` and an external-link marker class so
 * they bypass SPA navigation.
 */
function decorateCommentHtml(html: string) {
  if (!html.includes('<a')) {
    return html;
  }
  const template = document.createElement('template');
  template.innerHTML = html;
  template.content.querySelectorAll('a[href]').forEach((link) => {
    if (link.hasAttribute('data-mention')) {
      link.classList.add('CommentBody__mention');
      link.setAttribute('title', link.getAttribute('data-mention') || '');
      return;
    }
    const href = link.getAttribute('href') || '';
    if (href.startsWith('#') || isCmsInternalUrl(href)) {
      return;
    }
    link.setAttribute('target', '_blank');
    link.setAttribute('rel', 'noopener noreferrer');
    link.classList.add('CommentBody__externalLink');
  });
  return template.innerHTML;
}

/** Renders `RichTextData` as read-only HTML. */
export function CommentRichText(props: {
  className?: string;
  data: RichTextData;
}) {
  return (
    <div className={props.className}>
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
    <Component
      dangerouslySetInnerHTML={{
        __html: decorateCommentHtml(sanitizeInlineHtml(props.html)),
      }}
    />
  );
}

function CommentRichTextListItem(props: {item: RichTextListItem}) {
  return (
    <li>
      {props.item.content && (
        <span
          dangerouslySetInnerHTML={{
            __html: decorateCommentHtml(sanitizeInlineHtml(props.item.content)),
          }}
        />
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
