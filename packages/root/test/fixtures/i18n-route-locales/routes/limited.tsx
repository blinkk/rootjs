import {RouteConfig, useRequestContext} from '../../../../dist/core';

export default function Page() {
  const ctx = useRequestContext();
  return (
    <>
      <p>Current locale: {ctx.route.locale}</p>
      <p>Current path: {ctx.currentPath}</p>
    </>
  );
}

// This route overrides the site-wide `i18n.locales` (en, fr, de) and only
// generates localized paths for `fr`.
export const config: RouteConfig = {
  locales: ['fr'],
};
