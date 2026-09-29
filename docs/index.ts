/** Firebase Functions. */

import {server} from '@blinkk/root/functions';
import {cron} from '@blinkk/root-cms/functions';

export const www = {
  server: server({
    mode: 'production',
    httpsOptions: {
      minInstances: 1,
      // The default 256MiB is nearly used up by loading Root.js, Root CMS and
      // the Firestore client, so instances ran out of memory under load.
      memory: '1GiB',
      // SSR is CPU-bound and each instance has a single vCPU. A lower
      // concurrency than the default (80) makes Cloud Run scale out instead of
      // queueing requests on one instance until they time out.
      concurrency: 20,
    },
  }),
  cron: cron(),
};
