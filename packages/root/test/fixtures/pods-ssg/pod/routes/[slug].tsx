export async function getStaticPaths() {
  return {
    paths: [{params: {slug: 'alpha'}}, {params: {slug: 'beta'}}],
  };
}

export async function getStaticProps(ctx: {params: {slug: string}}) {
  return {props: {slug: ctx.params.slug}};
}

export default function SlugPage(props: {slug: string}) {
  return <h1>Pod: {props.slug}</h1>;
}
