import {GetStaticPaths} from '@blinkk/root';

export default function Page(props: any) {
  return (
    <>
      <h1>Blog</h1>
      <p>{JSON.stringify(props)}</p>
    </>
  );
}

export const getStaticPaths: GetStaticPaths = async () => {
  return {paths: []};
}
