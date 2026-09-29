import {readFileSync} from 'node:fs';
import path from 'node:path';
import type {RootConfig} from '@blinkk/root';
import {parseProposal} from '@blinkk/root-cms';
import {RootCMSClient} from '@blinkk/root-cms/client';

/**
 * Creates a `RootCMSClient`. When the `CMS_PROPOSAL` env var is set to the path
 * of a change proposal (e.g. `cms-proposals/<id>.yaml`), the proposal is
 * overlaid on every read, so it can be previewed before it's applied:
 *
 *   CMS_PROPOSAL=cms-proposals/<id>.yaml pnpm dev
 *
 * Nothing is written to the CMS. Only use this for local previews.
 */
export function createCmsClient(rootConfig: RootConfig) {
  const proposalPath = process.env.CMS_PROPOSAL;
  if (!proposalPath) {
    return new RootCMSClient(rootConfig);
  }
  const filePath = path.resolve(rootConfig.rootDir, proposalPath);
  const result = parseProposal(readFileSync(filePath, 'utf8'));
  if (!result.ok) {
    throw new Error(
      `invalid proposal ${proposalPath}: ${JSON.stringify(result.errors)}`
    );
  }
  console.log(`previewing proposal: ${proposalPath}`);
  return new RootCMSClient(rootConfig, {proposal: result.proposal});
}
