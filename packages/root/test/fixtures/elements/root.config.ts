import path from 'node:path';
import {URL} from 'node:url';

const rootDir = new URL('.', import.meta.url).pathname;

export default {
  elements: {
    include: [path.resolve(rootDir, 'designsystem')],
    exclude: [/\.stories\.tsx$/],
  },
};
