import {ConditionsFields} from '@/root-cms.js';

export type Condition = NonNullable<ConditionsFields['conditions']>[number];

export type ConditionTestFn = (condition: Condition) => boolean;

interface ConditionModule {
  [key: string]: ConditionTestFn;
}

// Build a map of all `test<ConditionName>()` functions from
// `/conditions/<ConditionName>/<ConditionName>.ts` files.
const MODULES = import.meta.glob<ConditionModule>('/conditions/*/*.ts', {
  eager: true,
});

const CONDITIONS_TEST_FNS: Record<string, ConditionTestFn> = {};
for (const filepath in MODULES) {
  const moduleId = moduleIdFromPath(filepath);
  // Ignore `*.schema.ts` files (moduleId would include a ".") and files that
  // start with "_".
  if (moduleId.startsWith('_') || moduleId.includes('.')) {
    continue;
  }
  // For a file like `IsLocale.ts`, the export should be `testIsLocale()`.
  const testFn = MODULES[filepath][`test${moduleId}`];
  if (testFn) {
    CONDITIONS_TEST_FNS[moduleId] = testFn;
  }
}

function moduleIdFromPath(filepath: string): string {
  const base = filepath.split('/').pop() || '';
  // Remove the final extension only (so `Foo.schema.ts` -> `Foo.schema`).
  return base.replace(/\.[^.]+$/, '');
}

/** Returns `true` if all conditions pass (or there are no conditions). */
export function testAllConditions(conditions?: Condition[]): boolean {
  if (!conditions || conditions.length === 0) {
    return true;
  }
  return conditions.every((condition) => testCondition(condition));
}

function testCondition(condition: Condition): boolean {
  if (!condition?._type) {
    console.warn('[conditions] no condition._type is selected.');
    return false;
  }
  const testFn = CONDITIONS_TEST_FNS[condition._type];
  if (!testFn) {
    console.warn(
      `[conditions] could not find test${condition._type}() fn. Export it from ` +
        `@/conditions/${condition._type}/${condition._type}.ts`
    );
    return false;
  }
  return testFn(condition);
}
