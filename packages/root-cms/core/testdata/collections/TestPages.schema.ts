/**
 * Test schema fixture for integration tests.
 * Uses relative imports to avoid dependency on the built package.
 */
import {collection, string, number} from '../../schema.js';

export default collection({
  name: 'TestPages',
  description: 'Test pages for integration tests.',
  url: '/test/[slug]',
  fields: [
    string({id: 'title', label: 'Title'}),
    number({id: 'count', label: 'Count'}),
  ],
});
