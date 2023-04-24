import {
  GetStaticProps,
  useRequestContext,
  useTranslations,
} from '../../../../dist/core';

export default function Page() {
  const ctx = useRequestContext();
  const t = useTranslations();
  return (
    <>
      <h1>{t('Hello world!')}</h1>
      <p>{t('custom translation')}</p>
      <p>Current locale: {ctx.route.locale}</p>
    </>
  );
}

export const getStaticProps: GetStaticProps = async (ctx) => {
  const locale = ctx.params.$locale;
  return {
    translations: {'custom translation': `custom translation (${locale})`},
  };
};
