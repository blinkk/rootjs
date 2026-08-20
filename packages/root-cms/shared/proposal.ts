/**
 * CMS change proposals: a reviewable, deterministic description of content
 * edits that an AI agent wants to make, serialized as YAML so it can be
 * committed to a repo and reviewed in a pull request before anything is
 * written to the database.
 *
 * The op vocabulary (`set` / `insert_item` / `remove_item`) is deliberately
 * identical to `DocEditOperation` in `core/ai-tools.ts`, so a change's `ops`
 * feed `applyDocEdits()` after a trivial mapping (see `toDocEditOperations`).
 *
 * These are pure functions with no Firebase or node dependency so they can run
 * on both the client and the server.
 *
 * Usage:
 * ```
 * const res = parseProposal(fs.readFileSync('proposal.yaml', 'utf8'));
 * if (!res.ok) {
 *   res.errors.forEach((err) => console.error(`${err.line}: ${err.message}`));
 *   return;
 * }
 * console.log(res.proposal.changes.length);
 * ```
 */
import {
  Document,
  Scalar,
  isMap,
  isNode,
  isScalar,
  isSeq,
  parseDocument,
  visit,
  type ParsedNode,
} from 'yaml';
import {z} from 'zod';

/** The only proposal format version understood by this module. */
export const PROPOSAL_VERSION = 1;

/** Change kinds a proposal can describe. */
export const PROPOSAL_CHANGE_KINDS = [
  'doc.edit',
  'doc.create',
  'doc.duplicate',
  'release.create',
  'release.update',
  'translations',
] as const;

export type ProposalChangeKind = (typeof PROPOSAL_CHANGE_KINDS)[number];

/**
 * A single edit operation within a change. Mirrors `DocEditOperation` from
 * `core/ai-tools.ts`, with `after` in place of `value` and an extra `before`
 * that exists purely so a human reviewer can see what is being replaced.
 */
export interface ProposalOp {
  op: 'set' | 'insert_item' | 'remove_item';
  /** Dotted path within the target object (no leading "fields." prefix). */
  path: string;
  /** Zero-based array index. Required for "remove_item", optional for "insert_item". */
  index?: number;
  /** The value to write ("set") or insert ("insert_item"). */
  after?: any;
  /**
   * The value as it stood when the proposal was written. Review-only: the
   * applier ignores it unless `verifyBefore` is explicitly enabled.
   */
  before?: any;
}

/** Edits to an existing doc's draft fields. */
export interface DocEditChange {
  kind: 'doc.edit';
  docId: string;
  /** Free-form rationale shown to the reviewer. */
  note?: string;
  ops: ProposalOp[];
}

/** Creation of a brand new doc with a complete set of fields. */
export interface DocCreateChange {
  kind: 'doc.create';
  docId: string;
  note?: string;
  after: Record<string, any>;
}

/** Duplication of an existing doc to a new slug. */
export interface DocDuplicateChange {
  kind: 'doc.duplicate';
  fromDocId: string;
  toDocId: string;
  note?: string;
}

/**
 * Creation or modification of a release. A release is just an object with
 * `description` / `docIds` / `dataSourceIds`, so it uses the same op
 * vocabulary as a doc.
 */
export interface ReleaseChange {
  kind: 'release.create' | 'release.update';
  releaseId: string;
  note?: string;
  ops: ProposalOp[];
}

/** A single source string and its proposed translations, keyed by locale. */
export interface TranslationsEntry {
  source: string;
  locales: Record<string, {before?: string | null; after: string}>;
}

/** Translation changes for one translations doc id. */
export interface TranslationsChange {
  kind: 'translations';
  translationsId: string;
  note?: string;
  entries: TranslationsEntry[];
}

export type ProposalChange =
  | DocEditChange
  | DocCreateChange
  | DocDuplicateChange
  | ReleaseChange
  | TranslationsChange;

/** A parsed change proposal. */
export interface Proposal {
  version: number;
  /** Stable id for the proposal, e.g. "2026-08-20-hero-refresh". */
  id: string;
  title?: string;
  /** CMS project id the proposal targets. Advisory only. */
  project?: string;
  /** ISO-8601 timestamp of when the proposal was generated. */
  generated?: string;
  author?: string;
  summary?: string;
  changes: ProposalChange[];
}

/** A structural or syntactic problem found while parsing a proposal. */
export interface ProposalParseError {
  /** 1-based line number in the source YAML, when known. */
  line?: number;
  /** Dotted path to the offending value, e.g. "changes.0.ops.1.path". */
  path: string;
  message: string;
  expected?: string;
  received?: any;
}

export type ParseProposalResult =
  | {ok: true; proposal: Proposal}
  | {ok: false; errors: ProposalParseError[]};

/**
 * Rejects YAML values that were coerced away from a string.
 *
 * YAML resolves bare scalars by type, so an unquoted title of `No`, `on`, or
 * `1.10` arrives here as `false`, `true`, or `1.1`. Silently stringifying those
 * would write the wrong content, so they are refused with a message that tells
 * the author to quote the value.
 */
const yamlString = (label: string) =>
  z.string({
    error: (issue) =>
      typeof issue.input === 'string'
        ? undefined
        : `${label} must be a string. YAML parsed it as ${describeType(
            issue.input
          )} — wrap the value in quotes or use a block scalar.`,
  });

const opSchema = z
  .object({
    op: z.enum(['set', 'insert_item', 'remove_item']),
    path: yamlString('`path`').min(1),
    index: z.number().int().min(0).optional(),
    after: z.any().optional(),
    before: z.any().optional(),
  })
  .superRefine((op, ctx) => {
    if (op.op === 'set' && op.after === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['after'],
        message: '`after` is required for a "set" op.',
      });
    }
    if (op.op === 'insert_item' && op.after === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['after'],
        message: '`after` is required for an "insert_item" op.',
      });
    }
    if (op.op === 'remove_item' && op.index === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['index'],
        message: '`index` is required for a "remove_item" op.',
      });
    }
  });

const docIdSchema = yamlString('`docId`').regex(
  /^[^/]+\/.+$/,
  'Doc id must be in the form "Collection/slug", e.g. "Pages/home".'
);

const changeSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('doc.edit'),
    docId: docIdSchema,
    note: yamlString('`note`').optional(),
    ops: z.array(opSchema).min(1),
  }),
  z.object({
    kind: z.literal('doc.create'),
    docId: docIdSchema,
    note: yamlString('`note`').optional(),
    after: z.record(z.string(), z.any()),
  }),
  z.object({
    kind: z.literal('doc.duplicate'),
    fromDocId: docIdSchema,
    toDocId: docIdSchema,
    note: yamlString('`note`').optional(),
  }),
  z.object({
    kind: z.literal('release.create'),
    releaseId: yamlString('`releaseId`').min(1),
    note: yamlString('`note`').optional(),
    ops: z.array(opSchema).min(1),
  }),
  z.object({
    kind: z.literal('release.update'),
    releaseId: yamlString('`releaseId`').min(1),
    note: yamlString('`note`').optional(),
    ops: z.array(opSchema).min(1),
  }),
  z.object({
    kind: z.literal('translations'),
    translationsId: yamlString('`translationsId`').min(1),
    note: yamlString('`note`').optional(),
    entries: z
      .array(
        z.object({
          source: yamlString('`source`').min(1),
          locales: z.record(
            z.string(),
            z.object({
              before: yamlString('`before`').nullable().optional(),
              after: yamlString('`after`'),
            })
          ),
        })
      )
      .min(1),
  }),
]);

const proposalSchema = z.object({
  version: z.literal(PROPOSAL_VERSION, {
    error: (issue) =>
      `Unsupported proposal version: ${JSON.stringify(
        issue.input
      )}. This version of root-cms understands version ${PROPOSAL_VERSION}.`,
  }),
  id: yamlString('`id`').min(1),
  title: yamlString('`title`').optional(),
  project: yamlString('`project`').optional(),
  generated: yamlString('`generated`').optional(),
  author: yamlString('`author`').optional(),
  summary: yamlString('`summary`').optional(),
  changes: z.array(changeSchema).min(1),
});

/**
 * Parses a YAML change proposal.
 *
 * Syntax errors are reported by the YAML parser with real line numbers;
 * structural errors come from the schema and are mapped back onto source lines
 * by walking the parsed document.
 */
export function parseProposal(yamlText: string): ParseProposalResult {
  let doc: Document.Parsed<ParsedNode>;
  try {
    doc = parseDocument(yamlText, {keepSourceTokens: false});
  } catch (err: any) {
    return {
      ok: false,
      errors: [{path: '', message: `Could not parse YAML: ${err.message}`}],
    };
  }

  if (doc.errors.length > 0) {
    return {
      ok: false,
      errors: doc.errors.map((err) => ({
        line: err.linePos?.[0]?.line,
        path: '',
        message: err.message,
      })),
    };
  }

  const data = doc.toJS({maxAliasCount: 100});
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    return {
      ok: false,
      errors: [
        {
          line: 1,
          path: '',
          message: 'A proposal must be a YAML mapping at the top level.',
          expected: 'mapping',
          received: describeType(data),
        },
      ],
    };
  }

  const result = proposalSchema.safeParse(data);
  if (!result.success) {
    const lines = buildLineIndex(doc, yamlText);
    return {
      ok: false,
      errors: result.error.issues.map((issue) => {
        const path = issue.path.map(String).join('.');
        return {
          line: lines.get(path) ?? lines.get(parentPath(path)),
          path,
          message: issue.message,
        };
      }),
    };
  }

  return {ok: true, proposal: result.data as Proposal};
}

/**
 * Serializes a proposal back to YAML.
 *
 * Deterministic by construction: keys are emitted in a fixed order, and every
 * string is quoted or written as a block scalar so it can never be re-read as a
 * boolean, number, or date. `parse -> serialize -> parse` is a fixed point.
 */
export function serializeProposal(proposal: Proposal): string {
  const doc = new Document(orderProposal(proposal));
  visit(doc, {
    Scalar(key, node) {
      // Only style values. Mapping keys stay bare so the file reads cleanly.
      if (key === 'key' || typeof node.value !== 'string') {
        return;
      }
      node.type = node.value.includes('\n')
        ? Scalar.BLOCK_LITERAL
        : Scalar.QUOTE_DOUBLE;
    },
  });
  return doc.toString({lineWidth: 0, singleQuote: false});
}

/**
 * Maps a change's ops onto the `DocEditOperation` shape that `applyDocEdits()`
 * consumes, dropping the review-only `before` values.
 */
export function toDocEditOperations(
  ops: ProposalOp[]
): Array<{op: string; path: string; value?: any; index?: number}> {
  return ops.map((op) => {
    const out: {op: string; path: string; value?: any; index?: number} = {
      op: op.op,
      path: op.path,
    };
    if (op.after !== undefined) {
      out.value = op.after;
    }
    if (op.index !== undefined) {
      out.index = op.index;
    }
    return out;
  });
}

/** Returns the doc ids a proposal creates (via `doc.create`/`doc.duplicate`). */
export function getProposedNewDocIds(proposal: Proposal): string[] {
  const ids: string[] = [];
  for (const change of proposal.changes) {
    if (change.kind === 'doc.create') {
      ids.push(change.docId);
    } else if (change.kind === 'doc.duplicate') {
      ids.push(change.toDocId);
    }
  }
  return ids;
}

/** Returns every doc id a proposal touches, in document order, deduped. */
export function getProposalDocIds(proposal: Proposal): string[] {
  const ids: string[] = [];
  for (const change of proposal.changes) {
    if (change.kind === 'doc.edit' || change.kind === 'doc.create') {
      ids.push(change.docId);
    } else if (change.kind === 'doc.duplicate') {
      ids.push(change.fromDocId, change.toDocId);
    }
  }
  return Array.from(new Set(ids));
}

/**
 * Rebuilds the proposal object with keys in a fixed order so that serializing
 * an unchanged proposal is byte-stable.
 */
function orderProposal(proposal: Proposal): Record<string, any> {
  const out: Record<string, any> = {version: proposal.version, id: proposal.id};
  for (const key of ['title', 'project', 'generated', 'author', 'summary']) {
    const value = (proposal as any)[key];
    if (value !== undefined) {
      out[key] = value;
    }
  }
  out.changes = proposal.changes.map((change) => orderChange(change));
  return out;
}

function orderChange(change: ProposalChange): Record<string, any> {
  const out: Record<string, any> = {kind: change.kind};
  switch (change.kind) {
    case 'doc.edit':
      out.docId = change.docId;
      break;
    case 'doc.create':
      out.docId = change.docId;
      break;
    case 'doc.duplicate':
      out.fromDocId = change.fromDocId;
      out.toDocId = change.toDocId;
      break;
    case 'release.create':
    case 'release.update':
      out.releaseId = change.releaseId;
      break;
    case 'translations':
      out.translationsId = change.translationsId;
      break;
  }
  if (change.note !== undefined) {
    out.note = change.note;
  }
  if (change.kind === 'doc.create') {
    out.after = change.after;
  } else if (change.kind === 'translations') {
    out.entries = change.entries.map((entry) => ({
      source: entry.source,
      locales: entry.locales,
    }));
  } else if (change.kind !== 'doc.duplicate') {
    out.ops = change.ops.map((op) => orderOp(op));
  }
  return out;
}

function orderOp(op: ProposalOp): Record<string, any> {
  const out: Record<string, any> = {op: op.op, path: op.path};
  if (op.index !== undefined) {
    out.index = op.index;
  }
  if ('before' in op) {
    out.before = op.before;
  }
  if (op.after !== undefined) {
    out.after = op.after;
  }
  return out;
}

/**
 * Walks the parsed YAML document and records the source line of every value,
 * keyed by its dotted path, so schema errors can point at a real line.
 */
function buildLineIndex(
  doc: Document.Parsed<ParsedNode>,
  source: string
): Map<string, number> {
  const lineStarts = buildLineStarts(source);
  const lines = new Map<string, number>();

  const walk = (node: unknown, path: string[]) => {
    if (!isNode(node) || !node.range) {
      return;
    }
    if (path.length > 0) {
      const dotted = path.join('.');
      if (!lines.has(dotted)) {
        lines.set(dotted, offsetToLine(lineStarts, node.range[0]));
      }
    }
    if (isSeq(node)) {
      node.items.forEach((item, i) => walk(item, [...path, String(i)]));
    } else if (isMap(node)) {
      for (const pair of node.items) {
        const key = isScalar(pair.key) ? pair.key.value : undefined;
        if (typeof key === 'string') {
          walk(pair.value, [...path, key]);
        }
      }
    }
  };

  walk(doc.contents, []);
  return lines;
}

/** Returns the byte offset at which each 1-based line starts. */
function buildLineStarts(source: string): number[] {
  const starts = [0];
  for (let i = 0; i < source.length; i++) {
    if (source[i] === '\n') {
      starts.push(i + 1);
    }
  }
  return starts;
}

/** Binary-searches `lineStarts` for the 1-based line containing `offset`. */
function offsetToLine(lineStarts: number[], offset: number): number {
  let lo = 0;
  let hi = lineStarts.length - 1;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (lineStarts[mid] <= offset) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }
  return lo + 1;
}

/** Drops the last segment of a dotted path. */
function parentPath(path: string): string {
  const index = path.lastIndexOf('.');
  return index === -1 ? '' : path.slice(0, index);
}

/** Human-readable type name used in error messages. */
function describeType(value: any): string {
  if (value === null) return 'null';
  if (value === undefined) return 'nothing';
  if (Array.isArray(value)) return 'a list';
  if (value instanceof Date) return 'a date';
  if (typeof value === 'boolean') return `the boolean ${value}`;
  if (typeof value === 'number') return `the number ${value}`;
  return `a ${typeof value}`;
}
