import {
  TranslationMiddlewareProvider,
  useTranslations,
} from '../../../../dist/core.js';

export default function Page() {
  return (
    <TranslationMiddlewareProvider
      value={{
        beforeTranslate: (s: string) => s.toUpperCase(),
        afterTranslate: (s: string) => s + '!',
      }}
    >
      <Content />
    </TranslationMiddlewareProvider>
  );
}

function Content() {
  const t = useTranslations();
  return <p>{t('hello')}</p>;
}
