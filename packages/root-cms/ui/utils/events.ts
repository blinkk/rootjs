export type EventCallback = (...args: any[]) => void;

export class EventListener {
  private events = new Map<string, EventCallback[]>();

  on(eventName: string, callback: EventCallback): () => void {
    const callbacks = this.events.get(eventName) ?? [];
    this.events.set(eventName, [...callbacks, callback]);
    return () => {
      this.off(eventName, callback);
    };
  }

  off(eventName: string, callback: EventCallback) {
    const eventCallbacks = this.events.get(eventName) ?? [];
    const index = eventCallbacks.indexOf(callback);
    if (index >= 0) {
      eventCallbacks.splice(index, 1);
    }
  }

  dispatch(eventName: string, ...args: any[]) {
    const eventCallbacks = this.events.get(eventName) ?? [];
    eventCallbacks.forEach((callback) => callback(...args));
  }
}
