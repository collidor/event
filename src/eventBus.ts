import type { Event } from "./eventModel.ts";

export type Type<T> = new (...args: any[]) => T;

export type PublishingChannel<
  TContext extends Record<string, any> = Record<string, any>,
> = {
  publish: (event: Event<any>, context: TContext) => void;
  on: (event: string, callback: (data: any, context: TContext) => void) => void;
};

export class EventBus<
  TContext extends Record<string, any> = Record<string, any>,
> {
  private listeners: {
    [key: string]: Set<((arg: any, context: TContext) => void)>;
  } = {};
  private publishingChannel?: PublishingChannel<TContext>;
  private context: TContext;

  constructor(
    options?: {
      context?: TContext;
      publishingChannel?: PublishingChannel<TContext>;
    },
  ) {
    this.publishingChannel = options?.publishingChannel;
    this.context = options?.context || {} as TContext;
  }

  on<T>(
    event: Type<Event<T>>,
    callback: (data: T, context: TContext) => void,
    abortSignal?: AbortSignal,
  ) {
    const name = event.name;
    if (!this.listeners[name]) {
      this.listeners[name] = new Set();
    }
    abortSignal?.addEventListener("abort", () => {
      this.off(event, callback);
    });
    this.listeners[name].add(callback);
    if (this.publishingChannel) {
      this.publishingChannel.on(name, callback);
    }
  }

  off<T>(
    event: Type<Event<T>>,
    callback: (data: T, context: TContext) => void,
  ) {
    const name = event.name;

    if (!this.listeners[name]) {
      return;
    }
    this.listeners[name].delete(callback);
  }

  emit<T>(event: Event<T>) {
    const name = event.constructor.name;
    if (this.publishingChannel) {
      this.publishingChannel.publish(event, this.context);
    }
    return this.emitByName(name, event.data);
  }

  emitByName(name: string, data: any) {
    if (!this.listeners[name]) {
      return;
    }
    this.listeners[name].forEach((listener) => listener(data, this.context));
  }
}
