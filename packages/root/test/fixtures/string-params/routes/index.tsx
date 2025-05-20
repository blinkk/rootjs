import {StringParamsProvider, useTranslations} from '../../../../dist/core';

export default function Page() {
  const t = useTranslations();
  return (
    <StringParamsProvider value={{foo: 'foovalue'}}>
      <StringParamsProvider value={{bar: 'barvalue'}}>
        <p>{t('{foo} / {bar}')}</p>
      </StringParamsProvider>
    </StringParamsProvider>
  );
}
