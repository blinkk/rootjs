/**
 * Block-level tags that may safely be dropped when they contain no visible
 * content. Table cells are intentionally excluded since removing them would
 * change the shape of the table.
 */
const BLOCK_TAGS = new Set([
  'ADDRESS',
  'BLOCKQUOTE',
  'DIV',
  'DL',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'LI',
  'OL',
  'P',
  'PRE',
  'SECTION',
  'UL',
]);

/**
 * Tags that render content on their own, i.e. an element containing any of
 * these is never considered blank even when it has no text.
 */
const EMBED_TAGS = [
  'audio',
  'canvas',
  'embed',
  'hr',
  'iframe',
  'img',
  'input',
  'object',
  'picture',
  'svg',
  'table',
  'video',
];

/** Whitespace, non-breaking spaces and zero-width characters. */
const BLANK_CHARS_RE = /[\s\u00a0\u200b-\u200d\u2060\ufeff]/g;

/** Selector matching elements that render content of their own. */
const EMBED_SELECTOR = EMBED_TAGS.join(',');

/** Returns true if the element renders no visible text. */
function isBlankText(el: Element): boolean {
  return (el.textContent || '').replace(BLANK_CHARS_RE, '').length === 0;
}

/**
 * Returns true if the element is a block-level element that renders nothing,
 * e.g. `<p></p>`, `<p><br></p>` or Google Docs' `<p><span>&nbsp;</span></p>`.
 */
function isBlankBlock(el: Element): boolean {
  if (!BLOCK_TAGS.has(el.tagName)) {
    return false;
  }
  if (el.querySelector(EMBED_SELECTOR)) {
    return false;
  }
  return isBlankText(el);
}

/**
 * Returns true if the `<br>` sits between block-level elements instead of
 * between inline text. Google Docs uses these to represent empty lines.
 */
function isStrayLineBreak(br: Element): boolean {
  const parent = br.parentElement;
  if (!parent) {
    return false;
  }
  return Array.from(parent.children).some(
    (child) => child !== br && BLOCK_TAGS.has(child.tagName)
  );
}

/**
 * Strips `text-decoration:underline` from elements inside `<a>` tags.
 * Google Docs formats links as:
 * `<a href="..." style="text-decoration:none;"><span style="...text-decoration:underline;...">text</span></a>`
 */
function cleanLinkUnderlines(doc: Document): boolean {
  let modified = false;
  doc.querySelectorAll('a [style]').forEach((el) => {
    if (!(el instanceof HTMLElement)) return;
    const style = el.style;
    if (
      style.textDecoration?.includes('underline') ||
      style.getPropertyValue('text-decoration')?.includes('underline')
    ) {
      style.removeProperty('text-decoration');
      style.removeProperty('text-decoration-skip-ink');
      style.removeProperty('-webkit-text-decoration-skip');
      modified = true;
    }
  });
  return modified;
}

/**
 * Strips `text-align` styles from all elements. The CMS rich text editor
 * doesn't currently support text alignment.
 */
function cleanTextAlign(doc: Document): boolean {
  let modified = false;
  doc.querySelectorAll('[style]').forEach((el) => {
    if (!(el instanceof HTMLElement)) return;
    if (el.style.textAlign) {
      el.style.removeProperty('text-align');
      modified = true;
    }
  });
  return modified;
}

/**
 * Removes blank paragraphs and stray line breaks used purely for vertical
 * spacing. Google Docs represents empty lines as `<br>` siblings of the
 * paragraphs, or as paragraphs containing nothing but an empty `<span>`, which
 * otherwise end up as a run of blank paragraphs in the editor.
 *
 * Pastes that contain nothing but blank content are left untouched so that
 * e.g. pasting a newline still inserts a newline.
 */
function cleanBlankParagraphs(doc: Document): boolean {
  const body = doc.body;
  if (!body) {
    return false;
  }
  // Leave blank-only pastes alone so that pasting a newline still inserts one.
  if (isBlankText(body) && !body.querySelector(EMBED_SELECTOR)) {
    return false;
  }

  let modified = false;

  Array.from(doc.querySelectorAll('br')).forEach((br) => {
    if (isStrayLineBreak(br)) {
      br.remove();
      modified = true;
    }
  });

  // Iterate depth-first so that a wrapper whose children were all removed is
  // itself removed (e.g. `<div><p><br></p></div>`).
  const walk = (el: Element) => {
    Array.from(el.children).forEach(walk);
    if (isBlankBlock(el)) {
      el.remove();
      modified = true;
    }
  };
  Array.from(body.children).forEach(walk);

  return modified;
}

/**
 * Cleans up pasted HTML in place to remove unsupported formatting and
 * excessive whitespace. Returns true if the document was modified.
 */
export function cleanPastedHtml(doc: Document): boolean {
  let modified = false;
  modified = cleanLinkUnderlines(doc) || modified;
  modified = cleanTextAlign(doc) || modified;
  modified = cleanBlankParagraphs(doc) || modified;
  return modified;
}
