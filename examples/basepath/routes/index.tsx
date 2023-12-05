import {useRequestContext, useTranslations} from '@blinkk/root';
import {BaseLayout} from '@/layouts/BaseLayout.js';

export default function Page() {
  const t = useTranslations();
  const ctx = useRequestContext();
  return (
    <BaseLayout title="Welcome to Root.js!">
      <h1>{t('Foo route')}</h1>
      <p>locale: {ctx.locale}</p>
    </BaseLayout>
  );
}
