import {createContext} from 'preact';
import {useContext} from 'preact/hooks';

export type StringParamsContext = Record<string, string>;

export const STRING_PARAMS_CONTEXT = createContext<StringParamsContext | null>(
  null
);

export const StringParamsProvider = STRING_PARAMS_CONTEXT.Provider;

/**
 * A hook that returns a map of string params, configured via the
 * `StringParamsProvider` context provider. These params are automatically
 * applied to the `useTranslations()` hook.
 *
 *
 * Usage:
 *
 * ```
 * export default function Page() {
 *   return (
 *     <StringParamsProvider value={{nameOfUser: 'Alice'}}>
 *       <ItemPrice />
 *     </StringParamsProvider>
 *   );
 * }
 *
 * function ItemPrice() {
 *   const t = useTranslations();
 *   return <h1>{t('Hello, {nameOfUser}!')}</h1>;
 * }
 * ```
 *
 * This should render `<h1>Hello, Alice!</h1>`.
 */
export function useStringParams() {
  return useContext(STRING_PARAMS_CONTEXT) || {};
}
