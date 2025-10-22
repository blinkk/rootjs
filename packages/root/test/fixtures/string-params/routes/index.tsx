import {StringParamsProvider, useTranslations} from '../../../../dist/core';

export default function Page() {
  return (
    <StringParamsProvider value={{foo: 'foovalue'}}>
      <StringParamsProvider value={{bar: 'barvalue'}}>
        <MyComponent />
      </StringParamsProvider>
    </StringParamsProvider>
  );
}

function MyComponent() {
  const t = useTranslations();
  return <p>{t('{foo} / {bar}')}</p>;
}
