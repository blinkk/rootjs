// @vitest-environment node
/**
 * Integration test pinning `FIRESTORE_MAX_NESTING_DEPTH` to what Firestore
 * actually accepts.
 *
 * The CMS warns editors before a doc grows too deep to save, which is only
 * useful if the cutoff matches the real one. These tests write docs of
 * increasing depth against the firestore emulator and assert that
 * `checkNestingDepth()` predicts each write's outcome exactly.
 *
 * Requires the firestore emulator (run via `firebase emulators:exec`).
 */

import {App, deleteApp, initializeApp} from 'firebase-admin/app';
import {Firestore, getFirestore} from 'firebase-admin/firestore';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {
  checkNestingDepth,
  FIRESTORE_MAX_NESTING_DEPTH,
  measureNestingDepth,
} from '../shared/nesting.js';

/** Builds a value nested `levels` maps deep, e.g. 2 => `{a: {a: 'leaf'}}`. */
function nest(levels: number): any {
  let value: any = 'leaf';
  for (let i = 0; i < levels; i++) {
    value = {a: value};
  }
  return value;
}

describe.skipIf(!process.env.FIRESTORE_EMULATOR_HOST)(
  'firestore nesting depth',
  () => {
    const projectId = 'nesting-depth-test';
    let app: App;
    let db: Firestore;

    beforeAll(() => {
      app = initializeApp({projectId: 'demo-nesting-depth'}, 'nesting-depth');
      db = getFirestore(app);
    });

    afterAll(async () => {
      await deleteApp(app);
    });

    /** Writes `fields` to a doc and reports whether Firestore accepted it. */
    async function trySet(id: string, fields: any): Promise<boolean> {
      try {
        await db.doc(`Projects/${projectId}/Docs/${id}`).set({fields});
        return true;
      } catch {
        return false;
      }
    }

    it('accepts a doc nested exactly at the limit', async () => {
      // `fields` is depth 0, so 20 more maps lands the leaf at depth 20.
      const fields = nest(20);
      expect(measureNestingDepth(fields, 'fields').depth).toBe(
        FIRESTORE_MAX_NESTING_DEPTH
      );
      expect(checkNestingDepth('fields', fields, {warningBuffer: 0})).toBe(
        null
      );
      expect(await trySet('at-limit', fields)).toBe(true);
    });

    it('rejects a doc nested one level past the limit', async () => {
      const fields = nest(21);
      const issue = checkNestingDepth('fields', fields, {warningBuffer: 0});
      expect(issue?.severity).toBe('error');
      expect(await trySet('over-limit', fields)).toBe(false);
    });

    it('predicts acceptance across a range of depths', async () => {
      const predicted: boolean[] = [];
      const actual: boolean[] = [];
      for (let levels = 18; levels <= 23; levels++) {
        const fields = nest(levels);
        predicted.push(
          checkNestingDepth('fields', fields, {warningBuffer: 0}) === null
        );
        actual.push(await trySet(`depth-${levels}`, fields));
      }
      expect(predicted).toEqual(actual);
      // Sanity check that the range actually straddles the cutoff.
      expect(actual).toContain(true);
      expect(actual).toContain(false);
    });

    it('counts array levels the same as map levels', async () => {
      // Alternating maps and arrays reaches the limit at the same depth.
      let value: any = 'leaf';
      for (let i = 0; i < 20; i++) {
        value = i % 2 === 0 ? [value] : {a: value};
      }
      expect(measureNestingDepth(value, 'fields').depth).toBe(
        FIRESTORE_MAX_NESTING_DEPTH
      );
      // Firestore also rejects arrays directly inside arrays, so only the
      // alternating shape isolates depth as the reason for a rejection.
      expect(await trySet('mixed-at-limit', value)).toBe(true);

      const deeper = {a: value};
      expect(
        checkNestingDepth('fields', deeper, {warningBuffer: 0})?.severity
      ).toBe('error');
      expect(await trySet('mixed-over-limit', deeper)).toBe(false);
    });
  }
);
