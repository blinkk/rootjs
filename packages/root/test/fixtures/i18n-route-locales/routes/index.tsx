import {useRequestContext} from '../../../../dist/core';

export default function Page() {
  const ctx = useRequestContext();
  return (
    <>
      <p>Current locale: {ctx.route.locale}</p>
      <p>Current path: {ctx.currentPath}</p>
    </>
  );
}
