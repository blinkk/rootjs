import {GetStaticPaths, useRouter} from '@blinkk/root';

export const getStaticPaths: GetStaticPaths = async () => {
  return {
    paths: [{params: {id: '123'}}, {params: {id: '456'}}],
  };
};

export default function ProductRoute() {
  const router = useRouter();
  const {id} = router.params;
  return <h1>Product: {id}</h1>;
}
