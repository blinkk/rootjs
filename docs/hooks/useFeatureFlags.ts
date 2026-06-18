import {createContext} from 'preact';
import {useContext} from 'preact/hooks';
import {testAllConditions} from '@/conditions/conditions.js';
import {GlobalModulesFields} from '@/root-cms.js';

export type FeatureFlag = NonNullable<GlobalModulesFields['flags']>[number];

export interface FeatureFlags {
  /** Returns a flag's configuration by name, if defined. */
  get: (name: string) => FeatureFlag | undefined;
  /** Returns `true` if the named flag is defined and all its conditions pass. */
  test: (name: string) => boolean;
}

/**
 * Provides the list of feature flags (from `GlobalModules/flags`) to the
 * component tree so that `useFeatureFlags()` and the `IsFeatureFlag` condition
 * can resolve flags during render.
 */
export const FeatureFlagsContext = createContext<FeatureFlag[]>([]);

// Tracks flags currently being evaluated to guard against cyclic
// IsFeatureFlag -> IsFeatureFlag references.
const evaluating = new Set<string>();

export function useFeatureFlags(): FeatureFlags {
  const flags = useContext(FeatureFlagsContext) || [];

  function get(name: string): FeatureFlag | undefined {
    return flags.find((flag) => flag.name === name);
  }

  function test(name: string): boolean {
    const flag = get(name);
    if (!flag) {
      return false;
    }
    if (evaluating.has(name)) {
      // Cyclic reference — treat as not enabled to avoid infinite recursion.
      return false;
    }
    evaluating.add(name);
    try {
      return testAllConditions(flag.conditions);
    } finally {
      evaluating.delete(name);
    }
  }

  return {get, test};
}
