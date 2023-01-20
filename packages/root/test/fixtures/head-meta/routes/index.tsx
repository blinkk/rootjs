import {Head, Html} from '../../../../dist/core';

export default function Page() {
  return (
    <Html lang="en-GB">
      <Head>
        <title>Hello world</title>
        <meta content="website" property="og:type" />
        <meta content="summary_large_image" name="twitter:card" />
        <meta content="Hello world" property="og:title" />
      </Head>
      <h1>Hello world</h1>
    </Html>
  );
}
