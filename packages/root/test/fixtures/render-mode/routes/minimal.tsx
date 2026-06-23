import {Handler, HandlerContext, Request} from '../../../../dist/core';

export default function MinimalPage() {
  return (
    <main>
      <h1>Minimal Mode</h1>
    </main>
  );
}

/**
 * SSR handler that overrides the JSX render mode to `'minimal'`, even though
 * `root.config.ts` configures the default mode as `'pretty'`.
 */
export const handle: Handler = async (req: Request) => {
  const ctx = req.handlerContext as HandlerContext;
  return ctx.render({}, {renderMode: 'minimal'});
};
