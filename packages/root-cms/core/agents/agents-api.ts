/**
 * Express handlers for agent-related endpoints. Mounted from `api.ts` under
 * `/cms/api/agents.*`. All endpoints require an authenticated user.
 *
 * Endpoint summary:
 *
 *   GET  /cms/api/agents.list             — list registered agents (for pickers).
 *   POST /cms/api/agents.proposalApply    — return the validated tool call payload
 *                                            so the browser can execute it under
 *                                            the user's auth, then mark applied.
 *   POST /cms/api/agents.proposalReject   — mark a proposal rejected.
 *   POST /cms/api/agents.taskCancelRun    — cancel an in-flight agent run.
 *   POST /cms/api/agents.taskRetryRun     — reset an errored/cancelled run.
 *   POST /cms/api/agents.chatConvertToTask — turn an AI chat into a task,
 *                                            optionally assigned to an agent.
 */

import type {Server, Request, Response} from '@blinkk/root';
import type {UIMessage} from 'ai';
import {FieldValue} from 'firebase-admin/firestore';
import {ChatStore} from '../ai-chat.js';
import {RootCMSClient} from '../client.js';
import {loadAgents} from './registry.js';
import {AGENT_ASSIGNEE_PREFIX} from './run-context.js';
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

  /**
   * Converts an AI chat session into a task. Renders the chat history as
   * the task's seed comment and optionally assigns it to a registered
   * agent. The chat itself is preserved; the task carries `sourceChatId`
   * back to it.
   */
  server.use(
    '/cms/api/agents.chatConvertToTask',
    async (req: Request, res: Response) => {
      if (req.method !== 'POST') {
        res.status(400).json({success: false, error: 'BAD_REQUEST'});
        return;
      }
      if (!req.user?.email) {
        res.status(401).json({success: false, error: 'UNAUTHORIZED'});
        return;
      }
      const {chatId, agentName, title} = req.body || {};
      if (!chatId) {
        res.status(400).json({success: false, error: 'MISSING_CHAT_ID'});
        return;
      }

      const cmsClient = new RootCMSClient(req.rootConfig!);
      const store = new ChatStore(cmsClient, req.user.email);
      const chat = await store.getChat(String(chatId));
      if (!chat) {
        res.status(404).json({success: false, error: 'CHAT_NOT_FOUND'});
        return;
      }

      let assignee: string | null = null;
      if (agentName) {
        const agents = await loadAgents();
        if (!agents.has(String(agentName))) {
          res.status(400).json({success: false, error: 'UNKNOWN_AGENT'});
          return;
        }
        assignee = `${AGENT_ASSIGNEE_PREFIX}${agentName}`;
      }

      try {
        const taskId = await createTaskFromChat(cmsClient, {
          chat,
          title: title ? String(title) : undefined,
          assignee,
          createdBy: req.user.email,
        });
        res.status(200).json({success: true, taskId});
      } catch (err) {
        console.error(err);
        res.status(500).json({
          success: false,
          error: err instanceof Error ? err.message : 'UNKNOWN',
        });
      }
    }
  );
}

const TASK_COUNTER_ID = 'tasks';
const TASK_ID_ALLOCATION_ATTEMPTS = 20;

/**
 * Allocates a fresh task id and writes the chat-derived task + seed comment
 * in a single transaction. If `assignee` is `agent:*`, marks
 * `agentRun.status: 'idle'` so the worker picks it up.
 */
async function createTaskFromChat(
  cmsClient: RootCMSClient,
  options: {
    chat: {id: string; title?: string; messages: UIMessage[]};
    title?: string;
    assignee: string | null;
    createdBy: string;
  }
): Promise<string> {
  const {chat, createdBy, assignee} = options;
  const counterRef = cmsClient.db.doc(
    `Projects/${cmsClient.projectId}/Counters/${TASK_COUNTER_ID}`
  );
  const tasksCol = cmsClient.db.collection(
    `Projects/${cmsClient.projectId}/Tasks`
  );
  const isAgentAssignee = (assignee || '').startsWith(AGENT_ASSIGNEE_PREFIX);
  const seedContent = renderChatAsMarkdown(chat.messages);
  const title =
    options.title?.trim() || chat.title?.trim() || deriveTitle(chat.messages);

  const taskId = await cmsClient.db.runTransaction(async (txn) => {
    const counterSnap = await txn.get(counterRef);
    const counterData = counterSnap.data() || {};
    const lastTaskId =
      typeof counterData.lastTaskId === 'number' ? counterData.lastTaskId : 0;
    let nextTaskId = Math.floor(lastTaskId) + 1;

    for (let i = 0; i < TASK_ID_ALLOCATION_ATTEMPTS; i++) {
      const taskRef = tasksCol.doc(String(nextTaskId));
      const taskSnap = await txn.get(taskRef);
      if (!taskSnap.exists) {
        txn.set(
          counterRef,
          {lastTaskId: nextTaskId, updatedAt: FieldValue.serverTimestamp()},
          {merge: true}
        );
        txn.set(taskRef, {
          id: String(nextTaskId),
          title,
          description: '',
          assignee,
          priority: 'normal',
          status: 'new',
          targetLaunchDate: null,
          createdAt: FieldValue.serverTimestamp(),
          createdBy,
          updatedAt: FieldValue.serverTimestamp(),
          updatedBy: createdBy,
          sourceChatId: chat.id,
          ...(isAgentAssignee
            ? {
                agentRun: {
                  status: 'idle',
                  tokensUsed: 0,
                  updatedAt: FieldValue.serverTimestamp(),
                },
              }
            : {}),
        });
        const commentRef = taskRef.collection('Comments').doc();
        txn.set(commentRef, {
          id: commentRef.id,
          taskId: String(nextTaskId),
          parentId: null,
          content: seedContent,
          body: null,
          mentions: [],
          createdAt: FieldValue.serverTimestamp(),
          createdBy,
          history: [],
        });
        return String(nextTaskId);
      }
      nextTaskId += 1;
    }
    throw new Error('chatConvertToTask: unable to allocate a task id');
  });
  return taskId;
}

/**
 * Renders the chat history as a single markdown blob. Tool calls are
 * collapsed to a one-line indicator since their full payloads can be very
 * long.
 */
function renderChatAsMarkdown(messages: UIMessage[]): string {
  const parts: string[] = ['## Chat history', ''];
  for (const msg of messages) {
    const role =
      msg.role === 'user'
        ? '**User**'
        : msg.role === 'assistant'
        ? '**Assistant**'
        : `**${msg.role}**`;
    const text = (msg.parts || [])
      .map((part) => {
        if ((part as {type?: string}).type === 'text') {
          return (part as {text?: string}).text || '';
        }
        if (
          typeof (part as {type?: string}).type === 'string' &&
          ((part as {type: string}).type as string).startsWith('tool-')
        ) {
          return `_↳ ran tool ${((part as {type: string}).type as string).slice(
            5
          )}_`;
        }
        return '';
      })
      .filter(Boolean)
      .join('\n');
    if (text.trim()) {
      parts.push(`${role}: ${text}`);
      parts.push('');
    }
  }
  return parts.join('\n').trim();
}

/**
 * Derives a short title from the first user message, truncated for
 * readability.
 */
function deriveTitle(messages: UIMessage[]): string {
  const firstUser = messages.find((m) => m.role === 'user');
  if (!firstUser) {
    return 'Chat conversation';
  }
  const text = (firstUser.parts || [])
    .map((part) =>
      (part as {type?: string}).type === 'text'
        ? (part as {text?: string}).text || ''
        : ''
    )
    .join(' ')
    .trim();
  if (!text) {
    return 'Chat conversation';
  }
  const firstLine = text.split('\n')[0];
  return firstLine.length > 80 ? firstLine.slice(0, 77) + '...' : firstLine;
}
