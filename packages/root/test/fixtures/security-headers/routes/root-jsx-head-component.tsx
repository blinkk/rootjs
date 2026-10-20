/** @jsxImportSource @blinkk/root/jsx */

import {Body, Head, Html} from '../../../../dist/core';

function Analytics() {
  return <script>{'console.log("analytics")'}</script>;
}

export default function RootJsxHeadComponent() {
  return (
    <Html>
      <Head>
        <Analytics />
      </Head>
      <Body>
        <h1>Root JSX Head Component</h1>
      </Body>
    </Html>
  );
}
