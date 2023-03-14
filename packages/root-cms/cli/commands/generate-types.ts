import {generateSchemaDts} from '../../core/typegen';

export async function generateTypes() {
  const rootDir = process.cwd();
  generateSchemaDts(rootDir);
}
