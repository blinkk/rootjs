export default function Page() {
  return (
    <>
      <h1>Counter</h1>
      <root-counter start={3} />

      <h1>The following element deps should not be auto-injected:</h1>
      <root-exclude />
    </>
  );
}
