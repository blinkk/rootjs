import {useTranslations} from '../../../../dist/core';

export default function Page() {
  const t = useTranslations();
  return <h1>{t('Hello world!')}</h1>;
}
