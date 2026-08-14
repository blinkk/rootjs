import {useModals} from '@mantine/modals';
import {useCallback} from 'preact/hooks';
import {
  summarizePublishChecks,
  type PublishCheckResult,
} from '../../shared/publish-checks.js';
import {PublishChecksModal} from '../components/PublishChecksModal/PublishChecksModal.js';
import {testIsAdmin} from '../utils/permissions.js';
import {
  buildPublishChecksAudit,
  runPublishChecks,
  testHasPublishChecks,
  type PublishChecksAuditMetadata,
} from '../utils/publish-checks.js';
import {useModalTheme} from './useModalTheme.js';
import {useProjectRoles} from './useProjectRoles.js';

/** The outcome of gating a publish action on the configured checks. */
export interface PublishChecksDecision {
  /** Whether the caller should go ahead with publishing. */
  proceed: boolean;
  /** The results of the check run. Empty when checks were skipped. */
  results: PublishCheckResult[];
  /** Whether an admin skipped running checks entirely. */
  skipped: boolean;
  /** Whether an admin chose to publish over failed required checks. */
  bypassed: boolean;
  /**
   * Audit metadata to record on the publish action, or `null` when there is
   * nothing to record.
   */
  audit: PublishChecksAuditMetadata | null;
}

export interface RunPublishChecksOptions {
  /** The docs about to be published or scheduled. */
  docIds: string[];
  /** Verb for the action being gated, e.g. "Publish" or "Schedule". */
  actionLabel: string;
  /**
   * Whether to skip running checks entirely. Only honored for admins, so a
   * stale UI toggle can't let a non-admin past the checks.
   */
  skip?: boolean;
}

/**
 * Gates a publish or schedule action on the checks configured on each doc's
 * collection.
 *
 * ```tsx
 * const publishChecks = usePublishChecks();
 *
 * const decision = await publishChecks.run({
 *   docIds: [docId],
 *   actionLabel: 'Publish',
 *   skip: skipChecks,
 * });
 * if (!decision.proceed) {
 *   return;
 * }
 * await cmsPublishDoc(docId, {checksAudit: decision.audit});
 * publishChecks.showWarnings(decision.results);
 * ```
 *
 * When required checks fail, `run()` opens a modal describing the failures and
 * resolves with `proceed: false`, unless an admin chooses to publish anyway.
 * Warnings never halt publishing; the caller surfaces them via
 * `showWarnings()` once the content is live.
 */
export function usePublishChecks() {
  const modals = useModals();
  const modalTheme = useModalTheme();
  const {roles, loading: rolesLoading} = useProjectRoles();
  const currentUserEmail = window.firebase.user.email || '';
  // Treat an unresolved roles fetch as "not an admin" so checks can't be
  // skipped or bypassed before permissions are known.
  const isAdmin = !rolesLoading && testIsAdmin(roles, currentUserEmail);

  const run = useCallback(
    async (
      options: RunPublishChecksOptions
    ): Promise<PublishChecksDecision> => {
      const docIds = options.docIds || [];
      if (options.skip && isAdmin) {
        return {
          proceed: true,
          results: [],
          skipped: true,
          bypassed: false,
          audit: buildPublishChecksAudit([], {skipped: true}),
        };
      }
      if (docIds.length === 0 || !testHasPublishChecks(docIds)) {
        return {
          proceed: true,
          results: [],
          skipped: false,
          bypassed: false,
          audit: null,
        };
      }

      const results = await runPublishChecks(docIds);
      const summary = summarizePublishChecks(results);
      if (summary.blocking.length === 0) {
        return {
          proceed: true,
          results: results,
          skipped: false,
          bypassed: false,
          audit: buildPublishChecksAudit(results),
        };
      }

      // Required checks failed. Show what failed and let admins override.
      return await new Promise<PublishChecksDecision>((resolve) => {
        let bypassed = false;
        modals.openContextModal(PublishChecksModal.id, {
          ...modalTheme,
          title: `${options.actionLabel} blocked by checks`,
          size: '700px',
          innerProps: {
            results: results,
            mode: 'blocked',
            actionLabel: options.actionLabel,
            canBypass: isAdmin,
            // The modal closes itself, which settles the promise below.
            onBypass: () => {
              bypassed = true;
            },
          },
          // Fires on every close path, including the bypass above, so the
          // promise always settles exactly once.
          onClose: () => {
            resolve({
              proceed: bypassed,
              results: results,
              skipped: false,
              bypassed: bypassed,
              audit: buildPublishChecksAudit(results, {bypassed}),
            });
          },
        });
      });
    },
    [modals, modalTheme, isAdmin]
  );

  const showWarnings = useCallback(
    (results: PublishCheckResult[], options?: {actionLabel?: string}) => {
      const summary = summarizePublishChecks(results);
      if (summary.warnings.length === 0) {
        return;
      }
      modals.openContextModal(PublishChecksModal.id, {
        ...modalTheme,
        title: 'Published with warnings',
        size: '700px',
        innerProps: {
          results: results,
          mode: 'warnings',
          actionLabel: options?.actionLabel || 'Publish',
        },
      });
    },
    [modals, modalTheme]
  );

  return {
    /** Whether the current user can skip or bypass checks. */
    isAdmin,
    /** Runs the configured checks and decides whether publishing proceeds. */
    run,
    /** Surfaces any warnings from a check run after the content is live. */
    showWarnings,
  };
}
