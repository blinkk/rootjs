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
} from 'preact/hooks';
import {SSEConnectedEvent, SSEEvent} from '../../shared/sse.js';
import {testHasExperimentParam} from '../utils/url-params.js';

// Re-export types from shared/sse.ts.
export * from '../../shared/sse.js';

const SSE_CONNECT_URL = '/cms/api/sse.connect';
const DEBUG = testHasExperimentParam('EnableVerboseLogging');
const IS_LOCALHOST = window.location.hostname === 'localhost';

type Listener<T = unknown> = (data: T, evt: MessageEvent<string>) => void;

class Emitter {
  private map = new Map<string, Set<Listener>>();

  on(type: string, listener: Listener) {
    if (!this.map.has(type)) {
      this.map.set(type, new Set());
    }
    this.map.get(type)!.add(listener);
    return () => {
      this.map.get(type)?.delete(listener);
    };
  }

  emit(type: string, data: any, event: MessageEvent<string>) {
    this.map.get(type)?.forEach((cb) => cb(data, event));
    this.map.get('*')?.forEach((cb) => cb({type, data}, event));
  }
}

export type SSEProviderProps = {
  children: ComponentChildren;
};

const SSEContext = createContext<{
  emitter: Emitter;
} | null>(null);

export function SSEProvider(props: SSEProviderProps) {
  const emitterRef = useRef<Emitter>(new Emitter());
  const emitter = emitterRef.current;

  const esRef = useRef<EventSource | null>(null);
  const reconnectingRef = useRef(false);
  const backoffRef = useRef({attempt: 0, timer: 0 as unknown as number});
  const serverVersionRef = useRef('');

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

    sseEventSource.addEventListener(
      SSEEvent.CONNECTED,
      (event: MessageEvent<string>) => {
        DEBUG && console.log('[sse] connected');
        reconnectingRef.current = false;
        backoffRef.current.attempt = 0;

        // On localhost, if the server version changed, reload the page.
        // TODO(stevenle): on prod, display a notification banner to reload.
        if (IS_LOCALHOST) {
          const data = parse(event.data) as SSEConnectedEvent;
          const serverVersion = data?.serverVersion || '';
          if (!serverVersionRef.current) {
            serverVersionRef.current = serverVersion;
          } else if (serverVersionRef.current !== serverVersion) {
            console.log(
              `server version changed: ${serverVersionRef.current} -> ${serverVersion}`
            );
            console.log('reloading...');
            window.location.reload();
          }
        }
      }
    );

    const forwardNamed = (event: MessageEvent) => {
      if (!event || !event.type) {
        return;
      }
      const data = parse(event.data);
      DEBUG && console.log('[sse] event:', event.type, data);
      emitter.emit(event.type, data, event);
    };

    Object.values(SSEEvent).forEach((eventName) => {
      sseEventSource.addEventListener(eventName, forwardNamed as EventListener);
    });

    sseEventSource.addEventListener('error', () => {
      DEBUG && console.log('[sse] disconnected');

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
            reconnectingRef.current = false;
            connect();
          }, delay as number);
        };

        schedule();
      }
    });
  }, [emitter]);

  useEffect(() => {
    connect();
    const onVis = () => {
      if (document.visibilityState === 'visible') {
        const rs = esRef.current?.readyState;
        if (rs !== EventSource.OPEN) {
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

  const ctx = useMemo(() => ({emitter: emitter}), [emitter]);
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

  const stableListenerRef = useRef(listener);
  useEffect(() => {
    stableListenerRef.current = listener;
  }, [listener]);

  useEffect(() => {
    return ctx.emitter.on(type, (data, evt) =>
      stableListenerRef.current(data as T, evt)
    );
  }, [ctx, type]);
}
