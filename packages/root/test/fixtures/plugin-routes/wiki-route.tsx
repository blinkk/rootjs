import {GetStaticPaths, useRouter} from '@blinkk/root';

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
  const router = useRouter();
  const {slug} = router.params;
  const slugStr = Array.isArray(slug) ? slug.join('/') : slug;
  return <h1>Wiki: {slugStr || 'index'}</h1>;
}
