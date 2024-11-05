import {useTranslations} from '@blinkk/root';
import {BaseLayout} from '@/layouts/BaseLayout.js';
import strings from '@/strings.json';

export default function Page() {
  const t = useTranslations();
  return (
    <BaseLayout title={strings['404.meta.title']}>
      <h1>{t(strings['404.title'])}</h1>
      <p>{t(strings['404.body'])}</p>
    </BaseLayout>
  );
}
