/**
 * Hook that loads the project's registered agents from
 * `/cms/api/agents.list`. The list is fetched once per component mount;
 * agent definitions are configured at build time so there's no need to
 * subscribe.
 */

import {useEffect, useState} from 'preact/hooks';

export interface AgentSummary {
  name: string;
  /** Avatar image URL; null when not configured (UI falls back to a letter avatar). */
  iconUrl?: string | null;
  description: string;
  allowedTools: ('read' | 'propose' | 'subtask')[];
}

interface UseAgentsResult {
  agents: AgentSummary[];
  loading: boolean;
  error: string | null;
}

export function useAgents(): UseAgentsResult {
  const [agents, setAgents] = useState<AgentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetch('/cms/api/agents.list', {credentials: 'include'})
      .then(async (res) => {
        const data = (await res.json()) as {
          success: boolean;
          agents?: AgentSummary[];
          error?: string;
        };
        if (!active) {
          return;
        }
        if (!data.success) {
          setError(data.error || 'unknown error');
          setLoading(false);
          return;
        }
        setAgents(data.agents || []);
        setLoading(false);
      })
      .catch((err) => {
        if (active) {
          setError(err instanceof Error ? err.message : String(err));
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  return {agents, loading, error};
}
