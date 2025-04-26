import {useRequestContext} from '../../../../dist/core.js';

export default function Page() {
  const ctx = useRequestContext();
  return (
    <>
      <p>Current path: {ctx.currentPath}</p>
    </>
  );
}
