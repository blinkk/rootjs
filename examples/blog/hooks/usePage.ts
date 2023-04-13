import {createContext} from 'preact';
import {useContext} from 'preact/hooks';

export const PAGE_CONTEXT = createContext<any | null>(null);

export function usePage() {
  return useContext(PAGE_CONTEXT);
}
