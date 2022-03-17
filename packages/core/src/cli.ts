import {Command} from 'commander';

const program = new Command();
program.version(require('../package.json').version);

program
  .command('dev')
  .description('starts the development server')
  .action(() => {
    console.log('dev');
  });

program
  .command('start')
  .description('starts the production server')
  .action(() => {
    console.log('start');
  });
