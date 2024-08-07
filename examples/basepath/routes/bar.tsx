import {useTranslations} from '@blinkk/root';
import {BaseLayout} from '@/layouts/BaseLayout.js';

export default function Page() {
  const t = useTranslations();
  return (
    <BaseLayout title="Not found">
      <h1>{t('404')}</h1>
    </BaseLayout>
  );
}
