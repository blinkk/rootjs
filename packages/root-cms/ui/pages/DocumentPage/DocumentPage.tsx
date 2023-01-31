export function DocumentPage(props: any) {
  const collectionId = props.matches?.collection || '';
  const slug = props.matches?.slug || '';
  const docId = `${collectionId}/${slug}`;
  return <h1>Document Page: {docId}</h1>;
}
