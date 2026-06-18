import {useFeatureFlags} from '@/hooks/useFeatureFlags.js';
import {IsFeatureFlagFields} from '@/root-cms.js';

export function testIsFeatureFlag(condition: IsFeatureFlagFields): boolean {
  if (!condition.flag) {
    return false;
  }
  const flags = useFeatureFlags();
  return flags.test(condition.flag);
}
