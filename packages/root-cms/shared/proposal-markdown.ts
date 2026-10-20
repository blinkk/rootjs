/**
 * The Markdown format for CMS change proposals.
 *
 * It carries exactly the same data as the YAML format (see `proposal.ts`), but
 * is laid out for a human reviewing a pull request: each change and op is a
 * heading, notes and the summary are prose, and every `set` is a single
 * `diff` code block, so GitHub shows the removed and added lines in red and
 * green instead of two separate `before` and `after` blobs.
 *
 * ````md
 * # Refresh the homepage hero
 *
 * - **id:** `2026-08-20-hero-refresh`
 * - **version:** 1
 * - **author:** claude-code
 *
 * ## Summary
 *
 * Marketing asked for a benefit-led headline.
 *
 * ## Edit `Pages/home`
 *
 * Headline rewrite.
 *
 * ### Set `hero.title`
 *
 * ```diff text
 * -Welcome to Acme
 * +Build faster with Acme
 * ```
 *
 * ### Insert into `content.modules` at 2
 *
 * ```yaml
 * _type: "CalloutModule"
 * title: "Ships in minutes"
 * ```
 * ````
 *
 * A value block's info string names how its body is read: `text` (the body is
 * the string, verbatim), `yaml` or `json`. A `diff` block holds the full value
 * with every line prefixed by `" "` (in both), `"-"` (before only) or `"+"`
 * (after only), so both values can be rebuilt from it exactly. In a
 * `diff text` block with no before lines, `before` is `null`.
 *
 * Usage:
 * ```
 * const res = parseProposalMarkdown(fs.readFileSync('proposal.md', 'utf8'));
 * if (res.ok) {
 *   fs.writeFileSync('proposal.md', serializeProposalMarkdown(res.proposal));
 * }
 * ```
 */
import {Document, Scalar, parseDocument, visit} from 'yaml';
import {
  parseProposal,
  validateProposalData,
  type ParseProposalResult,
  type Proposal,
  type ProposalChange,
  type ProposalOp,
  type ProposalParseError,
} from './proposal.js';

/** How a value block's body is read. */
type ValueMode = 'text' | 'yaml' | 'json';

/** Metadata keys, in the order they are written. */
const METADATA_KEYS = [
  'id',
  'version',
  'project',
  'author',
  'generated',
] as const;

/** A heading, code block, or other line in the source. */
type Token =
  | {type: 'heading'; level: number; text: string; line: number}
  | {type: 'fence'; info: string; body: string[]; line: number}
  | {type: 'text'; text: string; line: number};

/** Matches a change's `##` heading and returns its kind and targets. */
const CHANGE_HEADINGS: Array<{
  kind: ProposalChange['kind'];
  pattern: RegExp;
  keys: string[];
}> = [
  {kind: 'doc.edit', pattern: /^Edit `([^`]+)`$/, keys: ['docId']},
  {
    kind: 'release.create',
    pattern: /^Create release `([^`]+)`$/,
    keys: ['releaseId'],
  },
  {
    kind: 'release.update',
    pattern: /^Update release `([^`]+)`$/,
    keys: ['releaseId'],
  },
  {kind: 'doc.create', pattern: /^Create `([^`]+)`$/, keys: ['docId']},
  {
    kind: 'doc.duplicate',
    pattern: /^Duplicate `([^`]+)` to `([^`]+)`$/,
    keys: ['fromDocId', 'toDocId'],
  },
  {
    kind: 'translations',
    pattern: /^Translations `([^`]+)`$/,
    keys: ['translationsId'],
  },
];

/** Matches an op's `###` heading. */
const OP_HEADINGS: Array<{op: ProposalOp['op']; pattern: RegExp}> = [
  {op: 'set', pattern: /^Set `([^`]+)`$/},
  {op: 'insert_item', pattern: /^Insert into `([^`]+)`(?: at (\d+))?$/},
  {op: 'remove_item', pattern: /^Remove from `([^`]+)` at (\d+)$/},
];

/**
 * Serializes a proposal as Markdown.
 *
 * Deterministic: serializing an unchanged proposal is byte-stable, and
 * `parse -> serialize -> parse` is a fixed point. The title, metadata values,
 * and ids are written on a single line, and the summary and notes are trimmed.
 */
export function serializeProposalMarkdown(proposal: Proposal): string {
  const out: string[] = [];
  if (proposal.title !== undefined) {
    out.push(`# ${singleLine(proposal.title)}`, '');
  }
  for (const key of METADATA_KEYS) {
    const value = proposal[key];
    if (value === undefined) {
      continue;
    }
    const text = singleLine(String(value));
    const formatted = key === 'id' || key === 'project' ? `\`${text}\`` : text;
    out.push(`- **${key}:** ${formatted}`);
  }
  out.push('');
  if (proposal.summary !== undefined) {
    out.push('## Summary', '', proposal.summary.trim(), '');
  }
  for (const change of proposal.changes) {
    out.push(...serializeChange(change));
  }
  return out.join('\n').replace(/\n+$/, '\n');
}

function serializeChange(change: ProposalChange): string[] {
  const out = [`## ${changeHeading(change)}`, ''];
  if (change.note !== undefined && change.note.trim()) {
    out.push(change.note.trim(), '');
  }
  switch (change.kind) {
    case 'doc.edit':
    case 'release.create':
    case 'release.update':
      for (const op of change.ops) {
        out.push(`### ${opHeading(op)}`, '');
        const block = serializeOpValue(op);
        if (block) {
          out.push(...block, '');
        }
      }
      break;
    case 'doc.create':
      out.push(...serializeValue(change.after), '');
      break;
    case 'translations':
      for (const entry of change.entries) {
        out.push('### Source', '', ...fence('text', entry.source.split('\n')));
        out.push('');
        for (const [locale, value] of Object.entries(entry.locales)) {
          out.push(`#### \`${locale}\``, '');
          out.push(
            ...(value.before !== undefined
              ? serializeDiff(value.before, value.after)
              : serializeValue(value.after)),
            ''
          );
        }
      }
      break;
  }
  return out;
}

function changeHeading(change: ProposalChange): string {
  switch (change.kind) {
    case 'doc.edit':
      return `Edit \`${change.docId}\``;
    case 'doc.create':
      return `Create \`${change.docId}\``;
    case 'doc.duplicate':
      return `Duplicate \`${change.fromDocId}\` to \`${change.toDocId}\``;
    case 'release.create':
      return `Create release \`${change.releaseId}\``;
    case 'release.update':
      return `Update release \`${change.releaseId}\``;
    case 'translations':
      return `Translations \`${change.translationsId}\``;
  }
}

function opHeading(op: ProposalOp): string {
  switch (op.op) {
    case 'set':
      return `Set \`${op.path}\``;
    case 'insert_item':
      return op.index === undefined
        ? `Insert into \`${op.path}\``
        : `Insert into \`${op.path}\` at ${op.index}`;
    case 'remove_item':
      return `Remove from \`${op.path}\` at ${op.index}`;
  }
}

/**
 * Returns an op's value block: a diff when it records both values, otherwise
 * the one it has (`before` for "remove_item", `after` for the rest).
 */
function serializeOpValue(op: ProposalOp): string[] | null {
  if (op.op === 'remove_item') {
    return op.before !== undefined ? serializeValue(op.before) : null;
  }
  if (op.before !== undefined) {
    return serializeDiff(op.before, op.after);
  }
  return serializeValue(op.after);
}

function serializeValue(value: any): string[] {
  if (typeof value === 'string') {
    return fence('text', value.split('\n'));
  }
  return fence('yaml', toYaml(value).split('\n'));
}

function serializeDiff(before: any, after: any): string[] {
  // Strings diff as plain text, unless `before` is something other than a
  // string or null (no lines).
  const isText =
    typeof after === 'string' &&
    (typeof before === 'string' || before === null);
  const toLines = (value: any) =>
    isText
      ? value === null
        ? []
        : value.split('\n')
      : toYaml(value).split('\n');
  const lines = diffLines(toLines(before), toLines(after)).map(
    ([prefix, line]) => (prefix === ' ' && line === '' ? '' : prefix + line)
  );
  return fence(isText ? 'diff text' : 'diff yaml', lines);
}

/**
 * Wraps lines in a code fence that is longer than any run of backticks inside
 * them, so content containing code fences can't close the block early.
 */
function fence(info: string, lines: string[]): string[] {
  let longest = 0;
  for (const line of lines) {
    for (const match of line.matchAll(/`+/g)) {
      longest = Math.max(longest, match[0].length);
    }
  }
  const ticks = '`'.repeat(Math.max(3, longest + 1));
  return [`${ticks}${info}`, ...lines, ticks];
}

/**
 * Writes a value as YAML with every string quoted or written as a block
 * scalar, so it can never be re-read as a boolean, number, or date.
 */
function toYaml(value: any): string {
  const doc = new Document(value);
  visit(doc, {
    Scalar(key, node) {
      if (key === 'key' || typeof node.value !== 'string') {
        return;
      }
      node.type = node.value.includes('\n')
        ? Scalar.BLOCK_LITERAL
        : Scalar.QUOTE_DOUBLE;
    },
  });
  return doc.toString({lineWidth: 0, singleQuote: false}).replace(/\n$/, '');
}

function singleLine(text: string): string {
  return text.replace(/\s*\n\s*/g, ' ').trim();
}

/**
 * Parses a Markdown change proposal.
 *
 * Errors carry the 1-based source line they were found on. Structural
 * problems (an unknown heading, a missing value block, a malformed diff) are
 * reported first; the assembled proposal is then checked against the same
 * schema as the YAML format.
 */
export function parseProposalMarkdown(markdown: string): ParseProposalResult {
  const parser = new MarkdownProposalParser(markdown);
  return parser.parse();
}

/**
 * Parses a proposal in the format its file extension names: `.md` (or
 * `.markdown`) files are Markdown, and anything else is read as YAML.
 */
export function parseProposalFile(
  text: string,
  filepath: string
): ParseProposalResult {
  return /\.(md|markdown)$/i.test(filepath)
    ? parseProposalMarkdown(text)
    : parseProposal(text);
}

class MarkdownProposalParser {
  private readonly source: string[];
  private readonly errors: ProposalParseError[] = [];
  /** Source line of every dotted path in the proposal, for schema errors. */
  private readonly lines = new Map<string, number>();
  private tokens: Token[] = [];
  private pos = 0;

  constructor(markdown: string) {
    this.source = markdown.replace(/\r\n?/g, '\n').split('\n');
  }

  parse(): ParseProposalResult {
    this.tokens = this.tokenize();
    const data: Record<string, any> = {};
    this.lines.set('', 1);
    this.parsePreamble(data);
    const changes: any[] = [];
    while (this.pos < this.tokens.length) {
      const heading = this.tokens[this.pos++] as Extract<
        Token,
        {type: 'heading'}
      >;
      if (heading.text === 'Summary') {
        if (data.summary !== undefined) {
          this.error(heading.line, 'summary', 'Duplicate "## Summary".');
        }
        this.lines.set('summary', heading.line);
        data.summary = this.readSummary(heading.line);
        continue;
      }
      const change = this.parseChange(heading, `changes.${changes.length}`);
      if (change) {
        changes.push(change);
      }
    }
    data.changes = changes;
    if (this.errors.length > 0) {
      return {ok: false, errors: this.errors};
    }
    return validateProposalData(data, () => this.lines);
  }

  /** Splits the source into headings, code blocks, and other lines. */
  private tokenize(): Token[] {
    const tokens: Token[] = [];
    for (let i = 0; i < this.source.length; i++) {
      const text = this.source[i];
      const line = i + 1;
      const open = text.match(/^ {0,3}(`{3,})([^`]*)$/);
      if (open) {
        const ticks = open[1].length;
        const body: string[] = [];
        let closed = false;
        while (++i < this.source.length) {
          const close = this.source[i].match(/^ {0,3}(`{3,})\s*$/);
          if (close && close[1].length >= ticks) {
            closed = true;
            break;
          }
          body.push(this.source[i]);
        }
        if (!closed) {
          this.error(line, '', 'Code block is never closed.');
        }
        tokens.push({type: 'fence', info: open[2].trim(), body, line});
        continue;
      }
      const heading = text.match(/^(#{1,6})\s+(.*?)\s*$/);
      if (heading) {
        tokens.push({
          type: 'heading',
          level: heading[1].length,
          text: heading[2],
          line,
        });
        continue;
      }
      tokens.push({type: 'text', text, line});
    }
    return tokens;
  }

  /** Reads the title and metadata list above the first `##` heading. */
  private parsePreamble(data: Record<string, any>) {
    while (this.pos < this.tokens.length && !this.isH2(this.tokens[this.pos])) {
      const token = this.tokens[this.pos++];
      if (token.type === 'heading' && token.level === 1) {
        if (data.title !== undefined) {
          this.error(token.line, 'title', 'Only one "#" title is allowed.');
        }
        data.title = token.text;
        this.lines.set('title', token.line);
        continue;
      }
      if (token.type === 'text') {
        if (!token.text.trim()) {
          continue;
        }
        const item = token.text.match(
          /^[-*]\s+(?:\*\*(\w+):\*\*|(\w+):)\s*(.*)$/
        );
        const key = item?.[1] ?? item?.[2];
        if (key && (METADATA_KEYS as readonly string[]).includes(key)) {
          if (data[key] !== undefined) {
            this.error(token.line, key, `Duplicate \`${key}\`.`);
          }
          const value = unwrapCode(item![3].trim());
          data[key] =
            key === 'version' && /^\d+$/.test(value) ? Number(value) : value;
          this.lines.set(key, token.line);
          continue;
        }
        if (key) {
          this.error(
            token.line,
            key,
            `Unknown metadata key \`${key}\`. Expected one of: ${METADATA_KEYS.join(', ')}.`
          );
          continue;
        }
      }
      this.error(
        token.line,
        '',
        'Unexpected content before the first section. Only a "#" title and a metadata list (e.g. "- **id:** `my-proposal`") may come first; put prose under "## Summary".'
      );
    }
    if (data.version === undefined) {
      this.error(1, 'version', 'Missing `version`, e.g. "- **version:** 1".');
    }
  }

  /** Returns the raw Markdown between the summary heading and the next `##`. */
  private readSummary(headingLine: number): string {
    let end = this.source.length;
    while (this.pos < this.tokens.length && !this.isH2(this.tokens[this.pos])) {
      this.pos++;
    }
    if (this.pos < this.tokens.length) {
      end = this.tokens[this.pos].line - 1;
    }
    return this.source.slice(headingLine, end).join('\n').trim();
  }

  private parseChange(
    heading: Extract<Token, {type: 'heading'}>,
    path: string
  ): Record<string, any> | null {
    const body = this.readUntil((token) => this.isH2(token));
    const match = CHANGE_HEADINGS.map((def) => ({
      def,
      m: heading.text.match(def.pattern),
    })).find(({m}) => m);
    if (!match) {
      this.error(
        heading.line,
        path,
        `Unknown section "## ${heading.text}". Expected "## Summary" or a change heading such as "## Edit \`Pages/home\`", "## Create \`Pages/new\`", "## Duplicate \`Pages/a\` to \`Pages/b\`", "## Create release \`id\`", "## Update release \`id\`", or "## Translations \`id\`".`
      );
      return null;
    }
    const {def, m} = match;
    const change: Record<string, any> = {kind: def.kind};
    this.lines.set(path, heading.line);
    def.keys.forEach((key, i) => {
      change[key] = m![i + 1];
    });

    // The note is the prose before the first `###` heading or code block.
    let i = 0;
    const noteLines: Array<Extract<Token, {type: 'text'}>> = [];
    while (i < body.length && body[i].type === 'text') {
      noteLines.push(body[i++] as Extract<Token, {type: 'text'}>);
    }
    const note = noteLines
      .map((token) => token.text)
      .join('\n')
      .trim();
    if (note) {
      change.note = note;
      const first = noteLines.find((token) => token.text.trim());
      this.lines.set(`${path}.note`, first!.line);
    }
    const rest = body.slice(i);

    switch (def.kind) {
      case 'doc.edit':
      case 'release.create':
      case 'release.update':
        change.ops = this.parseOps(rest, `${path}.ops`);
        break;
      case 'doc.create': {
        const fence = this.expectSingleFence(rest, `${path}.after`, heading);
        if (fence) {
          change.after = this.readValue(fence, `${path}.after`);
        }
        break;
      }
      case 'doc.duplicate':
        this.expectBlank(rest, path);
        for (const token of rest.filter((token) => token.type === 'fence')) {
          this.error(token.line, path, 'A duplicate takes no code block.');
        }
        break;
      case 'translations':
        change.entries = this.parseEntries(rest, `${path}.entries`);
        break;
    }
    return change;
  }

  private parseOps(tokens: Token[], path: string): any[] {
    const ops: any[] = [];
    for (const section of this.splitSections(tokens, 3, path)) {
      const opPath = `${path}.${ops.length}`;
      const {heading, body} = section;
      const def = OP_HEADINGS.map((d) => ({
        d,
        m: heading.text.match(d.pattern),
      })).find(({m}) => m);
      if (!def) {
        this.error(
          heading.line,
          opPath,
          `Unknown op "### ${heading.text}". Expected "### Set \`path\`", "### Insert into \`path\`", "### Insert into \`path\` at <index>", or "### Remove from \`path\` at <index>".`
        );
        continue;
      }
      this.lines.set(opPath, heading.line);
      const op: Record<string, any> = {op: def.d.op, path: def.m![1]};
      if (def.m![2] !== undefined) {
        op.index = Number(def.m![2]);
      }
      const fences = body.filter((token) => token.type === 'fence');
      this.expectBlank(body, opPath);
      if (fences.length > 1) {
        this.error(fences[1].line, opPath, 'An op takes one code block.');
      }
      const fence = fences[0] as Extract<Token, {type: 'fence'}> | undefined;
      if (!fence) {
        if (def.d.op !== 'remove_item') {
          this.error(
            heading.line,
            `${opPath}.after`,
            'Missing the value: add a code block (e.g. ```text, ```yaml, or ```diff text) under the heading.'
          );
        }
        ops.push(op);
        continue;
      }
      if (parseInfo(fence.info)?.diff) {
        const values = this.readDiff(fence, opPath);
        if (values) {
          op.before = values.before;
          op.after = values.after;
        }
      } else {
        const key = def.d.op === 'remove_item' ? 'before' : 'after';
        op[key] = this.readValue(fence, `${opPath}.${key}`);
      }
      ops.push(op);
    }
    return ops;
  }

  private parseEntries(tokens: Token[], path: string): any[] {
    const entries: any[] = [];
    for (const section of this.splitSections(tokens, 3, path)) {
      const entryPath = `${path}.${entries.length}`;
      const {heading, body} = section;
      if (heading.text !== 'Source') {
        this.error(
          heading.line,
          entryPath,
          `Unknown heading "### ${heading.text}". Each translation entry starts with "### Source".`
        );
        continue;
      }
      this.lines.set(entryPath, heading.line);
      const firstHeading = body.findIndex((token) => token.type === 'heading');
      const sourceTokens =
        firstHeading === -1 ? body : body.slice(0, firstHeading);
      const entry: Record<string, any> = {locales: {}};
      const sourceFence = this.expectSingleFence(
        sourceTokens,
        `${entryPath}.source`,
        heading
      );
      if (sourceFence) {
        entry.source = this.readValue(sourceFence, `${entryPath}.source`);
      }
      const localeTokens = firstHeading === -1 ? [] : body.slice(firstHeading);
      for (const locale of this.splitSections(localeTokens, 4, entryPath)) {
        const name = unwrapCode(locale.heading.text);
        const localePath = `${entryPath}.locales.${name}`;
        this.lines.set(localePath, locale.heading.line);
        const fence = this.expectSingleFence(
          locale.body,
          `${localePath}.after`,
          locale.heading
        );
        if (!fence) {
          continue;
        }
        if (parseInfo(fence.info)?.diff) {
          const values = this.readDiff(fence, localePath);
          if (values) {
            entry.locales[name] = values;
          }
        } else {
          entry.locales[name] = {
            after: this.readValue(fence, `${localePath}.after`),
          };
        }
      }
      entries.push(entry);
    }
    return entries;
  }

  /**
   * Splits tokens into sections that each start with a heading of `level`.
   * Anything before the first heading, or a heading of another level, is an
   * error.
   */
  private splitSections(
    tokens: Token[],
    level: number,
    path: string
  ): Array<{heading: Extract<Token, {type: 'heading'}>; body: Token[]}> {
    const sections: Array<{
      heading: Extract<Token, {type: 'heading'}>;
      body: Token[];
    }> = [];
    for (const token of tokens) {
      if (token.type === 'heading' && token.level === level) {
        sections.push({heading: token, body: []});
      } else if (
        sections.length > 0 &&
        !(token.type === 'heading' && token.level < level)
      ) {
        sections[sections.length - 1].body.push(token);
      } else if (token.type === 'fence') {
        this.error(
          token.line,
          path,
          `This code block needs a "${'#'.repeat(level)}" heading above it.`
        );
      } else if (token.type === 'heading') {
        this.error(token.line, path, `Unexpected heading "${token.text}".`);
      } else if (token.text.trim()) {
        this.error(token.line, path, 'Unexpected text.');
      }
    }
    return sections;
  }

  /** Expects exactly one code block, and nothing else but blank lines. */
  private expectSingleFence(
    tokens: Token[],
    path: string,
    heading: Extract<Token, {type: 'heading'}>
  ): Extract<Token, {type: 'fence'}> | null {
    const fences = tokens.filter(
      (token): token is Extract<Token, {type: 'fence'}> =>
        token.type === 'fence'
    );
    this.expectBlank(tokens, path);
    if (fences.length === 0) {
      this.error(heading.line, path, 'Missing a code block for the value.');
      return null;
    }
    if (fences.length > 1) {
      this.error(fences[1].line, path, 'Expected a single code block.');
    }
    return fences[0];
  }

  /** Reports any headings or non-blank text (code blocks are allowed). */
  private expectBlank(tokens: Token[], path: string) {
    for (const token of tokens) {
      if (token.type === 'heading') {
        this.error(token.line, path, `Unexpected heading "${token.text}".`);
      } else if (token.type === 'text' && token.text.trim()) {
        this.error(
          token.line,
          path,
          'Unexpected text. Notes go directly under the change heading, before the first op.'
        );
      }
    }
  }

  private readValue(fence: Extract<Token, {type: 'fence'}>, path: string): any {
    this.lines.set(path, fence.line);
    const info = parseInfo(fence.info);
    if (!info || info.diff) {
      this.error(
        fence.line,
        path,
        `Unknown code block type "${fence.info}". Use text, yaml, or json${info?.diff ? ' (a diff is only allowed for a value that records `before`)' : ''}.`
      );
      return undefined;
    }
    return this.decode(info.mode, fence.body, fence.line + 1, path);
  }

  /** Rebuilds the before and after values from a `diff` block. */
  private readDiff(
    fence: Extract<Token, {type: 'fence'}>,
    path: string
  ): {before: any; after: any} | null {
    this.lines.set(`${path}.before`, fence.line);
    this.lines.set(`${path}.after`, fence.line);
    const info = parseInfo(fence.info)!;
    const before: string[] = [];
    const after: string[] = [];
    let ok = true;
    fence.body.forEach((text, i) => {
      const prefix = text[0];
      const rest = text.slice(1);
      if (text === '') {
        before.push('');
        after.push('');
      } else if (prefix === ' ') {
        before.push(rest);
        after.push(rest);
      } else if (prefix === '-') {
        before.push(rest);
      } else if (prefix === '+') {
        after.push(rest);
      } else {
        ok = false;
        this.error(
          fence.line + 1 + i,
          path,
          'Each line of a diff must start with " " (unchanged), "-" (before), or "+" (after).'
        );
      }
    });
    if (!ok) {
      return null;
    }
    if (info.mode === 'text') {
      if (after.length === 0) {
        this.error(fence.line, `${path}.after`, 'The diff has no after lines.');
        return null;
      }
      return {
        before: before.length > 0 ? before.join('\n') : null,
        after: after.join('\n'),
      };
    }
    // Line numbers are only exact for lines in both values; good enough to
    // point at the block.
    return {
      before: this.decode(info.mode, before, fence.line + 1, `${path}.before`),
      after: this.decode(info.mode, after, fence.line + 1, `${path}.after`),
    };
  }

  private decode(
    mode: ValueMode,
    lines: string[],
    firstLine: number,
    path: string
  ): any {
    const text = lines.join('\n');
    if (mode === 'text') {
      return text;
    }
    if (mode === 'json') {
      try {
        return JSON.parse(text);
      } catch (err: any) {
        this.error(firstLine, path, `Invalid JSON: ${err.message}`);
        return undefined;
      }
    }
    const doc = parseDocument(text);
    if (doc.errors.length > 0) {
      for (const err of doc.errors) {
        const line = err.linePos?.[0]?.line;
        this.error(
          line ? firstLine + line - 1 : firstLine,
          path,
          `Invalid YAML: ${err.message}`
        );
      }
      return undefined;
    }
    return doc.toJS({maxAliasCount: 100});
  }

  /** Consumes tokens until `stop` matches (or the end), and returns them. */
  private readUntil(stop: (token: Token) => boolean): Token[] {
    const start = this.pos;
    while (this.pos < this.tokens.length && !stop(this.tokens[this.pos])) {
      this.pos++;
    }
    return this.tokens.slice(start, this.pos);
  }

  private isH2(token: Token): boolean {
    return token.type === 'heading' && token.level === 2;
  }

  private error(line: number, path: string, message: string) {
    this.errors.push({line, path, message});
  }
}

/** Parses a code block info string like "yaml" or "diff text". */
function parseInfo(info: string): {diff: boolean; mode: ValueMode} | null {
  const words = info.split(/\s+/).filter(Boolean);
  const diff = words[0] === 'diff';
  const lang = diff ? (words[1] ?? 'yaml') : words[0];
  const mode = lang === 'yml' ? 'yaml' : lang;
  if (mode !== 'text' && mode !== 'yaml' && mode !== 'json') {
    return null;
  }
  return {diff, mode};
}

/** Strips a single pair of backticks wrapping the whole value. */
function unwrapCode(text: string): string {
  const match = text.match(/^`([^`]*)`$/);
  return match ? match[1] : text;
}

/**
 * Returns a line diff of `a` -> `b` as `[prefix, line]` pairs, where the
 * prefix is " " (in both), "-" (only in `a`), or "+" (only in `b`).
 *
 * Uses Myers' algorithm after trimming the common prefix and suffix, which is
 * where most of a proposal's unchanged lines are.
 */
export function diffLines(
  a: string[],
  b: string[]
): Array<[' ' | '-' | '+', string]> {
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) {
    start++;
  }
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  return [
    ...a.slice(0, start).map((line): [' ', string] => [' ', line]),
    ...myersDiff(a.slice(start, endA), b.slice(start, endB)),
    ...a.slice(endA).map((line): [' ', string] => [' ', line]),
  ];
}

function myersDiff(a: string[], b: string[]): Array<[' ' | '-' | '+', string]> {
  const n = a.length;
  const m = b.length;
  const max = n + m;
  if (max === 0) {
    return [];
  }
  // `v[k + max]` is the furthest x reached on diagonal k. `trace[d]` is `v`
  // as it stood before step d, for backtracking.
  const v = new Int32Array(2 * max + 2);
  const trace: Int32Array[] = [];
  let found = -1;
  for (let d = 0; d <= max && found === -1; d++) {
    trace.push(v.slice());
    for (let k = -d; k <= d; k += 2) {
      let x =
        k === -d || (k !== d && v[k - 1 + max] < v[k + 1 + max])
          ? v[k + 1 + max]
          : v[k - 1 + max] + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) {
        x++;
        y++;
      }
      v[k + max] = x;
      if (x >= n && y >= m) {
        found = d;
        break;
      }
    }
  }

  const out: Array<[' ' | '-' | '+', string]> = [];
  let x = n;
  let y = m;
  for (let d = found; d > 0; d--) {
    const prev = trace[d];
    const k = x - y;
    const prevK =
      k === -d || (k !== d && prev[k - 1 + max] < prev[k + 1 + max])
        ? k + 1
        : k - 1;
    const prevX = prev[prevK + max];
    const prevY = prevX - prevK;
    while (x > prevX && y > prevY) {
      out.push([' ', a[--x]]);
      y--;
    }
    if (x === prevX) {
      out.push(['+', b[--y]]);
    } else {
      out.push(['-', a[--x]]);
    }
  }
  while (x > 0 && y > 0) {
    out.push([' ', a[--x]]);
    y--;
  }
  return out.reverse();
}
