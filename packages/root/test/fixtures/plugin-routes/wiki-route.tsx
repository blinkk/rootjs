import {GetStaticPaths, useRequestContext} from '@blinkk/root';

export const getStaticPaths: GetStaticPaths = async () => {
  return {
    paths: [
      {params: {slug: ''}},
      {params: {slug: 'foo'}},
      {params: {slug: 'foo/bar'}},
    ],
  };
};

export default function WikiRoute() {
  const ctx = useRequestContext();
  const {slug} = ctx.routeParams;
  const slugStr = Array.isArray(slug) ? slug.join('/') : slug;
  return <h1>Wiki: {slugStr || 'index'}</h1>;
}
