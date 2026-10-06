import {readFileSync} from 'node:fs';
import path from 'node:path';
import type {RootConfig} from '@blinkk/root';
import {parseProposal, type CreateRouteOptions} from '@blinkk/root-cms';
import {
  RootCMSClient,
  type RootCMSClientOptions,
} from '@blinkk/root-cms/client';

/**
 * Creates a `RootCMSClient`. When the `CMS_PROPOSAL` env var is set to the path
 * of a change proposal (e.g. `cms-proposals/<id>.yaml`), the proposal is
 * overlaid on every read, so it can be previewed before it's applied:
 *
 *   CMS_PROPOSAL=cms-proposals/<id>.yaml pnpm dev
 *
 * Nothing is written to the CMS. Only use this for local previews.
 */
export function createCmsClient(
  rootConfig: RootConfig,
  options?: RootCMSClientOptions
) {
  const clientOptions: RootCMSClientOptions = {...options};
  const proposalPath = process.env.CMS_PROPOSAL;
  if (proposalPath) {
    const filePath = path.resolve(rootConfig.rootDir, proposalPath);
    const result = parseProposal(readFileSync(filePath, 'utf8'));
    if (!result.ok) {
      throw new Error(
        `invalid proposal ${proposalPath}: ${JSON.stringify(result.errors)}`
      );
    }
    console.log(`previewing proposal: ${proposalPath}`);
    clientOptions.proposal = result.proposal;
  }
  return new RootCMSClient(rootConfig, clientOptions);
}

/**
 * Shared `createRoute()` options for the site's CMS routes, e.g.:
 *
 *   createRoute({...CMS_ROUTE_OPTIONS, collection: 'Pages'});
 *
 * Published reads are cached in memory for 1 minute (see the `cache` option).
 * Browsers cache published pages for 1 minute and the Firebase Hosting CDN for
 * 5 minutes, so a publish can take up to ~7 minutes to show up. Change
 * proposals can be previewed with the `CMS_PROPOSAL` env var (see
 * `createCmsClient()`).
 */
export const CMS_ROUTE_OPTIONS = {
  cache: true,
  cacheControl: 'public, max-age=60, s-maxage=300',
  createCmsClient,
} satisfies Partial<CreateRouteOptions>;
