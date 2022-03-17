import {Command} from 'commander';
import {dev} from './commands/dev';

const program = new Command();
program.version(require('../package.json').version);

program.command('dev').description('starts the development server').action(dev);

program.parse(process.argv);
