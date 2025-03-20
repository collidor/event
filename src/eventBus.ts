import type { Event } from "./eventModel.ts";
import type { Channel } from "./types.ts";

export type Type<T> = new (...args: any[]) => T;

export type EventHandler<
  TEvent extends Event<any>,
  TData = TEvent extends Event<infer D> ? D : unknown
> = (data: TData, context: Record<string, any>) => void;

export class EventBus<
  TContext extends Record<string, any> = Record<string, any>
> {
  private listeners: {
    [key: string]: Set<(arg: any, context: TContext) => void>;
  } = {};
  private channel?: Channel<TContext>;
  private context: TContext;

  constructor(options?: { context?: TContext; channel?: Channel<TContext> }) {
    this.channel = options?.channel;
    this.context = options?.context || ({} as TContext);
  }

  on<
    T extends Event<any>[],
    R extends T extends Event<infer M>[][number] ? M : unknown
  >(
    event: Type<T[number]>[],
    callback: (data: R, context: TContext) => void,
    abortSignal?: AbortSignal
  ): void;
  on<T extends Event<any>, R extends T extends Event<infer M> ? M : unknown>(
    event: Type<T>,
    callback: (data: R, context: TContext) => void,
    abortSignal?: AbortSignal
  ): void;
  on<
    T extends Event<any> | Event<any>[],
    R extends T extends Event<infer M>[][number]
      ? M
      : T extends Event<infer N>
      ? N
      : unknown
  >(
    event: T extends Array<any> ? Type<T[number]>[] : Type<T>,
    callback: (data: R, context: TContext) => void,
    abortSignal?: AbortSignal
  ): void {
    if (Array.isArray(event)) {
      event.forEach((e) => {
        this.on(e, callback, abortSignal);
      });
      return;
    }
    const name = event.name;
    if (!this.listeners[name]) {
      this.listeners[name] = new Set();
    }
    abortSignal?.addEventListener("abort", () => {
      this.off(event, callback);
    });
    this.listeners[name].add(callback);
    if (this.channel) {
      this.channel.subscribe(name, callback);
    }
  }

  off<
    T extends Event<any>[],
    R extends T extends Event<infer M>[][number] ? M : unknown
  >(
    event: Type<T[number]>[],
    callback: (data: R, context: TContext) => void
  ): void;
  off<T extends Event<any>, R extends T extends Event<infer M> ? M : unknown>(
    event: Type<T>,
    callback: (data: R, context: TContext) => void
  ): void;
  off<
    T extends Event<any> | Event<any>[],
    R extends T extends Event<infer M>[][number]
      ? M
      : T extends Event<infer N>
      ? N
      : unknown
  >(
    event: T extends Array<any> ? Type<T[number]>[] : Type<T>,
    callback: (data: R, context: TContext) => void
  ): void {
    if (Array.isArray(event)) {
      event.forEach((e) => this.off(e as any, callback));
      return;
    }
    const name = event.name;

    if (!this.listeners[name]) {
      return;
    }
    if (this.channel) {
      this.channel.unsubscribe(name, callback);
    }
    this.listeners[name].delete(callback);
  }

  emit<T extends Event<any>>(event: T, context?: TContext): void {
    const name = event.constructor.name;

    return this.emitByName(name, event.data, context);
  }

  emitByName(name: string, data: any, context?: TContext): void {
    if (this.channel) {
      this.channel.publish(name, data, context ?? this.context);
    }

    if (!this.listeners[name]) {
      return;
    }

    this.listeners[name].forEach((listener) =>
      listener(data, context ?? this.context)
    );
  }
}
