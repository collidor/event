import type { Serializer } from "../types.ts";
import {
  type Channel,
  type ChannelEvent,
  type CloseEvent,
  type DataEvent,
  EventBus,
  type MessagePortLike,
  type StartEvent,
  type SubscribeEvent,
  type UnsubscribeEvent,
} from "../main.ts";
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
  (typeof PortEventTypes)[number],
  Type<Event<any>>
> = PortEventTypes.reduce((acc, event) => {
  acc[event] = class extends Event {};
  Object.defineProperty(acc[event], "name", { value: event });
  return acc;
}, {} as Record<(typeof PortEventTypes)[number], Type<Event<any>>>);

export type PortChannelOptions<
  TContext extends Record<string, any> = Record<string, any>,
> = {
  onSubscribe?: (name: string, port: MessagePortLike, source: string) => void;
  onUnsubscribe?: (name: string, port: MessagePortLike, source: string) => void;
  onConnect?: (port: MessagePortLike, source: string) => void;
  onData?: (
    data: any,
    port: MessagePortLike,
    source: string,
    target?: string,
  ) => void;
  onDisconnect?: (port: MessagePortLike, source: string) => void;
  onStart?: (port: MessagePortLike, source: string) => void;
  serializer?: Serializer<any>;
  /** Maximum time (in ms) to buffer events before they are discarded */
  bufferTimeout?: number;
  /** the ID used to identify this end of the connection */
  id?: string;
  context?: TContext;
};

const defaultSerializer: Serializer<string> = {
  serialize: (data) => JSON.stringify(data),
  deserialize: (data) => (data !== undefined ? JSON.parse(data) : undefined),
};

export class PortChannel<
  TContext extends Record<string, any> = Record<string, any>,
> implements Channel<TContext> {
  // general
  public context: TContext;
  public options: PortChannelOptions;
  public serializer: Serializer<any> = defaultSerializer;
  public abortController: AbortController = new AbortController();
  protected eventBus: EventBus = new EventBus();
  public id: string;
  public listeners: Map<
    string,
    ((data: any, context: TContext, event: DataEvent) => void)[]
  > = new Map();

  // port stuff
  public portSubscriptions: Map<string, Set<MessagePortLike>> = new Map();
  public ports: Set<MessagePortLike> = new Set();
  public idPorts: Map<string, Map<MessagePortLike, number>> = new Map();
  public portIds: Map<MessagePortLike, Map<string, number>> = new Map();
  public sourceSubscriptions: Map<string, Set<string>> = new Map();
  protected roundRobinIndices: Map<string, number> = new Map();

  // buffering
  protected bufferedEvents: Map<
    string,
    { event: DataEvent; timeoutId: number }[]
  > = new Map();
  protected bufferTimeout: number;

  [Symbol.dispose](): void {
    this.abortController.abort();

    this.ports.forEach((port) => {
      port.postMessage(
        this.serializer.serialize({
          type: "closeEvent",
          source: this.id,
        } as CloseEvent),
      );
      this.removePort(port, this.id);
    });
  }

  constructor(
    options: PortChannelOptions<TContext> = {},
  ) {
    this.context = options.context ?? {} as TContext;
    this.options = options;
    if (options.serializer) {
      this.serializer = options.serializer;
    }
    // Set the buffer timeout (default to 5000ms)
    this.bufferTimeout = options.bufferTimeout ?? 5000;
    this.id = options.id ?? crypto.randomUUID();
  }

  protected addPortSubscription(
    port: MessagePortLike,
    eventName: string,
    source: string,
  ): void {
    let wasEmpty = false;
    {
      let set = this.portSubscriptions.get(eventName);
      if (!set) {
        set = new Set<MessagePortLike>();
        this.portSubscriptions.set(eventName, set);
      }
      // Check if this is the first subscriber
      wasEmpty = set.size === 0;

      set.add(port);
    }

    {
      let set = this.sourceSubscriptions.get(eventName);

      if (!set) {
        set = new Set<string>();
        this.sourceSubscriptions.set(eventName, set);
      }
      set.add(source);
    }

    {
      let portCounts = this.idPorts.get(source);
      if (!portCounts) {
        portCounts = new Map<MessagePortLike, number>();
        this.idPorts.set(source, portCounts);
      }
      const currentCount = portCounts.get(port) || 0;
      portCounts.set(port, currentCount + 1);
    }

    {
      let sourceCounts = this.portIds.get(port);
      if (!sourceCounts) {
        sourceCounts = new Map<string, number>();
        this.portIds.set(port, sourceCounts);
      }
      const currentSourceCount = sourceCounts.get(source) || 0;
      sourceCounts.set(source, currentSourceCount + 1);
    }

    // If this is the first subscriber, flush buffered events (if any)
    if (wasEmpty && this.bufferedEvents.has(eventName)) {
      const events = this.bufferedEvents.get(eventName)!;
      for (const buffered of events) {
        port.postMessage(this.serializer.serialize(buffered.event));
        clearTimeout(buffered.timeoutId);
      }
      this.bufferedEvents.delete(eventName);
    }
  }

  protected removePortSubscription(
    port: MessagePortLike,
    eventName: string,
    source: string,
  ): void {
    {
      const set = this.portSubscriptions.get(eventName);
      if (set) {
        set.delete(port);
        if (set.size === 0) {
          this.portSubscriptions.delete(eventName);
        }
      }
    }

    {
      const set = this.sourceSubscriptions.get(eventName);

      if (set) {
        set.delete(source);
        if (set.size === 0) {
          this.sourceSubscriptions.delete(eventName);
        }
      }
    }

    {
      const portCounts = this.idPorts.get(source);
      if (portCounts) {
        const currentCount = portCounts.get(port) || 0;
        if (currentCount > 1) {
          portCounts.set(port, currentCount - 1);
        } else {
          portCounts.delete(port);
          if (portCounts.size === 0) {
            this.idPorts.delete(source);
          }
        }
      }
    }

    {
      const sourceCounts = this.portIds.get(port);
      if (sourceCounts) {
        const currentSourceCount = sourceCounts.get(source) || 0;
        if (currentSourceCount > 1) {
          sourceCounts.set(source, currentSourceCount - 1);
        } else {
          sourceCounts.delete(source);
          if (sourceCounts.size === 0) {
            this.portIds.delete(port);
          }
        }
      }
    }
  }

  protected dataEvent(event: DataEvent, port: MessagePortLike): void {
    const data = event.data;

    if (event.target && event.target !== this.id) {
      // The event is meant for a different port, so ignore it.
      return;
    }

    if (this.options.onData) {
      this.options.onData(data, port, event.source);
    }
    this.eventBus.emit(new PortEvents.dataEvent(data));
    if (this.listeners.has(event.name)) {
      const callbacks = this.listeners.get(event.name);
      if (callbacks) {
        for (const cb of callbacks) {
          cb(data, this.context, event);
        }
      }
    }
  }

  protected subscribeEvent(event: SubscribeEvent, port: MessagePortLike): void {
    if (Array.isArray(event.name)) {
      for (const name of event.name) {
        this.addPortSubscription(port, name, event.source);
        if (this.options.onSubscribe) {
          this.options.onSubscribe(name, port, event.source);
        }
        this.eventBus.emit(new PortEvents.subscribeEvent());
      }
    } else {
      this.addPortSubscription(port, event.name, event.source);
      if (this.options.onSubscribe) {
        this.options.onSubscribe(event.name, port, event.source);
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
        this.removePortSubscription(port, name, event.source);
        if (this.options.onUnsubscribe) {
          this.options.onUnsubscribe(name, port, event.source);
        }
        this.eventBus.emit(new PortEvents.unsubscribeEvent());
      }
    } else {
      this.removePortSubscription(port, event.name, event.source);
      if (this.options.onUnsubscribe) {
        this.options.onUnsubscribe(event.name, port, event.source);
      }
      this.eventBus.emit(new PortEvents.unsubscribeEvent());
    }
  }

  protected startEvent(event: StartEvent, port: MessagePortLike): void {
    port.postMessage(
      this.serializer.serialize({
        name: Array.from(this.listeners.keys()),
        type: "subscribeEvent",
        source: this.id,
      } as SubscribeEvent),
    );

    if (this.options.onStart) {
      this.options.onStart(port, event.source);
    }
    this.eventBus.emit(new PortEvents.startEvent());
  }

  protected closeEvent(event: CloseEvent, port: MessagePortLike): void {
    this.removePort(port, event.source);
  }

  protected onMessage(event: ChannelEvent, port: MessagePortLike): void {
    const data: ChannelEvent["data"] = this.serializer.deserialize(event.data);

    if (
      data.type in this &&
      (data.type === "dataEvent" ||
        data.type === "subscribeEvent" ||
        data.type === "unsubscribeEvent" ||
        data.type === "startEvent" ||
        data.type === "closeEvent")
    ) {
      this[data.type](data as any, port);
    }
  }

  protected onMessageError(event: ChannelEvent, port: MessagePortLike): void {
    this.removePort(port);
    for (const [eventName, portSet] of this.portSubscriptions) {
      portSet.delete(port);
      if (portSet.size === 0) {
        this.portSubscriptions.delete(eventName);
      }
    }
    this.ports.delete(port);
  }

  public addPort(port: MessagePortLike): () => void {
    this.ports.add(port);

    port.onmessage = (event) => this.onMessage(event, port);
    port.onmessageerror = (event) => this.onMessageError(event, port);

    const startEvent: StartEvent = {
      type: "startEvent",
      source: this.id,
    };
    port.postMessage(this.serializer.serialize(startEvent));

    if (this.options.onConnect) {
      this.options.onConnect(port, this.id);
    }
    this.eventBus.emit(new PortEvents.connectEvent());

    return () => {
      const closeEvent: CloseEvent = {
        type: "closeEvent",
        source: this.id,
      };
      port.postMessage(this.serializer.serialize(closeEvent));
      this.ports.delete(port);

      if (this.options.onDisconnect) {
        this.options.onDisconnect(port, this.id);
      }
    };
  }

  public removePort(port: MessagePortLike, source?: string): void {
    for (const [eventName, portSet] of this.portSubscriptions) {
      portSet.delete(port);
      if (portSet.size === 0) {
        this.portSubscriptions.delete(eventName);
      }
    }
    this.ports.delete(port);

    if (this.options.onDisconnect) {
      this.options.onDisconnect(port, this.id);
    }
    this.eventBus.emit(new PortEvents.disconnectEvent());

    if (source) {
      const set = this.portIds.get(port);
      if (set) {
        set.delete(source);
        {
          const set = this.idPorts.get(source);

          if (set) {
            set.delete(port);
            if (!set.size) {
              this.idPorts.delete(source);
            }
          }
        }
        if (set.size === 0) {
          this.portIds.delete(port);
        }
      }
    }
  }

  public subscribe(
    name: string,
    callback: (data: any, context: TContext, dataEvent: DataEvent) => void,
  ): void {
    if (!this.listeners.has(name)) {
      this.listeners.set(name, []);
    }
    const callbacks = this.listeners.get(name);
    if (callbacks) {
      callbacks.push(callback as any);
    }

    for (const port of this.ports) {
      port.postMessage(
        this.serializer.serialize({
          name,
          type: "subscribeEvent",
          source: this.id,
        } as SubscribeEvent),
      );
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
        port.postMessage(
          this.serializer.serialize({
            name,
            type: "unsubscribeEvent",
            source: this.id,
          } as UnsubscribeEvent),
        );
      }
    }
  }

  protected bufferEvent(name: string, dataEvent: DataEvent) {
    if (!this.bufferedEvents.has(name)) {
      this.bufferedEvents.set(name, []);
    }
    const timeoutId = setTimeout(() => {
      // Remove this event from the buffer after the timeout.
      const events = this.bufferedEvents.get(name);
      if (events) {
        const index = events.findIndex((item) => item.timeoutId === timeoutId);
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

  public publish(
    name: string,
    data: any,
    options?: { singleConsumer?: boolean; target?: string },
  ): void {
    const dataEvent: DataEvent = {
      name,
      data,
      type: "dataEvent",
      source: this.id,
    };

    if (options?.singleConsumer) {
      if (options.target) {
        dataEvent.target = options.target;
      }
    }

    const subscribers = this.portSubscriptions.get(name);
    if (subscribers && subscribers.size > 0) {
      if (!options?.singleConsumer) {
        for (const port of subscribers) {
          port.postMessage(this.serializer.serialize(dataEvent));
        }
        return;
      }

      if (options.target) {
        const ports = this.idPorts.get(options.target);

        if (ports) {
          for (const port of ports.keys()) {
            port.postMessage(this.serializer.serialize(dataEvent));
          }
        }

        return;
      }

      // round robbin to get the next port for the event

      const sourceSubscribers = this.sourceSubscriptions.get(name);

      if (sourceSubscribers) {
        const subscriberArray = Array.from(sourceSubscribers).flatMap(
          (source): Array<[MessagePortLike, string]> => {
            return Array.from(this.idPorts.get(source)?.keys() ?? []).map((
              port,
            ) => [
              port,
              source,
            ]);
          },
        );

        const index = this.roundRobinIndices.get(name) || 0;
        const [selectedPort, selectedSource] =
          subscriberArray[index % subscriberArray.length]!;
        this.roundRobinIndices.set(name, (index + 1) % subscriberArray.length);
        dataEvent.target = selectedSource;

        selectedPort.postMessage(this.serializer.serialize(dataEvent));
      }
    } else {
      this.bufferEvent(name, dataEvent);
    }
  }

  public on<T extends (typeof PortEventTypes)[number]>(
    event: T,
    callback: (ev: InstanceType<(typeof PortEvents)[T]>) => void,
    signal?: AbortSignal,
  ): void {
    this.eventBus.on(
      PortEvents[event],
      callback,
      signal || this.abortController.signal,
    );
  }

  public off<T extends (typeof PortEventTypes)[number]>(
    event: T,
    callback: (ev: InstanceType<(typeof PortEvents)[T]>) => void,
  ): void {
    this.eventBus.off(PortEvents[event], callback);
  }
}
