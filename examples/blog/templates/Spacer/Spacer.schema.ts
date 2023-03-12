import {schema} from '@blinkk/root-cms';

const heightOptions = [
  {value: ''},
  {value: '0'},
  {value: '4'},
  {value: '6'},
  {value: '8'},
  {value: '12'},
  {value: '16'},
  {value: '20'},
  {value: '24'},
  {value: '28'},
  {value: '32'},
  {value: '36'},
  {value: '40'},
  {value: '48'},
  {value: '60'},
  {value: '80'},
  {value: '90'},
  {value: '100'},
  {value: '120'},
  {value: '160'},
  {value: '200'},
];

export default schema.define({
  name: 'Spacer',
  description: 'Adds vertical spacing between modules.',
  fields: [
    schema.select({
      id: 'desktopHeight',
      label: 'Desktop Height',
      help: 'Height of the spacer for the desktop layout. If blank, defaults to 80.',
      placeholder: 'Select desktop height',
      options: heightOptions,
    }),
    schema.select({
      id: 'tabletHeight',
      label: 'Tablet Height',
      help: 'Height of the spacer for the tablet layout. If blank, defaults to the desktop size.',
      placeholder: 'Select tablet height',
      options: heightOptions,
    }),
    schema.select({
      id: 'mobileHeight',
      label: 'Mobile Height',
      help: 'Height of the spacer for the mobile layout. If blank, defaults to the desktop size.',
      placeholder: 'Select mobile height',
      options: heightOptions,
    }),
  ],
});
