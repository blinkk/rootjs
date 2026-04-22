import {ComponentChildren, FunctionalComponent, createContext} from 'preact';
import {useContext} from 'preact/hooks';

type TransformFn = (str: string) => string;

export interface TranslationMiddleware {
  /** Transform the string before translation lookup. */
  beforeTranslate?: TransformFn;
  /** Transform the string after translation lookup. */
  afterTranslate?: TransformFn;
  /** Transform the string before `{param}` values are replaced. */
  beforeReplaceParams?: TransformFn;
  /** Transform the string after `{param}` values are replaced. */
  afterReplaceParams?: TransformFn;
}

export interface TranslationMiddlewareContext {
  beforeTranslateFns: TransformFn[];
  afterTranslateFns: TransformFn[];
  beforeReplaceParamsFns: TransformFn[];
  afterReplaceParamsFns: TransformFn[];
}

const TRANSLATION_MIDDLEWARE_CONTEXT =
  createContext<TranslationMiddlewareContext | null>(null);

export interface TranslationMiddlewareProviderProps {
  value?: TranslationMiddleware;
  children?: ComponentChildren;
}

export const TranslationMiddlewareProvider: FunctionalComponent<
  TranslationMiddlewareProviderProps
> = (props) => {
  const parent = useContext(TRANSLATION_MIDDLEWARE_CONTEXT) || {
    beforeTranslateFns: [],
    afterTranslateFns: [],
    beforeReplaceParamsFns: [],
    afterReplaceParamsFns: [],
  };
  const merged: TranslationMiddlewareContext = {
    beforeTranslateFns: [...parent.beforeTranslateFns],
    afterTranslateFns: [...parent.afterTranslateFns],
    beforeReplaceParamsFns: [...parent.beforeReplaceParamsFns],
    afterReplaceParamsFns: [...parent.afterReplaceParamsFns],
  };
  if (props.value?.beforeTranslate) {
    merged.beforeTranslateFns.push(props.value.beforeTranslate);
  }
  if (props.value?.afterTranslate) {
    merged.afterTranslateFns.push(props.value.afterTranslate);
  }
  if (props.value?.beforeReplaceParams) {
    merged.beforeReplaceParamsFns.push(props.value.beforeReplaceParams);
  }
  if (props.value?.afterReplaceParams) {
    merged.afterReplaceParamsFns.push(props.value.afterReplaceParams);
  }
  return (
    <TRANSLATION_MIDDLEWARE_CONTEXT.Provider value={merged}>
      {props.children}
    </TRANSLATION_MIDDLEWARE_CONTEXT.Provider>
  );
};

export function useTranslationMiddleware(): TranslationMiddlewareContext {
  return (
    useContext(TRANSLATION_MIDDLEWARE_CONTEXT) || {
      beforeTranslateFns: [],
      afterTranslateFns: [],
      beforeReplaceParamsFns: [],
      afterReplaceParamsFns: [],
    }
  );
}
