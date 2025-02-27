import type {
  ChannelEvent,
  DataEvent,
  Event,
  MessagePortLike,
  StartEvent,
  SubscribeEvent,
  UnsubscribeEvent,
} from "../main.ts";

import type { Channel } from "../main.ts";

export type PortChannelOptions = {
  onSubscribe?: (name: string, port: MessagePortLike) => void;
  onUnsubscribe?: (name: string, port: MessagePortLike) => void;
  onConnect?: (port: MessagePortLike) => void;
  onData?: (data: any, port: MessagePortLike) => void;
  onDisconnect?: (port: MessagePortLike) => void;
  onStart?: (port: MessagePortLike) => void;
};

export class PortChannel<TContext extends Record<string, any>>
  implements Channel<TContext>
{
  public listeners: Map<string, ((data: any, context: TContext) => void)[]> =
    new Map();
  public portSubscriptions: Map<string, Set<MessagePortLike>> = new Map();
  public ports: Set<MessagePortLike> = new Set();
  public context: TContext;
  public options: PortChannelOptions;

  constructor(
    context: TContext = {} as TContext,
    options: PortChannelOptions = {}
  ) {
    this.context = context;
    this.options = options;
  }

  protected addPortSubscription(
    port: MessagePortLike,
    eventName: string
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
    eventName: string
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
    const data = event.data ? JSON.parse(event.data) : undefined;
    if (this.options.onData) {
      this.options.onData(data, port);
    }
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
      }
    } else {
      this.addPortSubscription(port, event.name);
      if (this.options.onSubscribe) {
        this.options.onSubscribe(event.name, port);
      }
    }
  }

  protected unsubscribeEvent(
    event: UnsubscribeEvent,
    port: MessagePortLike
  ): void {
    if (Array.isArray(event.name)) {
      for (const name of event.name) {
        this.removePortSubscription(port, name);
        if (this.options.onUnsubscribe) {
          this.options.onUnsubscribe(name, port);
        }
      }
    } else {
      this.removePortSubscription(port, event.name);
      if (this.options.onUnsubscribe) {
        this.options.onUnsubscribe(event.name, port);
      }
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
  }

  public addPort(port: MessagePortLike): void {
    this.ports.add(port);
    port.onmessage = (ev: ChannelEvent) => {
      if (
        ev.data.type in this &&
        (ev.data.type === "dataEvent" ||
          ev.data.type === "subscribeEvent" ||
          ev.data.type === "unsubscribeEvent" ||
          ev.data.type === "startEvent")
      ) {
        this[ev.data.type](ev.data as any, port);
      }
    };

    port.onmessageerror = () => {
      for (const [eventName, portSet] of this.portSubscriptions) {
        portSet.delete(port);
        if (portSet.size === 0) {
          this.portSubscriptions.delete(eventName);
        }
      }
      this.ports.delete(port);
    };

    port.postMessage({ type: "startEvent" } as StartEvent);

    if (this.options.onConnect) {
      this.options.onConnect(port);
    }
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
  }

  public subscribe(
    name: string,
    callback: (data: any, context: TContext) => void
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
    callback: (data: any, context: TContext) => void
  ): void {
    if (!this.listeners.has(name)) return;
    const callbacks = this.listeners.get(name);
    if (callbacks) {
      this.listeners.set(
        name,
        callbacks.filter((cb) => cb !== callback)
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

  publish(event: Event<any>): void {
    const eventName = event.constructor.name;
    const subscribedPorts = this.portSubscriptions.get(eventName);

    if (subscribedPorts && subscribedPorts.size > 0) {
      const dataEvent: DataEvent = {
        name: eventName,
        data: event.data ? JSON.stringify(event.data) : undefined,
        type: "dataEvent",
      };
      for (const port of subscribedPorts) {
        port.postMessage(dataEvent);
      }
    }
  }
}
