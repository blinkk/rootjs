/**
 * Hook for handling server-sent events (SSE).
 *
 * The SSEProvider creates and manages a resilient EventSource connection.
 * It auto-reconnects with backoff and emits a custom "reconnected" event
 * whenever connectivity is restored after a drop.
 */

import {ComponentChildren, createContext} from 'preact';
import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'preact/hooks';
import {SSEEvent} from '../../shared/sse.js';

// Re-export types from shared/sse.ts.
export * from '../../shared/sse.js';

type Listener<T = unknown> = (data: T, evt: MessageEvent<string>) => void;

type Emitter = {
  on: (type: string, listener: Listener) => () => void;
  emit: (type: string, data: any, evt: MessageEvent<string>) => void;
};

const SSE_CONNECT_URL = '/cms/api/sse.connect';

const DEBUG = true;

export type SSEProviderProps = {
  children: ComponentChildren;
};

type ConnectionState = {
  connected: boolean;
  reconnectCount: number;
  lastEventId?: string;
};

const SSEContext = createContext<{
  on: Emitter['on'];
  state: ConnectionState;
} | null>(null);

function createEmitter(): Emitter {
  const map = new Map<string, Set<Listener>>();

  const on: Emitter['on'] = (type, listener) => {
    if (!map.has(type)) {
      map.set(type, new Set());
    }
    map.get(type)!.add(listener);
    return () => {
      map.get(type)?.delete(listener);
    };
  };

  const emit: Emitter['emit'] = (type, data, event) => {
    map.get(type)?.forEach((cb) => cb(data, event));
    map.get('*')?.forEach((cb) => cb({type, data}, event));
  };

  return {on, emit};
}

export function SSEProvider(props: SSEProviderProps) {
  const emitterRef = useRef<Emitter>();
  if (!emitterRef.current) emitterRef.current = createEmitter();
  const emitter = emitterRef.current;

  const [state, setState] = useState<ConnectionState>({
    connected: false,
    reconnectCount: 0,
    lastEventId: undefined,
  });

  const esRef = useRef<EventSource | null>(null);
  const reconnectingRef = useRef(false);
  const lastWasOpenRef = useRef(false);
  const backoffRef = useRef({attempt: 0, timer: 0 as unknown as number});

  const clearCurrent = () => {
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }
  };

  const connect = useCallback(() => {
    DEBUG && console.log('[sse] connecting...');
    clearCurrent();

    const sseEventSource = new EventSource(SSE_CONNECT_URL);
    esRef.current = sseEventSource;

    sseEventSource.addEventListener('open', () => {
      const isReconnect =
        lastWasOpenRef.current === false && state.reconnectCount > 0;
      DEBUG && console.log(`[sse] connected, isReconnect=${isReconnect}`);
      lastWasOpenRef.current = true;
      reconnectingRef.current = false;
      backoffRef.current.attempt = 0;

      setState((s) => ({...s, connected: true}));
      if (isReconnect) {
        const event = new MessageEvent<string>(SSEEvent.RECONNECTED);
        emitter.emit(SSEEvent.RECONNECTED, undefined, event);
      }
    });

    sseEventSource.addEventListener(
      'message',
      (event: MessageEvent<string>) => {
        DEBUG && console.log('[sse] message', event);
        const data = parse(event.data);
        setState((s) => ({
          ...s,
          lastEventId: event.lastEventId ?? s.lastEventId,
        }));
        emitter.emit('message', data, event);
      }
    );

    const forwardNamed = (event: MessageEvent<string>) => {
      DEBUG && console.log('[sse] event:', event);
      if (!event || !event.type) {
        return;
      }
      emitter.emit(event.type, parse(event.data), event);
    };

    Object.values(SSEEvent).forEach((eventName) => {
      sseEventSource.addEventListener(eventName, forwardNamed as EventListener);
    });

    sseEventSource.addEventListener('error', () => {
      DEBUG && console.log('[sse] disconnected');
      setState((s) => ({...s, connected: false}));
      lastWasOpenRef.current = false;

      if (
        sseEventSource.readyState === EventSource.CLOSED &&
        !reconnectingRef.current
      ) {
        reconnectingRef.current = true;
        const schedule = () => {
          const attempt = ++backoffRef.current.attempt;
          const base = Math.min(30000, Math.pow(2, attempt) * 500);
          const jitter = Math.random() * 0.3 * base;
          const delay = base + jitter;
          window.clearTimeout(backoffRef.current.timer);
          backoffRef.current.timer = window.setTimeout(() => {
            setState((s) => ({...s, reconnectCount: s.reconnectCount + 1}));
            reconnectingRef.current = false;
            connect();
          }, delay as number);
        };

        schedule();
      }
    });
  }, [emitter, state.reconnectCount]);

  useEffect(() => {
    connect();
    const onVis = () => {
      if (document.visibilityState === 'visible') {
        const rs = esRef.current?.readyState;
        if (rs !== EventSource.OPEN) {
          setState((s) => ({...s, reconnectCount: s.reconnectCount + 1}));
          connect();
        }
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.clearTimeout(backoffRef.current.timer);
      clearCurrent();
    };
  }, [connect]);

  const ctx = useMemo(
    () => ({
      on: emitter.on,
      state,
    }),
    [emitter.on, state]
  );

  return (
    <SSEContext.Provider value={ctx}>{props.children}</SSEContext.Provider>
  );
}

function parse(message: string) {
  try {
    return JSON.parse(message);
  } catch {
    return message;
  }
}

export function useSSE<T = unknown>(type: string, listener: Listener<T>) {
  const ctx = useContext(SSEContext);
  if (!ctx) {
    throw new Error('useSSE() must be used within an <SSEProvider>');
  }

  const stableListener = useRef(listener);
  useEffect(() => {
    stableListener.current = listener;
  }, [listener]);

  useEffect(() => {
    return ctx.on(type, (data, evt) => stableListener.current(data as T, evt));
  }, [ctx, type]);

  return ctx.state;
}

export function useSSEConnection() {
  const ctx = useContext(SSEContext);
  if (!ctx) {
    throw new Error('useSSEConnection() must be used within an <SSEProvider>');
  }
  return ctx.state;
}
