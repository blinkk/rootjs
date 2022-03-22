import {Command} from 'commander';
import {register as esbuildRegister} from 'esbuild-register/dist/node';
import {dev} from './commands/dev';

// Allows dynamic import() calls for .ts files.
esbuildRegister();

const program = new Command();
program.version(require('../package.json').version);

program
  .command('dev [path]')
  .description('starts the development server')
  .action(dev);

program.parse(process.argv);
