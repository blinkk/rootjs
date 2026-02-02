import {GetStaticPaths, useRequestContext} from '@blinkk/root';

export const getStaticPaths: GetStaticPaths = async () => {
  return {
    paths: [{params: {id: '123'}}, {params: {id: '456'}}],
  };
};

export default function ProductRoute() {
  const ctx = useRequestContext();
  const {id} = ctx.routeParams;
  return <h1>Product: {id}</h1>;
}
