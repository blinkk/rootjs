export async function getStaticPaths() {
  return {paths: [{params: {slug: 'foo'}}, {params: {slug: 'bar'}}]};
}

export async function getStaticContent({params}: {params: {slug: string}}) {
  return JSON.stringify({slug: params.slug});
}
