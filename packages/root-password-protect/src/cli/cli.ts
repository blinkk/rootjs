import {Command} from 'commander';
import {bgGreen, black} from 'kleur/colors';
import {generateHash} from './generate-hash';

export class CliRunner {
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
      .command('generate-hash <password>')
      .description('generates a hash/salt pair from a plain-text password')
      .action(generateHash);
    await program.parseAsync(argv);
  }
}
