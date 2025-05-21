import {FunctionComponent, ReactNode} from 'preact';
import {TransformationContext} from '../hooks/useTransformationContext.js';
import {PreTranslationFunc, PostTranslationFunc} from '../types.js';

/**
 * Props for the `TransformationProvider` component.
 */
export interface TransformationProviderProps {
  /**
   * An optional function to be called before a string is translated.
   * This function receives the original string and the current locale.
   * It can be used to modify the string before it's looked up in
   * translation files, for example, to normalize text or provide
   * locale-specific string variations.
   * If not provided, the original string is used directly.
   */
  preTranslation?: PreTranslationFunc;
  /**
   * An optional function to be called after a string has been translated
   * and any parameters have been substituted. This function receives the
   * translated string, the parameters used, and the current locale.
   * It can be used for final adjustments, like formatting or ensuring
   * specific wordings based on the translated content.
   * If not provided, the translated string is used as-is.
   */
  postTranslation?: PostTranslationFunc;
  /**
   * The child components that will have access to the transformation functions
   * provided by this provider.
   */
  children: ReactNode;
}

/**
 * A component that provides string transformation functions (`preTranslation` and
 * `postTranslation`) to its descendant components via the `TransformationContext`.
 *
 * This allows for custom manipulation of strings at two stages of the
 * internationalization (i18n) process:
 * 1. **Before translation (`preTranslation`)**: Modify a string before it's
 *    looked up in the translation messages. This is useful for normalization,
 *    or for handling locale-specific source strings (e.g., using "colour"
 *    for `en-GB` and "color" for `en-US` before looking up the actual
 *    translation).
 * 2. **After translation (`postTranslation`)**: Modify a string after it has
 *    been translated and parameters have been inserted. This is useful for
 *    locale-specific formatting of the translated content, such as ensuring
 *    non-breaking spaces in product names or handling complex parameter
 *    formatting.
 *
 * If `preTranslation` or `postTranslation` props are not provided, identity
 * functions (which return the input string unchanged) are used by default.
 *
 * @example
 * ```tsx
 * import {TransformationProvider} from './TransformationProvider';
 * import {useTranslations} from '../hooks/useTranslations';
 *
 * // Example of preTranslation: Using a different source string for a specific locale
 * const preTranslateExample = (str: string, locale: string): string => {
 *   if (locale === 'en-GB' && str === 'vacation') {
 *     return 'holiday'; // For British English, "holiday" is preferred over "vacation"
 *   }
 *   return str;
 * };
 *
 * // Example of postTranslation: Ensuring product names use non-breaking spaces
 * const postTranslateExample = (
 *   translatedStr: string,
 *   params: Record<string, string | number> | undefined,
 *   locale: string
 * ): string => {
 *   if (params?.productName && typeof params.productName === 'string') {
 *     const nbspProductName = params.productName.replace(/ /g, '&nbsp;');
 *     return translatedStr.replace(params.productName, nbspProductName);
 *   }
 *   // Example: Reformat custom footnote syntax like "foo[footnote:bar]" to "foo<sup>bar</sup>"
 *   return translatedStr.replace(
 *     /\[footnote:([^\]]+)\]/g,
 *     '<sup>$1</sup>'
 *   );
 * };
 *
 * const App = () => (
 *   <TransformationProvider
 *     preTranslation={preTranslateExample}
 *     postTranslation={postTranslateExample}
 *   >
 *     <PageContent />
 *   </TransformationProvider>
 * );
 *
 * const PageContent = () => {
 *   const t = useTranslations();
 *
 *   // Assuming 'en-GB' locale and "vacation" translates to "Vacation" by default,
 *   // but "holiday" translates to "Holiday".
 *   // preTranslateExample changes "vacation" to "holiday" before lookup.
 *   console.log(t('vacation')); // Outputs "Holiday"
 *
 *   // Example of postTranslation with product name
 *   console.log(t('Buy {productName} now!', {productName: 'Super Cool Gadget'}));
 *   // Outputs "Buy Super&nbsp;Cool&nbsp;Gadget now!"
 *
 *   // Example of postTranslation with footnote
 *   console.log(t('See details[footnote:1]'));
 *   // Outputs "See details<sup>1</sup>"
 *
 *   return (
 *     <div>
 *       <p>{t('Welcome to our store!')}</p>
 *       <p>{t('Check out the new {productName}!', {productName: 'Awesome Phone'})}</p>
 *     </div>
 *   );
 * }
 * ```
 */
export const TransformationProvider: FunctionComponent<
  TransformationProviderProps
> = (props) => {
  const {
    preTranslation: preTranslationFromProps,
    postTranslation: postTranslationFromProps,
    children,
  } = props;

  const preTranslation = preTranslationFromProps ?? ((str) => str);
  const postTranslation = postTranslationFromProps ?? ((str) => str);

  return (
    <TransformationContext.Provider value={{preTranslation, postTranslation}}>
      {children}
    </TransformationContext.Provider>
  );
};
