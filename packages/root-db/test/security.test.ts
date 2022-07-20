import * as fs from 'fs';
import {afterAll, beforeAll, beforeEach, test} from 'vitest';
import {assertFails, initializeTestEnvironment, RulesTestEnvironment} from '@firebase/rules-unit-testing';
import {doc, getDoc} from 'firebase/firestore';

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

test('should not allow users to read from a random collection', async () => {
  const unauthedDb = testEnv.unauthenticatedContext().firestore();
  await assertFails(getDoc(doc(unauthedDb, 'foo/bar')));
});
