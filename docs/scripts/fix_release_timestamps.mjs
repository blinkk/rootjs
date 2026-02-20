import {loadRootConfig} from '@blinkk/root/node';
import {RootCMSClient} from '@blinkk/root-cms';
import {Timestamp} from 'firebase-admin/firestore';

async function main() {
  const rootConfig = await loadRootConfig(process.cwd());
  const client = new RootCMSClient(rootConfig);
  const db = client.db;
  const releases = await db.collection('Projects/www/Releases').get();

  for (const doc of releases.docs) {
    const data = doc.data();
    let changed = false;

    // Check createdAt field
    if (data.createdAt && !(data.createdAt instanceof Timestamp)) {
      if (data.createdAt._seconds && data.createdAt._nanoseconds) {
        data.createdAt = new Timestamp(
          data.createdAt._seconds,
          data.createdAt._nanoseconds
        );
        changed = true;
      }
    }

    // Check publishedAt field
    if (data.publishedAt && !(data.publishedAt instanceof Timestamp)) {
      if (data.publishedAt._seconds && data.publishedAt._nanoseconds) {
        data.publishedAt = new Timestamp(
          data.publishedAt._seconds,
          data.publishedAt._nanoseconds
        );
        changed = true;
      }
    }

    if (changed) {
      console.log(`Updating release ${doc.id}`);
      await doc.ref.set(data);
    }
  }
  console.log('Done');
}

main();
