import {Handler, HandlerContext, Request} from '@blinkk/root';

import {BaseLayout} from '@/layouts/BaseLayout.js';

interface Props {
  locale: string;
}

export default function IndexPage(props: Props) {
  return (
    <BaseLayout title="Hello World">
      <div style={{padding: '2rem', textAlign: 'center'}}>
        <h1>Hello World</h1>
        <p>Welcome to the Root.js blog example!</p>
      </div>
    </BaseLayout>
  );
}

/** SSR handler. */
export const handle: Handler = async (req: Request) => {
  const ctx = req.handlerContext as HandlerContext<Props>;
  const supportedLocales = ['en'];
  const locale = ctx.getPreferredLocale(supportedLocales);

  return ctx.render({locale});
};
