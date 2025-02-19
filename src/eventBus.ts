import type { Event } from "./eventModel.ts";
import type { PublishingChannel } from "./publishingEvents.type.ts";

export type Type<T> = new (...args: any[]) => T;

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

  on<T extends Event<any>, R extends T extends Event<infer M> ? M : unknown>(
    event: Type<T>,
    callback: (data: R, context: TContext) => void,
    abortSignal?: AbortSignal,
  ): void {
    const name = event.name;
    if (!this.listeners[name]) {
      this.listeners[name] = new Set();
    }
    abortSignal?.addEventListener("abort", () => {
      this.off(event, callback);
    });
    this.listeners[name].add(callback);
    if (this.publishingChannel) {
      this.publishingChannel.subscribe(name, callback);
    }
  }

  off<T extends Event<any>, R extends T extends Event<infer M> ? M : unknown>(
    event: Type<T>,
    callback: (data: R, context: TContext) => void,
  ): void {
    const name = event.name;

    if (!this.listeners[name]) {
      return;
    }
    this.listeners[name].delete(callback);
  }

  emit<T extends Event<any>>(event: T, context?: TContext): void {
    const name = event.constructor.name;
    if (this.publishingChannel) {
      this.publishingChannel.publish(event, context ?? this.context);
    }
    return this.emitByName(name, event.data, context);
  }

  emitByName(name: string, data: any, context?: TContext): void {
    if (!this.listeners[name]) {
      return;
    }
    this.listeners[name].forEach((listener) =>
      listener(data, context ?? this.context)
    );
  }
}
