import {useTranslations} from '@blinkk/root';
import {BaseLayout} from '@/layouts/BaseLayout.js';

export default function Page() {
  const t = useTranslations();
  return (
    <BaseLayout title="Welcome to Root.js!">
      <h1>{t('Bar route')}</h1>
    </BaseLayout>
  );
}
