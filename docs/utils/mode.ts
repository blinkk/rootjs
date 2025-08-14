import {useRequestContext} from '@blinkk/root';

export function testPreviewMode() {
  return !!testQueryParam('preview');
}

export function testQueryParam(param: string) {
  const ctx = useRequestContext();
  return ctx.props.req?.query?.[param];
}
