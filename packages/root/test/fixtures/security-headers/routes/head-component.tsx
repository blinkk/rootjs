import {Body, Head, Html, useRequestContext} from '../../../../dist/core';

function Analytics() {
  const ctx = useRequestContext();
  return <script>{`console.log(${JSON.stringify(ctx.currentPath)})`}</script>;
}

export default function HeadComponent() {
  return (
    <Html>
      <Head>
        <Analytics />
      </Head>
      <Body>
        <h1>Head Component</h1>
      </Body>
    </Html>
  );
}
