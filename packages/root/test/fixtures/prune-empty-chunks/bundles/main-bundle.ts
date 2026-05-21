// Imports the type-only bundle for side effects. After tree-shaking, the
// imported bundle is empty, leaving a dangling `import "./empty-bundle.js"`
// that must be pruned along with the empty chunk.
import './empty-bundle.js';

console.log('main bundle loaded');
