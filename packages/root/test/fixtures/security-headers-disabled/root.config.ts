import {defineConfig} from '../../../dist/core';

export default defineConfig({
  prettyHtml: true,
  server: {
    trailingSlash: true,
    security: {
      contentSecurityPolicy: false,
      strictTransportSecurity: false,
      xContentTypeOptions: false,
      xFrameOptions: false,
      xXssProtection: false,
    },
  },
});
