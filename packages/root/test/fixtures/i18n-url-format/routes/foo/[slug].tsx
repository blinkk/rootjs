import {GetStaticPaths, GetStaticProps} from '../../../../../dist/core';

interface PageProps {
  localeFromParams: string;
}

export default function Page(props: PageProps) {
  return (
    <>
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
