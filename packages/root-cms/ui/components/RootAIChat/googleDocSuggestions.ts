/**
 * Renders Google Docs API `Document` resources for the Root AI Google tools:
 * as markdown (optionally with suggested edits marked inline), and as a list
 * of the doc's suggested edits with their surrounding text.
 *
 * The Docs API returns a document with suggestions applied, rejected or
 * inline depending on `suggestionsViewMode`. In inline mode, text runs carry
 * `suggestedInsertionIds` / `suggestedDeletionIds` (and formatting
 * suggestions `suggestedTextStyleChanges`), keyed by suggestion id. The API
 * does not report who made a suggestion.
 */
import type {GoogleDocSuggestion} from '../../../core/ai-tools-google.js';

/** Number of unchanged characters kept on each side of a suggestion. */
const CONTEXT_RADIUS = 300;

/** A tab of a document, flattened out of the (nested) tab tree. */
interface DocTab {
  title: string;
  /** A `DocumentTab` (or the `Document` itself for single-tab responses). */
  content: any;
}

/** Lists a document's tabs in reading order, including child tabs. */
function flattenTabs(document: any): DocTab[] {
  const tabs: DocTab[] = [];
  const visit = (list: any[] | undefined) => {
    for (const tab of list || []) {
      if (tab?.documentTab) {
        tabs.push({
          title: String(tab.tabProperties?.title || ''),
          content: tab.documentTab,
        });
      }
      visit(tab?.childTabs);
    }
  };
  visit(document?.tabs);
  if (tabs.length === 0) {
    tabs.push({title: String(document?.title || ''), content: document});
  }
  return tabs;
}

/** Heading level (1-6) of a paragraph, or 0 for body text. */
function headingLevel(paragraph: any): number {
  const style = String(paragraph?.paragraphStyle?.namedStyleType || '');
  if (style === 'TITLE') {
    return 1;
  }
  const match = style.match(/^HEADING_([1-6])$/);
  return match ? Number(match[1]) : 0;
}

/** Whether a bullet's list level is numbered (vs. a glyph like "●"). */
function isOrderedList(lists: any, bullet: any): boolean {
  const level =
    lists?.[bullet?.listId]?.listProperties?.nestingLevels?.[
      Number(bullet?.nestingLevel || 0)
    ];
  const glyphType = String(level?.glyphType || '');
  return Boolean(
    glyphType && glyphType !== 'GLYPH_TYPE_UNSPECIFIED' && glyphType !== 'NONE'
  );
}

/** Normalizes run text: drops the paragraph mark, keeps soft line breaks. */
function cleanText(text: string): string {
  return text.replace(/\n/g, '').split('\u000b').join('\n');
}

/** A piece of paragraph text and whether it is a suggested edit. */
interface RunPiece {
  text: string;
  kind: 'plain' | 'insertion' | 'deletion';
}

/** Converts a paragraph element to text, rendering links as markdown. */
function elementToText(element: any): string {
  const run = element?.textRun;
  if (run) {
    const text = cleanText(String(run.content || ''));
    const url = run.textStyle?.link?.url;
    const match = url ? text.match(/^(\s*)([\s\S]*?)(\s*)$/) : null;
    return match && match[2]
      ? `${match[1]}[${match[2]}](${url})${match[3]}`
      : text;
  }
  if (element?.person) {
    const props = element.person.personProperties || {};
    return String(props.name || props.email || '');
  }
  if (element?.richLink) {
    const props = element.richLink.richLinkProperties || {};
    return props.uri ? `[${props.title || props.uri}](${props.uri})` : '';
  }
  return '';
}

/** Suggestion ids an element is inserted or deleted by. */
function suggestionIds(element: any): {ins: string[]; del: string[]} {
  const source = element?.textRun || element?.person || element?.richLink;
  return {
    ins: source?.suggestedInsertionIds || [],
    del: source?.suggestedDeletionIds || [],
  };
}

/**
 * Renders a paragraph's text. With `inline`, suggested insertions and
 * deletions are wrapped in CriticMarkup (`{++added++}`, `{--removed--}`).
 */
function renderParagraphText(paragraph: any, inline: boolean): string {
  const pieces: RunPiece[] = [];
  for (const element of paragraph?.elements || []) {
    const text = elementToText(element);
    if (!text) {
      continue;
    }
    const {ins, del} = suggestionIds(element);
    const kind: RunPiece['kind'] = !inline
      ? 'plain'
      : del.length > 0
        ? 'deletion'
        : ins.length > 0
          ? 'insertion'
          : 'plain';
    const last = pieces[pieces.length - 1];
    if (last && last.kind === kind) {
      last.text += text;
    } else {
      pieces.push({text, kind});
    }
  }
  return pieces
    .map((piece) =>
      piece.kind === 'insertion'
        ? `{++${piece.text}++}`
        : piece.kind === 'deletion'
          ? `{--${piece.text}--}`
          : piece.text
    )
    .join('');
}

interface RenderContext {
  lists: any;
  inline: boolean;
}

/** A rendered block; consecutive list items are joined without a gap. */
interface Block {
  text: string;
  listItem: boolean;
}

function renderContent(content: any[] | undefined, ctx: RenderContext): string {
  const blocks: Block[] = [];
  for (const element of content || []) {
    if (element?.paragraph) {
      const paragraph = element.paragraph;
      const text = renderParagraphText(paragraph, ctx.inline);
      if (!text.trim()) {
        continue;
      }
      const level = headingLevel(paragraph);
      if (paragraph.bullet) {
        const indent = '  '.repeat(Number(paragraph.bullet.nestingLevel || 0));
        const marker = isOrderedList(ctx.lists, paragraph.bullet) ? '1.' : '-';
        blocks.push({text: `${indent}${marker} ${text}`, listItem: true});
      } else if (level > 0) {
        blocks.push({text: `${'#'.repeat(level)} ${text}`, listItem: false});
      } else {
        blocks.push({text, listItem: false});
      }
    } else if (element?.table) {
      const table = renderTable(element.table, ctx);
      if (table) {
        blocks.push({text: table, listItem: false});
      }
    }
  }
  return blocks
    .map((block, i) =>
      i === 0
        ? block.text
        : `${block.listItem && blocks[i - 1].listItem ? '\n' : '\n\n'}${block.text}`
    )
    .join('');
}

/** Renders a table as a markdown table (the first row is the header). */
function renderTable(table: any, ctx: RenderContext): string {
  const rows: string[][] = (table?.tableRows || []).map((row: any) =>
    (row?.tableCells || []).map((cell: any) =>
      renderContent(cell?.content, ctx)
        .replace(/\s*\n+\s*/g, ' ')
        .replace(/\|/g, '\\|')
        .trim()
    )
  );
  if (rows.length === 0) {
    return '';
  }
  const width = Math.max(...rows.map((row) => row.length));
  const line = (cells: string[]) =>
    `| ${Array.from({length: width}, (_, i) => cells[i] || '').join(' | ')} |`;
  return [
    line(rows[0]),
    line(Array.from({length: width}, () => '---')),
    ...rows.slice(1).map(line),
  ].join('\n');
}

/**
 * Renders a Docs API `Document` as markdown: headings, (nested) lists, links
 * and tables. Multi-tab documents get a top-level heading per tab. Pass
 * `inline: true` for a document fetched with `SUGGESTIONS_INLINE` to mark
 * suggested insertions and deletions with CriticMarkup.
 */
export function renderDocMarkdown(
  document: any,
  options?: {inline?: boolean}
): string {
  const inline = Boolean(options?.inline);
  const tabs = flattenTabs(document);
  const rendered = tabs.map((tab) =>
    renderContent(tab.content?.body?.content, {
      lists: tab.content?.lists || {},
      inline,
    })
  );
  if (tabs.length === 1) {
    return rendered[0];
  }
  return tabs
    .map((tab, i) => `# ${tab.title || `Tab ${i + 1}`}\n\n${rendered[i]}`)
    .join('\n\n');
}

/** A text element of a paragraph and the suggestions that touch it. */
interface SuggestionRun {
  text: string;
  ins: string[];
  del: string[];
  /** Ids of formatting suggestions on this run. */
  fmt: string[];
}

interface SuggestionEntry {
  id: string;
  inserted: string;
  deleted: string;
  formatted: string;
  before: string[];
  after: string[];
  section?: string;
  tab?: string;
}

/**
 * Trims `before`/`after` to the changed region plus `CONTEXT_RADIUS`
 * characters on each side, marking cut text with "…".
 */
export function trimToChange(
  before: string,
  after: string,
  radius = CONTEXT_RADIUS
): {before: string; after: string} {
  let prefix = 0;
  while (
    prefix < before.length &&
    prefix < after.length &&
    before[prefix] === after[prefix]
  ) {
    prefix += 1;
  }
  let suffix = 0;
  while (
    suffix < before.length - prefix &&
    suffix < after.length - prefix &&
    before[before.length - 1 - suffix] === after[after.length - 1 - suffix]
  ) {
    suffix += 1;
  }
  const start = Math.max(0, prefix - radius);
  const cut = (text: string) => {
    const end = Math.min(text.length, text.length - suffix + radius);
    return `${start > 0 ? '…' : ''}${text.slice(start, end)}${
      end < text.length ? '…' : ''
    }`;
  };
  return {before: cut(before), after: cut(after)};
}

/**
 * Lists the suggested edits in a Docs API `Document` fetched with
 * `suggestionsViewMode=SUGGESTIONS_INLINE`, in document order. Each
 * suggestion includes the text it inserts and/or deletes, plus the affected
 * paragraph(s) before and after applying just that suggestion (other pending
 * suggestions are left out of both).
 */
export function extractDocSuggestions(document: any): GoogleDocSuggestion[] {
  const entries = new Map<string, SuggestionEntry>();
  const tabs = flattenTabs(document);

  const visitParagraph = (paragraph: any, tab: string, section: string) => {
    const runs: SuggestionRun[] = (paragraph?.elements || []).map(
      (element: any) => {
        const {ins, del} = suggestionIds(element);
        return {
          text: elementToText(element),
          ins,
          del,
          fmt: Object.keys(element?.textRun?.suggestedTextStyleChanges || {}),
        };
      }
    );
    const paragraphFmt = [
      ...Object.keys(paragraph?.suggestedParagraphStyleChanges || {}),
      ...Object.keys(paragraph?.suggestedBulletChanges || {}),
    ];
    const ids = new Set<string>(paragraphFmt);
    for (const run of runs) {
      [...run.ins, ...run.del, ...run.fmt].forEach((id) => ids.add(id));
    }
    if (ids.size === 0) {
      return;
    }
    // The original text drops every suggested insertion.
    const original = runs
      .filter((run) => run.ins.length === 0)
      .map((run) => run.text)
      .join('');
    for (const id of ids) {
      let entry = entries.get(id);
      if (!entry) {
        entry = {
          id,
          inserted: '',
          deleted: '',
          formatted: '',
          before: [],
          after: [],
          ...(section ? {section} : {}),
          ...(tab ? {tab} : {}),
        };
        entries.set(id, entry);
      }
      for (const run of runs) {
        if (run.ins.includes(id)) {
          entry.inserted += run.text;
        }
        if (run.del.includes(id)) {
          entry.deleted += run.text;
        }
        if (run.fmt.includes(id)) {
          entry.formatted += run.text;
        }
      }
      if (paragraphFmt.includes(id)) {
        entry.formatted += original;
      }
      entry.before.push(original);
      entry.after.push(
        runs
          .filter(
            (run) =>
              (run.ins.length === 0 || run.ins.includes(id)) &&
              !run.del.includes(id)
          )
          .map((run) => run.text)
          .join('')
      );
    }
  };

  const visitContent = (content: any[] | undefined, tab: string) => {
    let section = '';
    const walk = (elements: any[] | undefined) => {
      for (const element of elements || []) {
        if (element?.paragraph) {
          if (headingLevel(element.paragraph) > 0) {
            section = renderParagraphText(
              {
                elements: (element.paragraph.elements || []).filter(
                  (el: any) => suggestionIds(el).ins.length === 0
                ),
              },
              false
            ).trim();
          }
          visitParagraph(element.paragraph, tab, section);
        } else if (element?.table) {
          for (const row of element.table.tableRows || []) {
            for (const cell of row?.tableCells || []) {
              walk(cell?.content);
            }
          }
        }
      }
    };
    walk(content);
  };

  for (const tab of tabs) {
    visitContent(tab.content?.body?.content, tabs.length > 1 ? tab.title : '');
  }

  return Array.from(entries.values()).map((entry) => {
    const context = trimToChange(
      entry.before.join('\n'),
      entry.after.join('\n')
    );
    const type: GoogleDocSuggestion['type'] =
      entry.inserted && entry.deleted
        ? 'replacement'
        : entry.inserted
          ? 'insertion'
          : entry.deleted
            ? 'deletion'
            : 'formatting';
    return {
      suggestionId: entry.id,
      type,
      ...(entry.inserted ? {insertedText: entry.inserted} : {}),
      ...(entry.deleted ? {deletedText: entry.deleted} : {}),
      ...(type === 'formatting' && entry.formatted
        ? {formattedText: entry.formatted}
        : {}),
      before: context.before,
      after: context.after,
      ...(entry.section ? {section: entry.section} : {}),
      ...(entry.tab ? {tab: entry.tab} : {}),
    };
  });
}
