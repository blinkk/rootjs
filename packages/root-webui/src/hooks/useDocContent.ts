import useSWR from 'swr';
import {useDoc} from './useDoc';

interface UseDocContentOptions {
  mode?: 'draft' | 'published';
}

export function useDocContent(docId: string, options: UseDocContentOptions) {
  const doc = useDoc(docId);
  async function fetch() {
    return await doc.getContent({mode: options.mode});
  }
  const {data, error} = useSWR(docId, fetch);
  return {
    content: data,
    isLoading: !error && !data,
    isError: error,
  };
}
