import {Command} from 'commander';
import {bgGreen, black} from 'kleur/colors';
import {generateTypes} from './generate-types.js';
import {initFirebase} from './init-firebase.js';
import {pruneTranslations} from './prune-translations.js';

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
      .command('prune_translations <doc>')
      .alias('prune-translations')
      .description(
        'removes unused translations tagged with the provided doc id'
      )
      .action(pruneTranslations);
    await program.parseAsync(argv);
  }
}

export {CliRunner, generateTypes, initFirebase, pruneTranslations};
