import {createContext} from 'preact';
import {useContext} from 'preact/hooks';
import {PreTranslationFunc, PostTranslationFunc} from '../types';

/**
 * Defines the shape of the context value for string transformations.
 */
export interface TransformationContextValue {
  /**
   * A function called before a string is passed to the translation mechanism.
   * Useful for normalizing strings or making locale-specific adjustments
   * before translation lookup.
   * @param str The original string.
   * @param locale The current locale.
   * @returns The processed string.
   */
  preTranslation: PreTranslationFunc;
  /**
   * A function called after a string has been translated and parameters
   * have been substituted. Useful for final adjustments to the translated
   * string, such as formatting or injecting non-breaking spaces.
   * @param translatedStr The translated string with parameters substituted.
   * @param params The parameters used for substitution.
   * @param locale The current locale.
   * @returns The processed string.
   */
  postTranslation: PostTranslationFunc;
}

/**
 * React Context for providing and consuming string transformation functions.
 * This context allows components deeper in the tree to access `preTranslation`
 * and `postTranslation` functions provided by an ancestor `TransformationProvider`.
 */
export const TransformationContext =
  createContext<TransformationContextValue | null>(null);

/**
 * Custom hook to access the string transformation functions from
 * `TransformationContext`.
 *
 * If the hook is used outside a `TransformationProvider`, it returns default
 * identity functions for both `preTranslation` and `postTranslation`, meaning
 * strings will pass through unchanged.
 *
 * @returns An object containing `preTranslation` and `postTranslation` functions.
 */
export const useTransformationContext = (): TransformationContextValue => {
  const contextValue = useContext(TransformationContext);
  if (contextValue === null) {
    return {
      preTranslation: (str) => str,
      postTranslation: (str) => str,
    };
  }
  return contextValue;
};
