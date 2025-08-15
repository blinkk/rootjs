import {useRequestContext} from '@blinkk/root';

/** Gets a query param value. */
function getQueryParam(param: string) {
  const ctx = useRequestContext();
  return ctx.props.req?.query?.[param];
}

/** Tests whether the request is in preview mode (by checking the query param "preview"). */
export function testPreviewMode() {
  return getQueryParam('preview') === 'true';
}

/** Tests whether the request is in embed mode (if the request is originating from the CMS preview iframe). */
export function testEmbedMode() {
  // Require preview mode for embed mode to be true.
  if (!testPreviewMode()) {
    return false;
  }
  const ctx = useRequestContext();
  const referer = ctx.props.req.headers['referer'] || '';
  if (!referer) {
    return false;
  }
  const url = new URL(referer);
  return url.pathname.startsWith('/cms/content/');
}
