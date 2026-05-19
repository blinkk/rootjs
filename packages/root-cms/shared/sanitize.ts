import sanitizeHtml, {type IOptions} from 'sanitize-html';

const INLINE_TAGS = [
  'a',
  'b',
  'strong',
  'i',
  'em',
  'u',
  's',
  'del',
  'code',
  'span',
  'br',
  'sub',
  'sup',
  'mark',
  'small',
];

const BLOCK_TAGS = [
  ...INLINE_TAGS,
  'p',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'ul',
  'ol',
  'li',
  'blockquote',
  'pre',
  'hr',
  'table',
  'thead',
  'tbody',
  'tfoot',
  'tr',
  'th',
  'td',
  'caption',
  'figure',
  'figcaption',
  'img',
  'div',
];

const ALLOWED_ATTRIBUTES: Record<string, string[]> = {
  a: ['href', 'title', 'target', 'rel', 'id'],
  span: ['class'],
  code: ['class'],
  pre: ['class'],
  th: ['align', 'scope', 'colspan', 'rowspan'],
  td: ['align', 'colspan', 'rowspan'],
  img: ['src', 'alt', 'title', 'width', 'height'],
};

const COMMON_OPTIONS: IOptions = {
  allowedSchemes: ['http', 'https', 'mailto'],
  allowedSchemesByTag: {
    img: ['http', 'https', 'data'],
  },
  allowProtocolRelative: false,
  transformTags: {
    a: (tagName, attribs) => {
      const next = {...attribs};
      if (next.target === '_blank') {
        next.rel = 'noopener noreferrer';
      }
      return {tagName, attribs: next};
    },
  },
};

/**
 * Sanitizes a string of HTML intended for inline formatting contexts
 * (paragraph text, list items, headings). Strips scripts, event handlers
 * and unsafe URL schemes; allows only inline formatting tags.
 */
export function sanitizeInlineHtml(html: string): string {
  if (!html) {
    return '';
  }
  return sanitizeHtml(html, {
    ...COMMON_OPTIONS,
    allowedTags: INLINE_TAGS,
    allowedAttributes: ALLOWED_ATTRIBUTES,
  });
}

/**
 * Sanitizes a string of HTML intended for block contexts (markdown output,
 * arbitrary HTML blocks). Permits block-level structure (lists, tables,
 * headings) in addition to inline formatting.
 */
export function sanitizeBlockHtml(html: string): string {
  if (!html) {
    return '';
  }
  return sanitizeHtml(html, {
    ...COMMON_OPTIONS,
    allowedTags: BLOCK_TAGS,
    allowedAttributes: ALLOWED_ATTRIBUTES,
  });
}
