import {BaseLayout} from '@/layouts/base';
import {t} from '@blinkk/root';

export default function Page() {
  return (
    <BaseLayout title="Welcome to Root.js!">
      <h1>{t('Hello world!')}</h1>
    </BaseLayout>
  );
}
