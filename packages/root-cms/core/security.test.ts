import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import {afterAll, beforeAll, beforeEach, test} from 'vitest';

import {FIRESTORE_RULES} from './security.js';

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'rootjs-cms',
    firestore: {rules: FIRESTORE_RULES},
  });
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

afterAll(async () => {
  if (testEnv) {
    await testEnv.cleanup();
  }
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

  const docPath = 'Projects/foo/Collections/bar/Drafts/baz';
  await assertSucceeds(getDoc(doc(adamDb, docPath)));
  await assertSucceeds(setDoc(doc(adamDb, docPath), {foo: 'bar'}));
  await assertSucceeds(getDoc(doc(edithDb, docPath)));
  await assertSucceeds(setDoc(doc(edithDb, docPath), {foo: 'bar'}));
  await assertSucceeds(getDoc(doc(victorDb, docPath)));
  await assertFails(setDoc(doc(victorDb, docPath), {foo: 'bar'}));
});

test('should allow certain users to list docs from a project', async () => {
  const collectionPath = 'Projects/foo/Collections/bar/Drafts';

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

test('should allow users in an email domain to read/write from a project', async () => {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'Projects/foo'), {
      roles: {
        '*@domain-admins.com': 'ADMIN',
        '*@domain-viewers.com': 'VIEWER',
      },
    });
  });

  const adamDb = testEnv
    .authenticatedContext('adam', {email: 'adam@domain-admins.com'})
    .firestore();
  const victorDb = testEnv
    .authenticatedContext('edith', {email: 'victor@domain-viewers.com'})
    .firestore();
  const externalUserDb = testEnv
    .authenticatedContext('victor', {email: 'user@external-domain.com'})
    .firestore();

  const docPath = 'Projects/foo/Collections/bar/Drafts/baz';
  // Admins can read/write.
  await assertSucceeds(getDoc(doc(adamDb, docPath)));
  await assertSucceeds(setDoc(doc(adamDb, docPath), {foo: 'bar'}));
  // Viewers can only read.
  await assertSucceeds(getDoc(doc(victorDb, docPath)));
  await assertFails(setDoc(doc(victorDb, docPath), {foo: 'bar'}));
  // External users can't read/write.
  await assertFails(getDoc(doc(externalUserDb, docPath)));
  await assertFails(setDoc(doc(externalUserDb, docPath), {foo: 'bar'}));
});

test('should only allow admins to configure a project', async () => {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'Projects/foo'), {
      roles: {
        'adam@example.com': 'ADMIN',
        'edith@example.com': 'EDITOR',
        'victor@example.com': 'VIEWER',
      },
    });
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

  const docPath = 'Projects/foo';
  // Unauthed/external users can't read/write.
  await assertFails(getDoc(doc(unauthedDb, docPath)));
  await assertFails(updateDoc(doc(unauthedDb, docPath), {foo: 'bar'}));
  await assertFails(getDoc(doc(hackerDb, docPath)));
  await assertFails(updateDoc(doc(hackerDb, docPath), {foo: 'bar'}));
  // Editors/viewers can only read.
  await assertSucceeds(getDoc(doc(edithDb, docPath)));
  await assertFails(updateDoc(doc(edithDb, docPath), {foo: 'bar'}));
  await assertSucceeds(getDoc(doc(victorDb, docPath)));
  await assertFails(updateDoc(doc(victorDb, docPath), {foo: 'bar'}));
  // Admins can read/write.
  await assertSucceeds(getDoc(doc(adamDb, docPath)));
  await assertSucceeds(updateDoc(doc(adamDb, docPath), {foo: 'bar'}));
});
