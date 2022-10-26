import path from 'path';

export default {
  elements: {
    include: [path.resolve(__dirname, 'designsystem')],
    exclude: [/\.stories\.tsx$/],
  },
};
