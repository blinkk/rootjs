import {useRequestContext, useTranslations} from '../../../../dist/core';

export default function Page() {
  const ctx = useRequestContext();
  const t = useTranslations();
  return (
    <>
      <h1>{t('Hello world!')}</h1>
      <p>Current locale: {ctx.route.locale}</p>
    </>
  );
}
