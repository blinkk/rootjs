import {
  HistoryState,
  createEmptyHistoryState,
} from '@lexical/react/LexicalHistoryPlugin';
import {ComponentChildren, createContext} from 'preact';
import {useContext, useMemo} from 'preact/hooks';

type SharedHistory = {
  historyState?: HistoryState;
};

const Context: React.Context<SharedHistory> = createContext({});

interface SharedHistoryProviderProps {
  children?: ComponentChildren;
}

export function SharedHistoryProvider(props: SharedHistoryProviderProps) {
  const sharedHistory = useMemo(() => {
    return {historyState: createEmptyHistoryState()};
  }, []);
  return (
    <Context.Provider value={sharedHistory}>{props.children}</Context.Provider>
  );
}

export function useSharedHistory(): SharedHistory {
  return useContext(Context);
}
