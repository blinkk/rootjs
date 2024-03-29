import {Head, Html, Body} from '../../../../dist/core';

export default function Page() {
  return (
    <Html lang="en-GB" dir="ltr">
      <Head>
        <title>Hello world</title>
        <meta content="website" property="og:type" />
        <meta content="summary_large_image" name="twitter:card" />
        <meta content="Hello world" property="og:title" />
      </Head>
      <Body className="body">
        <h1>Hello world</h1>
      </Body>
    </Html>
  );
}
