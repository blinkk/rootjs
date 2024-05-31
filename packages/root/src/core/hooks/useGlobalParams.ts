import {createContext} from 'preact';
import {useContext} from 'preact/hooks';

export type GlobalParamsContext = Record<string, string>;

export const GLOBAL_PARAMS_CONTEXT = createContext<GlobalParamsContext | null>(
  null
);

export const GlobalParamsProvider = GLOBAL_PARAMS_CONTEXT.Provider;

/**
 * A hook that returns a map of global params, configured via the
 * `GlobalParamsProvider` context provider. These params are automatically
 * applied to the `useTranslations()` hook and thus strings can directly use
 * these param values.
 *
 * Usage:
 *
 * ```
 * export default function Page() {
 *   return (
 *     <GlobalParamsProvider value={{priceOfFoo: '$10'}}>
 *       <ItemPrice />
 *     </GlobalParamsProvider>
 *   );
 * }
 *
 * function ItemPrice() {
 *   const t = useTranslations();
 *   return <h1>{t('The price is {priceOfFoo}.')}</h1>;
 * }
 * ```
 *
 * This should render `<h1>The price is $10</h1>`.
 */
export function useGlobalParams() {
  const globalParams = useContext(GLOBAL_PARAMS_CONTEXT) || {};
  return globalParams;
}
