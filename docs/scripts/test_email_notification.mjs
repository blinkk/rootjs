/**
 * Sends a synthetic action through the CMS notification pipeline so the
 * configured email notification plugin queues an email. Useful to verify
 * the plugin end-to-end without performing a real publish or task action.
 *
 * Usage:
 *   pnpm --filter @private/docs exec node scripts/test_email_notification.mjs [--action=<name>] [--task=<id>]
 */
import {loadRootConfig} from '@blinkk/root/node';
import {RootCMSClient} from '@blinkk/root-cms';

function parseArgs() {
  const out = {action: 'doc.publish', metadata: {docId: 'Pages/test'}};
  for (const arg of process.argv.slice(2)) {
    const [key, value] = arg.replace(/^--/, '').split('=');
    if (!key) continue;
    if (key === 'action') {
      out.action = value || out.action;
    } else if (key === 'task') {
      out.action = 'tasks.comment.add';
      out.metadata = {taskId: value || '1', mentions: []};
    } else if (key === 'mention') {
      out.metadata.mentions = (value || '').split(',').filter(Boolean);
    } else if (key === 'docId') {
      out.metadata.docId = value || out.metadata.docId;
    }
  }
  return out;
}

async function main() {
  const {action, metadata} = parseArgs();
  const rootConfig = await loadRootConfig(process.cwd());
  const client = new RootCMSClient(rootConfig);
  console.log(`logging action=${action} metadata=${JSON.stringify(metadata)}`);
  await client.logAction(action, {
    by: process.env.TEST_ACTOR || 'tester@example.com',
    metadata,
  });
  console.log('done. check Projects/<id>/Emails for the queued email doc.');
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
