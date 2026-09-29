/**
 * Renders the small subset of markdown used in doc comments and CLI help text:
 * paragraphs, fenced code blocks, `inline code`, [links](url) and
 * `{@link Name}`. Text is rendered as nodes, never as raw HTML.
 */
export function Markdown(props: {text: string; className?: string}) {
  const blocks = parseBlocks(props.text || '');
  if (blocks.length === 0) {
    return null;
  }
  return (
    <div className={props.className}>
      {blocks.map((block) =>
        block.type === 'code' ? (
          <pre>
            <code>{block.text}</code>
          </pre>
        ) : (
          <p>{renderInline(block.text)}</p>
        )
      )}
    </div>
  );
}

type Block = {type: 'code' | 'paragraph'; text: string};

function parseBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  const parts = text.split(/```[\w-]*\n?/);
  parts.forEach((part, i) => {
    // Odd parts are inside a code fence.
    if (i % 2 === 1) {
      if (part.trim()) {
        blocks.push({type: 'code', text: part.replace(/\n$/, '')});
      }
      return;
    }
    for (const paragraph of part.split(/\n\s*\n/)) {
      const value = paragraph.replace(/\s*\n\s*/g, ' ').trim();
      if (value) {
        blocks.push({type: 'paragraph', text: value});
      }
    }
  });
  return blocks;
}

const INLINE_PATTERN =
  /`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)|\{@link\s+([^}|\s]+)(?:\s*\|?\s*([^}]*))?\}/g;

function renderInline(text: string) {
  const nodes: Array<string | preact.JSX.Element> = [];
  let lastIndex = 0;
  for (const match of text.matchAll(INLINE_PATTERN)) {
    nodes.push(text.slice(lastIndex, match.index));
    const [, code, linkText, linkHref, linkTarget, linkLabel] = match;
    if (code) {
      nodes.push(<code>{code}</code>);
    } else if (linkText && isSafeUrl(linkHref)) {
      nodes.push(<a href={linkHref}>{linkText}</a>);
    } else if (linkText) {
      nodes.push(linkText);
    } else if (linkTarget) {
      nodes.push(<code>{linkLabel?.trim() || linkTarget}</code>);
    }
    lastIndex = (match.index || 0) + match[0].length;
  }
  nodes.push(text.slice(lastIndex));
  return nodes;
}

function isSafeUrl(url: string) {
  return /^(https?:\/\/|\/|#)/.test(url);
}
