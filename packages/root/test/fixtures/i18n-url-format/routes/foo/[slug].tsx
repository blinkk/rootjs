import {
  GetStaticPaths,
  GetStaticProps,
  useRequestContext,
} from '../../../../../dist/core';

interface PageProps {
  localeFromParams: string;
}

export default function Page(props: PageProps) {
  const ctx = useRequestContext();
  return (
    <>
      <p>Current path: {ctx.currentPath}</p>
      <p>Locale from params: {props.localeFromParams}</p>
    </>
  );
}

export const getStaticPaths: GetStaticPaths = async () => {
  return {
    paths: [{params: {slug: 'bar'}}],
  };
};

export const getStaticProps: GetStaticProps<PageProps> = async (ctx) => {
  return {
    props: {
      localeFromParams: ctx.params.$locale || 'default',
    },
  };
};
