import {defineConfig} from '../../../dist/core';

export default defineConfig({
  prettyHtml: true,
  server: {
    trailingSlash: true,
    redirects: [
      {
        source: '/old-page',
        destination: '/new-page/',
        type: 301,
      },
    ],
  },
});
