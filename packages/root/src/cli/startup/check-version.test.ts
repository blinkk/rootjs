import {assert, test} from 'vitest';

import {isNewerVersion} from './check-version.js';

test('isNewerVersion compares semantic versions', () => {
  assert.isTrue(isNewerVersion('3.0.2', '3.0.3'));
  assert.isTrue(isNewerVersion('3.0.2', '3.1.0'));
  assert.isTrue(isNewerVersion('3.0.2', '4.0.0'));
  assert.isFalse(isNewerVersion('3.0.2', '3.0.2'));
  assert.isFalse(isNewerVersion('3.0.2', '3.0.1'));
  assert.isFalse(isNewerVersion('3.1.0', '3.0.9'));
  assert.isFalse(isNewerVersion('4.0.0', '3.9.9'));
});

test('isNewerVersion ignores pre-release identifiers', () => {
  assert.isFalse(isNewerVersion('3.0.2', '3.0.2-rc.1'));
  assert.isTrue(isNewerVersion('3.0.2-rc.1', '3.1.0'));
});
