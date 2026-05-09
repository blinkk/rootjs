/**
 * Express handlers for agent-related endpoints. Mounted from `api.ts` under
 * `/cms/api/agents.*`. All endpoints require an authenticated user.
 *
 * Endpoint summary:
 *
 *   GET  /cms/api/agents.list            — list registered agents (for pickers).
 *   POST /cms/api/agents.proposalApply   — return the validated tool call payload
 *                                           so the browser can execute it under
 *                                           the user's auth, then mark applied.
 *   POST /cms/api/agents.proposalReject  — mark a proposal rejected.
 *   POST /cms/api/agents.taskCancelRun   — cancel an in-flight agent run.
 *   POST /cms/api/agents.taskRetryRun    — reset an errored/cancelled run.
 */

import type {Server, Request, Response} from '@blinkk/root';
import {FieldValue} from 'firebase-admin/firestore';
import {RootCMSClient} from '../client.js';
import {loadAgents} from './registry.js';
import {PROPOSAL_TARGET_TOOLS} from './tools-propose.js';

const PROPOSAL_TARGET_SET: ReadonlySet<string> = new Set(PROPOSAL_TARGET_TOOLS);

/**
 * Registers all agent-related API endpoints on the server.
 */
export function registerAgentApi(server: Server) {
  /**
   * Lists registered agents for the agent picker. Strips `systemPrompt`
   * from the response since it can be long and isn't needed in the UI.
   */
  server.use('/cms/api/agents.list', async (req: Request, res: Response) => {
    if (!req.user?.email) {
      res.status(401).json({success: false, error: 'UNAUTHORIZED'});
      return;
    }
    try {
      const agents = await loadAgents();
      const list = Array.from(agents.values()).map((agent) => ({
        name: agent.name,
        icon: agent.icon,
        description: agent.description,
        allowedTools: agent.allowedTools,
      }));
      res.status(200).json({success: true, agents: list});
    } catch (err) {
      console.error(err);
      res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : 'UNKNOWN',
      });
    }
  });

  /**
   * Returns the validated proposal payload so the browser can execute it.
   * Marks the comment's proposal status `applied` once the browser reports
   * success via PATCH (handled in the same endpoint with `outcome: 'success'`
   * or `outcome: 'error'`).
   */
  server.use(
    '/cms/api/agents.proposalApply',
    async (req: Request, res: Response) => {
      if (req.method !== 'POST') {
        res.status(400).json({success: false, error: 'BAD_REQUEST'});
        return;
      }
      if (!req.user?.email) {
        res.status(401).json({success: false, error: 'UNAUTHORIZED'});
        return;
      }
      const body = req.body || {};
      const {taskId, commentId, outcome, error} = body;
      if (!taskId || !commentId) {
        res
          .status(400)
          .json({success: false, error: 'MISSING_TASK_OR_COMMENT'});
        return;
      }

      const cmsClient = new RootCMSClient(req.rootConfig!);
      const commentRef = cmsClient.db.doc(
        `Projects/${cmsClient.projectId}/Tasks/${taskId}/Comments/${commentId}`
      );
      const snap = await commentRef.get();
      if (!snap.exists) {
        res.status(404).json({success: false, error: 'COMMENT_NOT_FOUND'});
        return;
      }
      const data = snap.data() || {};
      const proposal = data.proposal as
        | {tool?: string; input?: unknown; status?: string}
        | undefined;
      if (!proposal) {
        res.status(400).json({success: false, error: 'NOT_A_PROPOSAL'});
        return;
      }

      // Two flows: (1) initial GET-style call returns the payload to execute;
      // (2) browser POSTs back `outcome` after running it under the user's
      // auth so we can finalize the status. Both share this endpoint to keep
      // the surface tight.
      if (outcome === 'success') {
        if (proposal.status !== 'pending') {
          res.status(409).json({success: false, error: 'PROPOSAL_NOT_PENDING'});
          return;
        }
        await commentRef.update({
          'proposal.status': 'applied',
          'proposal.appliedBy': req.user.email,
          'proposal.appliedAt': FieldValue.serverTimestamp(),
          'proposal.applyError': null,
        });
        res.status(200).json({success: true, applied: true});
        return;
      }

      if (outcome === 'error') {
        await commentRef.update({
          'proposal.applyError': String(error || 'unknown error'),
        });
        res.status(200).json({success: true, recorded: true});
        return;
      }

      // Default flow: prepare-to-apply. Validate the proposal and return the
      // payload the browser should execute.
      if (proposal.status !== 'pending') {
        res.status(409).json({success: false, error: 'PROPOSAL_NOT_PENDING'});
        return;
      }
      if (!proposal.tool || !PROPOSAL_TARGET_SET.has(proposal.tool)) {
        res.status(400).json({success: false, error: 'UNSUPPORTED_TOOL'});
        return;
      }
      res.status(200).json({
        success: true,
        toolName: proposal.tool,
        input: proposal.input || {},
      });
    }
  );

  /**
   * Marks a pending proposal as rejected without applying it. Useful when
   * the reviewer disagrees with the agent's suggestion.
   */
  server.use(
    '/cms/api/agents.proposalReject',
    async (req: Request, res: Response) => {
      if (req.method !== 'POST') {
        res.status(400).json({success: false, error: 'BAD_REQUEST'});
        return;
      }
      if (!req.user?.email) {
        res.status(401).json({success: false, error: 'UNAUTHORIZED'});
        return;
      }
      const {taskId, commentId} = req.body || {};
      if (!taskId || !commentId) {
        res
          .status(400)
          .json({success: false, error: 'MISSING_TASK_OR_COMMENT'});
        return;
      }
      const cmsClient = new RootCMSClient(req.rootConfig!);
      const commentRef = cmsClient.db.doc(
        `Projects/${cmsClient.projectId}/Tasks/${taskId}/Comments/${commentId}`
      );
      const snap = await commentRef.get();
      if (!snap.exists) {
        res.status(404).json({success: false, error: 'COMMENT_NOT_FOUND'});
        return;
      }
      const data = snap.data() || {};
      const proposal = data.proposal as {status?: string} | undefined;
      if (!proposal) {
        res.status(400).json({success: false, error: 'NOT_A_PROPOSAL'});
        return;
      }
      if (proposal.status !== 'pending') {
        res.status(409).json({success: false, error: 'PROPOSAL_NOT_PENDING'});
        return;
      }
      await commentRef.update({
        'proposal.status': 'rejected',
        'proposal.appliedBy': req.user.email,
        'proposal.appliedAt': FieldValue.serverTimestamp(),
      });
      res.status(200).json({success: true});
    }
  );

  /**
   * Cancels an in-flight agent run. Worker observes the status flip
   * between steps and exits cleanly.
   */
  server.use(
    '/cms/api/agents.taskCancelRun',
    async (req: Request, res: Response) => {
      if (req.method !== 'POST') {
        res.status(400).json({success: false, error: 'BAD_REQUEST'});
        return;
      }
      if (!req.user?.email) {
        res.status(401).json({success: false, error: 'UNAUTHORIZED'});
        return;
      }
      const {taskId} = req.body || {};
      if (!taskId) {
        res.status(400).json({success: false, error: 'MISSING_TASK_ID'});
        return;
      }
      const cmsClient = new RootCMSClient(req.rootConfig!);
      const taskRef = cmsClient.db.doc(
        `Projects/${cmsClient.projectId}/Tasks/${taskId}`
      );
      await taskRef.update({
        'agentRun.status': 'cancelled',
        'agentRun.updatedAt': FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: req.user.email,
      });
      res.status(200).json({success: true});
    }
  );

  /**
   * Resets an errored or cancelled run so a worker can re-claim. Each
   * retry runs from scratch — no checkpointing.
   */
  server.use(
    '/cms/api/agents.taskRetryRun',
    async (req: Request, res: Response) => {
      if (req.method !== 'POST') {
        res.status(400).json({success: false, error: 'BAD_REQUEST'});
        return;
      }
      if (!req.user?.email) {
        res.status(401).json({success: false, error: 'UNAUTHORIZED'});
        return;
      }
      const {taskId} = req.body || {};
      if (!taskId) {
        res.status(400).json({success: false, error: 'MISSING_TASK_ID'});
        return;
      }
      const cmsClient = new RootCMSClient(req.rootConfig!);
      const taskRef = cmsClient.db.doc(
        `Projects/${cmsClient.projectId}/Tasks/${taskId}`
      );
      await taskRef.update({
        'agentRun.status': 'idle',
        'agentRun.leasedBy': null,
        'agentRun.leasedAt': null,
        'agentRun.lastError': null,
        'agentRun.tokensUsed': 0,
        'agentRun.updatedAt': FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: req.user.email,
      });
      res.status(200).json({success: true});
    }
  );
}
