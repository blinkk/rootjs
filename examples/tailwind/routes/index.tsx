import {Body, Head, Html} from '@blinkk/root';
import type {GetStaticPaths} from '@blinkk/root';

export const getStaticPaths: GetStaticPaths = async () => {
  return {paths: [{params: {}}]};
};

export default function Index() {
  return (
    <Html>
      <Head>
        <title>Root.js + Tailwind CSS</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <link rel="stylesheet" href="/styles/index.css" />
      </Head>
      <Body>
        <div class="min-h-screen bg-gray-50 flex items-center justify-center p-8">
          <div class="text-center">
            <h1 class="text-4xl font-bold text-secondary sm:text-primary">
              Hello, Root.js + Tailwind CSS
            </h1>
            <p class="mt-4 text-lg text-gray-600">
              A minimal example using Root.js with Tailwind CSS v4.
            </p>
            <a
              href="https://rootjs.dev"
              class="mt-6 inline-block rounded-md bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-500 transition-colors"
            >
              Learn More
            </a>
          </div>
        </div>
      </Body>
    </Html>
  );
}
