import {assert, test} from 'vitest';

import {isNewerVersion, isPrerelease} from './check-version.js';

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

test('isPrerelease detects alpha/beta/rc builds', () => {
  assert.isTrue(isPrerelease('3.1.0-alpha'));
  assert.isTrue(isPrerelease('3.1.0-alpha.1'));
  assert.isTrue(isPrerelease('3.1.0-beta.2'));
  assert.isTrue(isPrerelease('3.1.0-rc.1'));
  assert.isFalse(isPrerelease('3.1.0'));
  assert.isFalse(isPrerelease('3.1.0-canary.1'));
});
