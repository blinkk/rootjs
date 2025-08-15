import {useRequestContext} from '@blinkk/root';

/** Tests whether the request is in preview mode (by checking the query param "preview"). */
export function testPreviewMode() {
  return testQueryParam('preview') === 'true';
}

/** Tests whether a query param exists, and if so, whether the value is not verbatim "false". */
export function testQueryParam(param: string) {
  const ctx = useRequestContext();
  const value = ctx.props.req?.query?.[param];
  return value ? value !== false : value;
}
