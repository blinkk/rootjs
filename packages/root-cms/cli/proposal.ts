import fs from 'node:fs';
import {parseProposal, type Proposal} from '../shared/proposal.js';

export interface ProposalApplyCliOptions {
  /** Skip validating resolved fields against the collection schema. */
  skipValidation?: boolean;
  /** Resolve and validate everything, but write nothing. */
  dryRun?: boolean;
  /** Fail if a recorded `before` no longer matches the live value. */
  verifyBefore?: boolean;
  /** Email attributed as the author of the writes. */
  modifiedBy?: string;
}

/**
 * Parses a proposal file and checks it against the proposal format, without
 * touching the database.
 *
 * This validates the *proposal's own* structure, not the CMS collection
 * schemas — that needs db access and happens in `proposal.diff`/`.apply`.
 * Prints a JSON envelope to stdout and exits non-zero on failure, so it works
 * as a CI gate on a pull request that adds or edits a proposal.
 *
 * Usage:
 *   root-cms proposal.check cms-proposals/hero-refresh.yaml
 */
export async function proposalCheck(filepath: string) {
  try {
    const proposal = readProposal(filepath);
    writeEnvelope({
      ok: true,
      result: {
        id: proposal.id,
        version: proposal.version,
        changes: proposal.changes.map((change, i) => ({
          index: i,
          kind: change.kind,
          target: describeTarget(change),
        })),
      },
    });
  } catch (err: any) {
    writeEnvelope({ok: false, error: err.message});
    process.exitCode = 1;
  }
}

/**
 * Resolves a proposal against the live database and reports what it would
 * write, without writing anything.
 *
 * Usage:
 *   root-cms proposal.diff cms-proposals/hero-refresh.yaml
 */
export async function proposalDiff(
  filepath: string,
  options?: ProposalApplyCliOptions
) {
  await runApply(filepath, {...options, dryRun: true});
}

/**
 * Applies a proposal to the database.
 *
 * Only writes drafts, release contents, and draft translations — never
 * publishes, schedules, or deletes. Nothing is written unless every change in
 * the proposal resolves cleanly.
 *
 * Usage:
 *   root-cms proposal.apply cms-proposals/hero-refresh.yaml
 *   root-cms proposal.apply cms-proposals/hero-refresh.yaml --dry-run
 *   root-cms proposal.apply cms-proposals/hero-refresh.yaml --verify-before
 */
export async function proposalApply(
  filepath: string,
  options?: ProposalApplyCliOptions
) {
  await runApply(filepath, options);
}

/** Shared implementation behind `proposal.diff` and `proposal.apply`. */
async function runApply(filepath: string, options?: ProposalApplyCliOptions) {
  try {
    const proposal = readProposal(filepath);
    // Loaded lazily so `proposal.check` stays a pure parser that needs neither
    // a Root project nor Firebase credentials.
    const [{loadRootConfig}, {RootCMSClient}, {applyProposal}] =
      await Promise.all([
        import('@blinkk/root/node'),
        import('../core/client.js'),
        import('../core/proposal-apply.js'),
      ]);
    const rootDir = process.cwd();
    const rootConfig = await loadRootConfig(rootDir, {command: 'root-cms'});
    const client = new RootCMSClient(rootConfig);
    const res = await applyProposal(client, proposal, {
      dryRun: options?.dryRun,
      verifyBefore: options?.verifyBefore,
      skipValidation: options?.skipValidation,
      modifiedBy: options?.modifiedBy,
    });
    if (!res.ok) {
      writeEnvelope({
        ok: false,
        error: `${res.errors.length} change(s) could not be applied; nothing was written.`,
        errors: res.errors,
      });
      process.exitCode = 1;
      return;
    }
    writeEnvelope({
      ok: true,
      result: {
        id: proposal.id,
        dryRun: res.dryRun,
        changes: res.changes,
      },
    });
  } catch (err: any) {
    writeEnvelope({ok: false, error: err.message});
    process.exitCode = 1;
  }
}

/** Reads and parses a proposal file, throwing a readable error on failure. */
function readProposal(filepath: string): Proposal {
  if (!filepath) {
    throw new Error('a proposal filepath is required');
  }
  if (!fs.existsSync(filepath)) {
    throw new Error(`file not found: ${filepath}`);
  }
  const res = parseProposal(fs.readFileSync(filepath, 'utf8'));
  if (!res.ok) {
    const details = res.errors
      .map((err) => {
        const where = err.line ? `${filepath}:${err.line}` : filepath;
        const at = err.path ? ` (${err.path})` : '';
        return `  ${where}${at}: ${err.message}`;
      })
      .join('\n');
    throw new Error(`invalid proposal:\n${details}`);
  }
  return res.proposal;
}

/** Short label identifying what a change targets. */
function describeTarget(change: Proposal['changes'][number]): string {
  if ('docId' in change) return change.docId;
  if ('toDocId' in change) return `${change.fromDocId} -> ${change.toDocId}`;
  if ('releaseId' in change) return change.releaseId;
  if ('translationsId' in change) return change.translationsId;
  return '';
}

/** Writes a single-line JSON envelope to stdout, matching `client.call`. */
function writeEnvelope(envelope: Record<string, any>) {
  process.stdout.write(JSON.stringify(envelope) + '\n');
}
