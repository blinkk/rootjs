import {useTranslations} from '@blinkk/root';

import {BaseLayout} from '@/layouts/BaseLayout.js';

export default function Page() {
  const t = useTranslations();
  return (
    <BaseLayout title="Welcome to Root.js!">
      <h1>{t('Hello world!')}</h1>
    </BaseLayout>
  );
}
