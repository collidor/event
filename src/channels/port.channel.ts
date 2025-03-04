import type { Serializer } from "../types.ts";
import {
  type ChannelEvent,
  type DataEvent,
  EventBus,
  type MessagePortLike,
  type StartEvent,
  type SubscribeEvent,
  type UnsubscribeEvent,
} from "../main.ts";
import type { Channel } from "../main.ts";
import { Event } from "../eventModel.ts";
import type { Type } from "../eventBus.ts";

export const PortEventTypes = [
  "dataEvent",
  "subscribeEvent",
  "unsubscribeEvent",
  "startEvent",
  "connectEvent",
  "disconnectEvent",
  "startEvent",
] as const;

export const PortEvents: Record<
  typeof PortEventTypes[number],
  Type<Event<any>>
> = PortEventTypes.reduce((acc, event) => {
  acc[event] = class extends Event {};
  acc[event].prototype.name = event;
  return acc;
}, {} as Record<typeof PortEventTypes[number], Type<Event<any>>>);

export type PortChannelOptions = {
  onSubscribe?: (name: string, port: MessagePortLike) => void;
  onUnsubscribe?: (name: string, port: MessagePortLike) => void;
  onConnect?: (port: MessagePortLike) => void;
  onData?: (data: any, port: MessagePortLike) => void;
  onDisconnect?: (port: MessagePortLike) => void;
  onStart?: (port: MessagePortLike) => void;
  serializer?: Serializer<any>;
  /** Maximum time (in ms) to buffer events before they are discarded */
  bufferTimeout?: number;
};

const defaultSerializer: Serializer<string> = {
  serialize: (data) => JSON.stringify(data),
  deserialize: (data) => JSON.parse(data),
};

export class PortChannel<
  TContext extends Record<string, any> = Record<string, any>,
> implements Channel<TContext> {
  public listeners: Map<string, ((data: any, context: TContext) => void)[]> =
    new Map();
  public portSubscriptions: Map<string, Set<MessagePortLike>> = new Map();
  public ports: Set<MessagePortLike> = new Set();
  public context: TContext;
  public options: PortChannelOptions;
  public serializer: Serializer<any> = defaultSerializer;
  public abortController: AbortController = new AbortController();
  private eventBus: EventBus = new EventBus();
  // --- New properties for buffering ---
  protected bufferedEvents: Map<
    string,
    { event: DataEvent; timeoutId: number }[]
  > = new Map();
  protected bufferTimeout: number;
  // --------------------------------------

  [Symbol.dispose](): void {
    this.abortController.abort();

    this.ports.forEach((port) => {
      port.postMessage({ type: "closeEvent" } as CloseEvent);
      this.removePort(port);
    });
  }

  constructor(
    context: TContext = {} as TContext,
    options: PortChannelOptions = {},
  ) {
    this.context = context;
    this.options = options;
    if (options.serializer) {
      this.serializer = options.serializer;
    }
    // Set the buffer timeout (default to 5000ms)
    this.bufferTimeout = options.bufferTimeout ?? 5000;
  }

  protected addPortSubscription(
    port: MessagePortLike,
    eventName: string,
  ): void {
    let set = this.portSubscriptions.get(eventName);
    if (!set) {
      set = new Set<MessagePortLike>();
      this.portSubscriptions.set(eventName, set);
    }
    // Check if this is the first subscriber
    const wasEmpty = set.size === 0;
    set.add(port);
    // If this is the first subscriber, flush buffered events (if any)
    if (wasEmpty && this.bufferedEvents.has(eventName)) {
      const events = this.bufferedEvents.get(eventName)!;
      for (const buffered of events) {
        port.postMessage(buffered.event);
        clearTimeout(buffered.timeoutId);
      }
      this.bufferedEvents.delete(eventName);
    }
  }

  protected removePortSubscription(
    port: MessagePortLike,
    eventName: string,
  ): void {
    const set = this.portSubscriptions.get(eventName);
    if (set) {
      set.delete(port);
      if (set.size === 0) {
        this.portSubscriptions.delete(eventName);
      }
    }
  }

  protected dataEvent(event: DataEvent, port: MessagePortLike): void {
    const data = event.data
      ? this.serializer.deserialize(event.data)
      : undefined;
    if (this.options.onData) {
      this.options.onData(data, port);
    }
    this.eventBus.emit(new PortEvents.dataEvent(data));
    if (this.listeners.has(event.name)) {
      const callbacks = this.listeners.get(event.name);
      if (callbacks) {
        for (const cb of callbacks) {
          cb(data, this.context);
        }
      }
    }
  }

  protected subscribeEvent(event: SubscribeEvent, port: MessagePortLike): void {
    if (Array.isArray(event.name)) {
      for (const name of event.name) {
        this.addPortSubscription(port, name);
        if (this.options.onSubscribe) {
          this.options.onSubscribe(name, port);
        }
        this.eventBus.emit(new PortEvents.subscribeEvent());
      }
    } else {
      this.addPortSubscription(port, event.name);
      if (this.options.onSubscribe) {
        this.options.onSubscribe(event.name, port);
      }
      this.eventBus.emit(new PortEvents.subscribeEvent());
    }
  }

  protected unsubscribeEvent(
    event: UnsubscribeEvent,
    port: MessagePortLike,
  ): void {
    if (Array.isArray(event.name)) {
      for (const name of event.name) {
        this.removePortSubscription(port, name);
        if (this.options.onUnsubscribe) {
          this.options.onUnsubscribe(name, port);
        }
        this.eventBus.emit(new PortEvents.unsubscribeEvent());
      }
    } else {
      this.removePortSubscription(port, event.name);
      if (this.options.onUnsubscribe) {
        this.options.onUnsubscribe(event.name, port);
      }
      this.eventBus.emit(new PortEvents.unsubscribeEvent());
    }
  }

  protected startEvent(_event: StartEvent, port: MessagePortLike): void {
    port.postMessage({
      name: Array.from(this.listeners.keys()),
      type: "subscribeEvent",
    } as SubscribeEvent);

    if (this.options.onStart) {
      this.options.onStart(port);
    }
    this.eventBus.emit(new PortEvents.startEvent());
  }

  protected closeEvent(_event: CloseEvent, port: MessagePortLike): void {
    this.removePort(port);
  }

  protected onMessage(event: ChannelEvent, port: MessagePortLike): void {
    if (
      event.data.type in this &&
      (event.data.type === "dataEvent" ||
        event.data.type === "subscribeEvent" ||
        event.data.type === "unsubscribeEvent" ||
        event.data.type === "startEvent" ||
        event.data.type === "closeEvent")
    ) {
      this[event.data.type](event.data as any, port);
    }
  }

  protected onMessageError(event: ChannelEvent, port: MessagePortLike): void {
    for (const [eventName, portSet] of this.portSubscriptions) {
      portSet.delete(port);
      if (portSet.size === 0) {
        this.portSubscriptions.delete(eventName);
      }
    }
    this.ports.delete(port);
  }

  public addPort(port: MessagePortLike): void {
    this.ports.add(port);

    port.onmessage = (event) => this.onMessage(event, port);
    port.onmessageerror = (event) => this.onMessageError(event, port);

    port.postMessage({ type: "startEvent" } as StartEvent);

    if (this.options.onConnect) {
      this.options.onConnect(port);
    }
    this.eventBus.emit(new PortEvents.connectEvent());
  }

  public removePort(port: MessagePortLike): void {
    for (const [eventName, portSet] of this.portSubscriptions) {
      portSet.delete(port);
      if (portSet.size === 0) {
        this.portSubscriptions.delete(eventName);
      }
    }
    this.ports.delete(port);

    if (this.options.onDisconnect) {
      this.options.onDisconnect(port);
    }
    this.eventBus.emit(new PortEvents.disconnectEvent());
  }

  public subscribe(
    name: string,
    callback: (data: any, context: TContext) => void,
  ): void {
    if (!this.listeners.has(name)) {
      this.listeners.set(name, []);
    }
    const callbacks = this.listeners.get(name);
    if (callbacks) {
      callbacks.push(callback as any);
    }

    for (const port of this.ports) {
      port.postMessage({
        name,
        type: "subscribeEvent",
      } as SubscribeEvent);
    }
  }

  public unsubscribe(
    name: string,
    callback: (data: any, context: TContext) => void,
  ): void {
    if (!this.listeners.has(name)) return;
    const callbacks = this.listeners.get(name);
    if (callbacks) {
      this.listeners.set(
        name,
        callbacks.filter((cb) => cb !== callback),
      );
    }
    if (this.listeners.get(name)!.length === 0) {
      this.listeners.delete(name);
      for (const port of this.ports) {
        port.postMessage({
          name,
          type: "unsubscribeEvent",
        } as UnsubscribeEvent);
      }
    }
  }

  // --- Updated publish to support buffering with a maximum timeout ---
  public publish(name: string, data: any): void {
    const dataEvent: DataEvent = {
      name,
      data: data ? this.serializer.serialize(data) : undefined,
      type: "dataEvent",
    };
    const subscribedPorts = this.portSubscriptions.get(name);
    if (subscribedPorts && subscribedPorts.size > 0) {
      for (const port of subscribedPorts) {
        port.postMessage(dataEvent);
      }
    } else {
      // Buffer the event if no ports are subscribed.
      if (!this.bufferedEvents.has(name)) {
        this.bufferedEvents.set(name, []);
      }
      const timeoutId = setTimeout(() => {
        // Remove this event from the buffer after the timeout.
        const events = this.bufferedEvents.get(name);
        if (events) {
          const index = events.findIndex((item) =>
            item.timeoutId === timeoutId
          );
          if (index >= 0) {
            events.splice(index, 1);
          }
          if (events.length === 0) {
            this.bufferedEvents.delete(name);
          }
        }
      }, this.bufferTimeout);
      this.bufferedEvents.get(name)!.push({ event: dataEvent, timeoutId });
    }
  }
  // ---------------------------------------------------------------

  public on<T extends typeof PortEventTypes[number]>(
    event: T,
    callback: (ev: InstanceType<typeof PortEvents[T]>) => void,
    signal?: AbortSignal,
  ): void {
    this.eventBus.on(
      PortEvents[event],
      callback,
      signal || this.abortController.signal,
    );
  }

  public off<T extends typeof PortEventTypes[number]>(
    event: T,
    callback: (ev: InstanceType<typeof PortEvents[T]>) => void,
  ): void {
    this.eventBus.off(PortEvents[event], callback);
  }
}
