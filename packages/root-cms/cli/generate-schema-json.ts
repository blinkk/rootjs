import {promises as fs} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadRootConfig, viteSsrLoadModule} from '@blinkk/root/node';
import {Schema} from '../core/schema.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

type ProjectModule = typeof import('../core/project.js');

async function generateSchemaJson() {
  const rootDir = process.cwd();
  const rootConfig = await loadRootConfig(rootDir, {command: 'root-cms'});
  const modulePath = path.resolve(__dirname, '../core/project.js');
  const project = (await viteSsrLoadModule(rootConfig, modulePath)) as ProjectModule;
  const schemas = project.getProjectSchemas();
  const outDir = path.join(rootDir, 'dist', 'collections');
  await fs.mkdir(outDir, {recursive: true});
  for (const [fileId, schema] of Object.entries(schemas) as [string, Schema][]) {
    if (!fileId.startsWith('/collections/')) {
      continue;
    }
    const collectionId = path.basename(fileId).split('.')[0];
    const jsonPath = path.join(outDir, `${collectionId}.json`);
    const data = JSON.stringify({...schema, id: collectionId}, null, 2);
    await fs.writeFile(jsonPath, data);
  }
}

generateSchemaJson().catch((err) => {
  console.error(err);
  process.exit(1);
});
