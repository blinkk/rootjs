import {createContext} from 'preact';
import {useContext} from 'preact/hooks';
import {Route} from '../render/router';

export interface RequestContext {
  route: Route;
}

export const REQUEST_CONTEXT = createContext<RequestContext | null>(null);

export function useRequestContext() {
  return useContext(REQUEST_CONTEXT)!;
}
