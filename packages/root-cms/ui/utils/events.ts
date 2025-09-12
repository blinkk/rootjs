import {autokey} from './rand.js';

export type EventCallback = (...args: any[]) => void;

export class EventListener {
  private events = new Map<string, Map<string, EventCallback>>();

  on(eventName: string, callback: EventCallback): () => void {
    const id = autokey(6);
    let eventCallbacks = this.events.get(eventName);
    if (!eventCallbacks) {
      eventCallbacks = new Map();
      this.events.set(eventName, eventCallbacks);
    }
    eventCallbacks.set(id, callback);
    return () => {
      this.off(eventName, id);
    };
  }

  private off(eventName: string, id: string) {
    const eventCallbacks = this.events.get(eventName);
    if (eventCallbacks) {
      eventCallbacks.delete(id);
      if (eventCallbacks.size === 0) {
        this.events.delete(eventName);
      }
    }
  }

  dispatch(eventName: string, ...args: any[]) {
    const eventCallbacks = this.events.get(eventName);
    if (eventCallbacks) {
      eventCallbacks.forEach((callback) => callback(...args));
    }
  }

  dispose() {
    this.events.clear();
  }
}
