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

export const PortEvents = PortEventTypes.reduce((acc, event) => {
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
  public abortController = new AbortController();
  private eventBus = new EventBus();

  constructor(
    context: TContext = {} as TContext,
    options: PortChannelOptions = {},
  ) {
    this.context = context;
    this.options = options;
    if (options.serializer) {
      this.serializer = options.serializer;
    }
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
    set.add(port);
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

  protected onMessage = (event: ChannelEvent): void => {
    const port = event.source as MessagePortLike;
    if (
      event.data.type in this &&
      (event.data.type === "dataEvent" ||
        event.data.type === "subscribeEvent" ||
        event.data.type === "unsubscribeEvent" ||
        event.data.type === "startEvent")
    ) {
      this[event.data.type](event.data as any, port);
    }
  };

  protected onMessageError = (event: ChannelEvent): void => {
    const port = event.source as MessagePortLike;
    for (const [eventName, portSet] of this.portSubscriptions) {
      portSet.delete(port);
      if (portSet.size === 0) {
        this.portSubscriptions.delete(eventName);
      }
    }
    this.ports.delete(port);
  };

  public addPort(port: MessagePortLike): void {
    this.ports.add(port);

    port.onmessage = this.onMessage;
    port.onmessageerror = this.onMessageError;

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

  public publish(event: Event<any>): void {
    const eventName = event.constructor.name;
    const subscribedPorts = this.portSubscriptions.get(eventName);

    if (subscribedPorts && subscribedPorts.size > 0) {
      const dataEvent: DataEvent = {
        name: eventName,
        data: event.data ? this.serializer.serialize(event.data) : undefined,
        type: "dataEvent",
      };
      for (const port of subscribedPorts) {
        port.postMessage(dataEvent);
      }
    }
  }

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
