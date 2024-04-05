/** Firebase Functions. */

import {server} from '@blinkk/root/functions';
import {cron} from '@blinkk/root-cms/functions';

export const www = {
  server: server({
    mode: 'production',
    httpsOptions: {
      minInstances: 1,
    },
  }),
  cron: cron(),
};
