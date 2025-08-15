import {useRequestContext} from '@blinkk/root';

/** Tests whether the request is in preview mode (by checking the query param "preview"). */
export function testPreviewMode() {
  return getQueryParam('preview') === 'true';
}

/** Gets a query param value. */
export function getQueryParam(param: string) {
  const ctx = useRequestContext();
  return ctx.props.req?.query?.[param];
}
