type Listener<T> = (payload: T) => void;

/** Minimal typed event emitter. */
export class Emitter<Events extends Record<string, any>> {
  private listeners = new Map<keyof Events, Set<Listener<any>>>();

  /** Subscribes to an event. Returns an unsubscribe function. */
  on<K extends keyof Events>(type: K, cb: Listener<Events[K]>): () => void {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add(cb);
    return () => this.off(type, cb);
  }

  off<K extends keyof Events>(type: K, cb: Listener<Events[K]>) {
    this.listeners.get(type)?.delete(cb);
  }

  emit<K extends keyof Events>(type: K, payload: Events[K]) {
    this.listeners.get(type)?.forEach((cb) => cb(payload));
  }

  removeAll() {
    this.listeners.clear();
  }
}
