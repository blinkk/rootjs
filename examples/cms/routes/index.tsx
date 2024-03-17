import {Body, Head, Html} from '@blinkk/root';

export default function() {
  return (
    <Html>
      <Head>
        <title>Hello, Root CMS</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      </Head>
      <Body>
        <h1>Hello, Root CMS</h1>
        <p>Visit the <a href="/cms/">CMS</a> to get started.</p>
      </Body>
    </Html>
  );
}
