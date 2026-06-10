export async function getStaticPaths() {
  return {
    paths: [{params: {slug: 'foo'}}, {params: {slug: 'bar'}}],
  };
}

interface Props {
  params: {slug: string};
}

export async function getStaticContent(props: Props) {
  const params = props.params;
  return JSON.stringify({slug: params.slug});
}
