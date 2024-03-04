import {EventListener} from './events.js';

export class Timer extends EventListener {
  private interval = 0;
  timeout: number = 0;

  constructor(interval: number) {
    super();
    this.interval = interval;
  }

  start() {
    this.timeout = window.setTimeout(() => {
      this.tick();
    }, this.interval);
  }

  private tick() {
    this.dispatch('tick');
    this.start();
  }

  reset() {
    this.stop();
    this.start();
  }

  stop() {
    if (this.timeout) {
      window.clearTimeout(this.timeout);
      this.timeout = 0;
    }
  }
}
