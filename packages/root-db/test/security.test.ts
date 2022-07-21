import * as fs from 'fs';
import {afterAll, beforeAll, beforeEach, test} from 'vitest';
import {assertFails, assertSucceeds, initializeTestEnvironment, RulesTestEnvironment} from '@firebase/rules-unit-testing';
import {doc, getDoc, setDoc} from 'firebase/firestore';

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'rootjs-cms',
    firestore: {rules: fs.readFileSync('firestore.rules', 'utf8')},
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

test('should not allow public users to read from a project', async () => {
  const unauthedDb = testEnv.unauthenticatedContext().firestore();
  await assertFails(getDoc(doc(unauthedDb, 'Projects/foo')));
  await assertFails(getDoc(doc(unauthedDb, 'Projects/foo/Collection/bar')));
});

test('should not allow unauthed users to read from a project', async () => {
  const aliceDb = testEnv.authenticatedContext('alice', {email: 'alice@example.com'}).firestore();
  await assertFails(getDoc(doc(aliceDb, 'Projects/foo')));
  await assertFails(getDoc(doc(aliceDb, 'Projects/foo/Collection/bar')));
});

test('should not allow public users to write to a project', async () => {
  const unauthedDb = testEnv.unauthenticatedContext().firestore();
  await assertFails(setDoc(doc(unauthedDb, 'Projects/foo'), {foo: 'bar'}));
  await assertFails(setDoc(doc(unauthedDb, 'Projects/foo/Collection/bar'), {foo: 'bar'}));
});

test('should not allow unauthed users to write to a project', async () => {
  const aliceDb = testEnv.authenticatedContext('hacker', {email: 'hacker@example.com'}).firestore();
  await assertFails(setDoc(doc(aliceDb, 'Projects/foo'), {foo: 'bar'}));
  await assertFails(setDoc(doc(aliceDb, 'Projects/foo/Collection/bar'), {foo: 'bar'}));
});

test('should allow certain users to read from a project', async () => {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'Projects/foo'), {
      roles: {
        'adam@example.com': 'ADMIN',
        'edith@example.com': 'EDITOR',
        'victor@example.com': 'VIEWER',
      },
    });
  });

  const adamDb = testEnv.authenticatedContext('adam', {email: 'adam@example.com'}).firestore();
  const edithDb = testEnv.authenticatedContext('edith', {email: 'edith@example.com'}).firestore();
  const victorDb = testEnv.authenticatedContext('victor', {email: 'victor@example.com'}).firestore();

  await assertSucceeds(getDoc(doc(adamDb, 'Projects/foo')));
  await assertSucceeds(getDoc(doc(edithDb, 'Projects/foo')));
  await assertSucceeds(getDoc(doc(victorDb, 'Projects/foo')));
});

test('should allow certain users to write to a project', async () => {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'Projects/foo'), {
      roles: {
        'adam@example.com': 'ADMIN',
        'edith@example.com': 'EDITOR',
        'victor@example.com': 'VIEWER',
      },
    });
  });

  const adamDb = testEnv.authenticatedContext('adam', {email: 'adam@example.com'}).firestore();
  const edithDb = testEnv.authenticatedContext('edith', {email: 'edith@example.com'}).firestore();
  const victorDb = testEnv.authenticatedContext('victor', {email: 'victor@example.com'}).firestore();

  await assertSucceeds(setDoc(doc(adamDb, 'Projects/foo/Settings/bar'), {foo: 'bar'}));
  await assertSucceeds(setDoc(doc(edithDb, 'Projects/foo/Settings/bar'), {foo: 'bar'}));
  await assertFails(setDoc(doc(victorDb, 'Projects/foo/Settings/bar'), {foo: 'bar'}));
});
