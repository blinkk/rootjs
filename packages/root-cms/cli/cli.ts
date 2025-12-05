import {Command} from 'commander';
import {bgGreen, black} from 'kleur/colors';
import {exportData} from './export.js';
import {generateTypes} from './generate-types.js';
import {importData} from './import.js';
import {initFirebase} from './init-firebase.js';

class CliRunner {
  private name: string;
  private version: string;

  constructor(name: string, version: string) {
    this.name = name;
    this.version = version;
  }

  async run(argv: string[]) {
    const program = new Command(this.name);
    program.version(this.version);
    program.option('-q, --quiet', 'quiet');
    program.hook('preAction', (cmd) => {
      if (!cmd.opts().quiet) {
        console.log(
          `🥕 ${bgGreen(black(` ${this.name} `))} v${this.version}\n`
        );
      }
    });
    program
      .command('init-firebase')
      .alias('init')
      .description('inits the firebase project proper security rules')
      .option('--project <project>', 'gcp project id')
      .option('--admin <email>', 'adds an admin to the project')
      .action(initFirebase);
    program
      .command('generate-types')
      .alias('types')
      .description(
        'generates root-cms.d.ts from *.schema.ts files in the project'
      )
      .action(generateTypes);
    program
      .command('export')
      .description('exports firestore data to a local directory')
      .option(
        '--filter <pattern>',
        'comma-separated list of glob patterns to filter content (e.g. Collections/Pages/**, !ActionLogs/**)'
      )
      .option('--site <siteId>', 'site id to export (overrides root config)')
      .option(
        '--database <databaseId>',
        'firestore database id (overrides root config, default: "(default)")'
      )
      .option('--project <projectId>', 'gcp project id (overrides root config)')
      .action(exportData);
    program
      .command('import')
      .description('imports firestore data from a local directory')
      .option('--dir <directory>', 'directory to import from (required)')
      .option(
        '--filter <pattern>',
        'comma-separated list of glob patterns to filter content (e.g. Collections/Pages/**, !ActionLogs/**)'
      )
      .option('--site <siteId>', 'site id to import to (overrides root config)')
      .option(
        '--database <databaseId>',
        'firestore database id (overrides root config, default: "(default)")'
      )
      .option('--project <projectId>', 'gcp project id (overrides root config)')
      .action(importData);
    await program.parseAsync(argv);
  }
}

export {CliRunner, exportData, generateTypes, importData, initFirebase};
