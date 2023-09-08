import {Request, Response, NextFunction} from '../core/types';

export function hooksMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    req.hooks = new Hooks();
    next();
  };
}

export type HooksCallbackFn = (...args: any[]) => any;

export class Hooks {
  private callbacks: {[name: string]: HooksCallbackFn[]} = {};

  add(name: string, cb: (...args: any[]) => any) {
    this.callbacks[name] ??= [];
    this.callbacks[name].push(cb);
  }

  trigger(name: string, ...args: any[]) {
    const callbacks = this.callbacks[name] || [];
    callbacks.forEach((cb) => {
      cb(...args);
    });
  }
}
