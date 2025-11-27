import {schemaToZod} from '../core/zod.js';
import {Schema} from '../core/schema.js';

const sampleSchema: Schema = {
  name: 'BlogPost',
  fields: [
    {
      type: 'string',
      id: 'title',
      label: 'Title',
    },
    {
      type: 'string',
      id: 'slug',
      label: 'Slug',
    },
    {
      type: 'image',
      id: 'heroImage',
      label: 'Hero Image',
    },
    {
      type: 'array',
      id: 'tags',
      label: 'Tags',
      of: {type: 'string'},
    },
  ],
};

console.log('--- Sample Schema ---');
console.log(JSON.stringify(sampleSchema, null, 2));
console.log('\n--- Converting to Zod ---');

const zodSchema = schemaToZod(sampleSchema);

console.log('\n--- Validating Valid Data ---');
const validData = {
  title: 'Hello World',
  slug: 'hello-world',
  heroImage: {
    src: 'https://example.com/image.jpg',
    width: 800,
    height: 600,
    alt: 'A beautiful image',
  },
  tags: ['foo', 'bar'],
};
const validResult = zodSchema.safeParse(validData);
if (validResult.success) {
  console.log('✅ Data is valid');
} else {
  console.error('❌ Data is invalid:', validResult.error);
}

console.log('\n--- Validating Invalid Data ---');
const invalidData = {
  title: 123, // Should be string
  slug: 'hello-world',
  heroImage: {
    src: 123, // Should be string
  },
  tags: 'foo', // Should be array
};
const invalidResult = zodSchema.safeParse(invalidData);
if (invalidResult.success) {
  console.log('✅ Data is valid');
} else {
  console.log('❌ Validation failed as expected:');
  invalidResult.error.issues.forEach((issue) => {
    console.log(`  - ${issue.path.join('.')}: ${issue.message}`);
  });
}
