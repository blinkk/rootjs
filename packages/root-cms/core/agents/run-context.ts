/**
 * Per-run context shared with all agent tools. The runner constructs this
 * once at the start of an agent run and passes it through to every tool's
 * `execute` function so they can issue project-scoped Firestore reads/writes
 * and attribute mutations to the correct agent identity.
 */

import type {Firestore} from 'firebase-admin/firestore';
import type {CMSCheck} from '../checks.js';
import type {RootCMSClient} from '../client.js';
import type {AgentDefinition} from './types.js';

export const AGENT_ASSIGNEE_PREFIX = 'agent:';

/**
 * Returns the assignee string an agent posts under (e.g. `agent:content-manager`).
 */
export function getAgentAssignee(agent: AgentDefinition): string {
  return `${AGENT_ASSIGNEE_PREFIX}${agent.name}`;
}

export interface AgentRunContext {
  /** Resolved agent definition driving the run. */
  agent: AgentDefinition;
  /** CMS client scoped to the current project. */
  cmsClient: RootCMSClient;
  /** Convenience handle on the admin Firestore client. */
  db: Firestore;
  /** Project id (matches `cmsClient.projectId`). */
  projectId: string;
  /** Task id the agent is working on. Tools that post to Firestore use this. */
  taskId: string;
  /** Identity string written as `createdBy` on agent-authored documents. */
  createdBy: string;
  /** AbortSignal that fires when the user cancels the run. */
  signal?: AbortSignal;
  /**
   * CMS checks registered via the plugin config. The runner threads these
   * through so the QA-style read tools can list and execute them. Optional
   * because not every project registers checks.
   */
  checks?: CMSCheck[];
}
