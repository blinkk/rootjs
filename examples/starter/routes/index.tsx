import {BaseLayout} from '@/layouts/base';
import {useTranslations} from '@blinkk/root';

export default function Page() {
  const t = useTranslations();
  return (
    <BaseLayout title="Welcome to Root.js!">
      <h1>{t('Hello world!')}</h1>
    </BaseLayout>
  );
}
