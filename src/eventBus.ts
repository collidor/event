import type { Event } from "./eventModel.ts";

export type PublishingChannel = {
  publish: (event: Event<any>) => void;
  on: (event: string, callback: (data: any) => void) => void;
};

export class EventBus {
  private listeners: { [key: string]: Set<((arg: any) => void)> } = {};
  private publishingChannel?: PublishingChannel;

  constructor(publishingChannel?: PublishingChannel) {
    this.publishingChannel = publishingChannel;
  }

  on<T>(
    event: Event<T>,
    callback: (data: T) => void,
    abortSignal?: AbortSignal,
  ) {
    const name = event.constructor.name;
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

  off<T>(event: Event<T>, callback: (data: T) => void) {
    const name = event.constructor.name;

    if (!this.listeners[name]) {
      return;
    }
    this.listeners[name].delete(callback);
  }

  emit<T>(event: Event<T>) {
    const name = event.constructor.name;
    if (this.publishingChannel) {
      this.publishingChannel.publish(event);
    }
    return this.emitByName(name, event.data);
  }

  emitByName(name: string, data: any) {
    if (!this.listeners[name]) {
      return;
    }
    this.listeners[name].forEach((listener) => listener(data));
  }
}
