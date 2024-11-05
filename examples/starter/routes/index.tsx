import {useTranslations} from '@blinkk/root';
import {BaseLayout} from '@/layouts/BaseLayout.js';
import strings from '@/strings.json';

export default function Page() {
  const t = useTranslations();
  return (
    <BaseLayout title={strings['home.meta.title']}>
      <h1>{t(strings['home.title'])}</h1>
    </BaseLayout>
  );
}
