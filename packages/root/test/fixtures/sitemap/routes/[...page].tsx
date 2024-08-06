export default function Page(props: {slug: string}) {
  return <h1>Hello, {props.slug}!!</h1>;
}

export async function getStaticPaths() {
  return {
    paths: [{params: {page: 'bar'}}, {params: {page: 'baz'}}],
  };
}

export async function getStaticProps(ctx) {
  return {props: {slug: ctx.params.page}};
}
