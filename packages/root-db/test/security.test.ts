import * as fs from 'fs';
import {afterAll, beforeAll, beforeEach, test} from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {collection, doc, getDoc, getDocs, setDoc} from 'firebase/firestore';

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

test('should not allow arbitrary users to read/write', async () => {
  const unauthedDb = testEnv.unauthenticatedContext().firestore();
  await assertFails(getDoc(doc(unauthedDb, 'Projects/foo')));
  await assertFails(getDoc(doc(unauthedDb, 'Projects/foo/Collection/bar')));
  await assertFails(setDoc(doc(unauthedDb, 'Projects/foo'), {foo: 'bar'}));
  await assertFails(
    setDoc(doc(unauthedDb, 'Projects/foo/Collection/bar'), {foo: 'bar'})
  );

  const hackerDb = testEnv
    .authenticatedContext('hacker', {email: 'hacker@example.com'})
    .firestore();
  await assertFails(getDoc(doc(hackerDb, 'Projects/foo')));
  await assertFails(getDoc(doc(hackerDb, 'Projects/foo/Collection/bar')));
  await assertFails(setDoc(doc(hackerDb, 'Projects/foo'), {foo: 'bar'}));
  await assertFails(
    setDoc(doc(hackerDb, 'Projects/foo/Collection/bar'), {foo: 'bar'})
  );
});

test('should allow certain users to read/write from a project', async () => {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'Projects/foo'), {
      roles: {
        'adam@example.com': 'ADMIN',
        'edith@example.com': 'EDITOR',
        'victor@example.com': 'VIEWER',
      },
    });
  });

  const adamDb = testEnv
    .authenticatedContext('adam', {email: 'adam@example.com'})
    .firestore();
  const edithDb = testEnv
    .authenticatedContext('edith', {email: 'edith@example.com'})
    .firestore();
  const victorDb = testEnv
    .authenticatedContext('victor', {email: 'victor@example.com'})
    .firestore();

  const docPath = 'Projects/foo/Docs/bar';
  await assertSucceeds(getDoc(doc(adamDb, docPath)));
  await assertSucceeds(setDoc(doc(adamDb, docPath), {foo: 'bar'}));
  await assertSucceeds(getDoc(doc(edithDb, docPath)));
  await assertSucceeds(setDoc(doc(edithDb, docPath), {foo: 'bar'}));
  await assertSucceeds(getDoc(doc(victorDb, docPath)));
  await assertFails(setDoc(doc(victorDb, docPath), {foo: 'bar'}));
});

test('should allow certain users to list docs from a project', async () => {
  const collectionPath = 'Projects/foo/Collections/bar/Docs';

  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await Promise.all([
      setDoc(doc(db, 'Projects/foo'), {
        roles: {
          'adam@example.com': 'ADMIN',
          'edith@example.com': 'EDITOR',
          'victor@example.com': 'VIEWER',
        },
      }),
      setDoc(doc(db, `${collectionPath}/a`), {a: 1}),
      setDoc(doc(db, `${collectionPath}/b`), {a: 2}),
      setDoc(doc(db, `${collectionPath}/c`), {a: 3}),
    ]);
  });

  const unauthedDb = testEnv.unauthenticatedContext().firestore();
  const adamDb = testEnv
    .authenticatedContext('adam', {email: 'adam@example.com'})
    .firestore();
  const edithDb = testEnv
    .authenticatedContext('edith', {email: 'edith@example.com'})
    .firestore();
  const victorDb = testEnv
    .authenticatedContext('victor', {email: 'victor@example.com'})
    .firestore();
  const hackerDb = testEnv
    .authenticatedContext('hacker', {email: 'hacker@example.com'})
    .firestore();

  await assertSucceeds(getDocs(collection(adamDb, collectionPath)));
  await assertSucceeds(getDocs(collection(edithDb, collectionPath)));
  await assertSucceeds(getDocs(collection(victorDb, collectionPath)));
  await assertFails(getDocs(collection(hackerDb, collectionPath)));
  await assertFails(getDocs(collection(unauthedDb, collectionPath)));
});
