import type { Serializer } from "../types.ts";
import {
  type Channel,
  type ChannelEvent,
  type CloseEvent,
  type DataEvent,
  EventBus,
  type MessagePortLike,
  type PingEvent,
  type PongEvent,
  type StartAckEvent,
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
  "startAckEvent",
  "pingEvent",
  "pongEvent",
  "connectEvent",
  "disconnectEvent",
  "disposedEvent",
  "closeEvent",
  "all",
] as const;

export const PortEvents: Record<
  (typeof PortEventTypes)[number],
  Type<Event<any>>
> = PortEventTypes.reduce((acc, event) => {
  acc[event] = class extends Event {};
  Object.defineProperty(acc[event], "name", { value: event });
  return acc;
}, {} as Record<(typeof PortEventTypes)[number], Type<Event<any>>>);

export type HeartbeatOptions = {
  enabled?: boolean;
  interval?: number;
  timeout?: number;
};

export type PortChannelOptions<
  TContext extends Record<string, any> = Record<string, any>,
> = {
  onSubscribe?: (name: string, port: MessagePortLike, source: string) => void;
  onUnsubscribe?: (
    name: string,
    port: MessagePortLike,
    source: string,
  ) => void;
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
  /** Heartbeat options for detecting dead ports */
  heartbeat?: HeartbeatOptions;
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
  public portEventSources: Map<string, Map<MessagePortLike, Set<string>>> = new Map();
  public ports: Set<MessagePortLike> = new Set();
  public idPorts: Map<string, Map<MessagePortLike, number>> = new Map();
  public portIds: Map<MessagePortLike, Map<string, number>> = new Map();
  public sourceSubscriptions: Map<string, Set<string>> = new Map();
  protected roundRobinIndices: Map<string, number> = new Map();

  // buffering
  protected bufferedEvents: Map<
    string,
    { event: DataEvent; timeoutId: any }[]
  > = new Map();
  protected bufferTimeout: number;

  // heartbeat
  protected heartbeatIntervalId: any = null;
  public peerLastSeen: Map<string, number> = new Map();

  [Symbol.dispose](): void {
    this.abortController.abort();
    this.clearBufferedEvents();
    this.stopHeartbeat();

    this.ports.forEach((port) => {
      try {
        port.postMessage(
          this.serializer.serialize({
            type: "closeEvent",
            source: this.id,
          } as CloseEvent),
        );
      } catch {
        // ignore errors on close
      }
      this.removePort(port);
    });
  }

  public clearBufferedEvents(): void {
    for (const [, events] of this.bufferedEvents) {
      for (const item of events) {
        clearTimeout(item.timeoutId);
      }
    }
    this.bufferedEvents.clear();
  }

  constructor(
    options: PortChannelOptions<TContext> = {},
  ) {
    this.context = options.context ?? ({} as TContext);
    this.options = options;
    if (options.serializer) {
      this.serializer = options.serializer;
    }
    // Set the buffer timeout (default to 5000ms)
    this.bufferTimeout = options.bufferTimeout ?? 5000;
    this.id = options.id ?? crypto.randomUUID();

    this.eventBus.on([
      PortEvents.dataEvent,
      PortEvents.subscribeEvent,
      PortEvents.unsubscribeEvent,
      PortEvents.startEvent,
      PortEvents.startAckEvent,
      PortEvents.pingEvent,
      PortEvents.pongEvent,
      PortEvents.closeEvent,
      PortEvents.connectEvent,
      PortEvents.disconnectEvent,
      PortEvents.disposedEvent,
    ], (event: any) => {
      this.eventBus.emit(new PortEvents.all(event));
    }, this.abortController.signal);

    if (this.options.heartbeat?.enabled) {
      this.startHeartbeat();
    }
  }

  public registerPeer(port: MessagePortLike, source: string): void {
    let portCounts = this.idPorts.get(source);
    if (!portCounts) {
      portCounts = new Map<MessagePortLike, number>();
      this.idPorts.set(source, portCounts);
    }
    const currentCount = portCounts.get(port) || 0;
    portCounts.set(port, currentCount + 1);

    let sourceCounts = this.portIds.get(port);
    if (!sourceCounts) {
      sourceCounts = new Map<string, number>();
      this.portIds.set(port, sourceCounts);
    }
    const currentSourceCount = sourceCounts.get(source) || 0;
    sourceCounts.set(source, currentSourceCount + 1);

    this.peerLastSeen.set(source, Date.now());
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
      wasEmpty = set.size === 0;
      set.add(port);
    }

    {
      let portMap = this.portEventSources.get(eventName);
      if (!portMap) {
        portMap = new Map();
        this.portEventSources.set(eventName, portMap);
      }
      let sourceSet = portMap.get(port);
      if (!sourceSet) {
        sourceSet = new Set();
        portMap.set(port, sourceSet);
      }
      sourceSet.add(source);
    }

    {
      let set = this.sourceSubscriptions.get(eventName);
      if (!set) {
        set = new Set<string>();
        this.sourceSubscriptions.set(eventName, set);
      }
      set.add(source);
    }

    this.registerPeer(port, source);

    // If this is the first subscriber, flush buffered events (if any)
    if (wasEmpty && this.bufferedEvents.has(eventName)) {
      const events = this.bufferedEvents.get(eventName)!;
      for (const buffered of events) {
        port.postMessage(this.serializer.serialize(buffered.event));
        clearTimeout(buffered.timeoutId);
      }
      this.bufferedEvents.delete(eventName);
    }

    this.eventBus.emit(
      new PortEvents.subscribeEvent({
        eventName,
        port,
        source,
        id: this.id,
      }),
    );
  }

  protected removePortSubscription(
    port: MessagePortLike,
    eventName: string,
    source: string,
  ): void {
    // 1. Remove source from portEventSources
    const portMap = this.portEventSources.get(eventName);
    if (portMap) {
      const sourceSet = portMap.get(port);
      if (sourceSet) {
        sourceSet.delete(source);
        if (sourceSet.size === 0) {
          portMap.delete(port);
          // Only remove port from portSubscriptions if NO other source on this port needs eventName!
          const portSet = this.portSubscriptions.get(eventName);
          if (portSet) {
            portSet.delete(port);
            if (portSet.size === 0) {
              this.portSubscriptions.delete(eventName);
            }
          }
        }
      }
      if (portMap.size === 0) {
        this.portEventSources.delete(eventName);
      }
    }

    // 2. Remove source from sourceSubscriptions
    {
      const set = this.sourceSubscriptions.get(eventName);
      if (set) {
        set.delete(source);
        if (set.size === 0) {
          this.sourceSubscriptions.delete(eventName);
          this.roundRobinIndices.delete(eventName);
        }
      }
    }

    // 3. Decrement peer counters
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

    this.eventBus.emit(
      new PortEvents.unsubscribeEvent({
        eventName,
        port,
        source,
        id: this.id,
      }),
    );
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

    this.eventBus.emit(
      new PortEvents.dataEvent({
        data,
        name: event.name,
        source: event.source,
        target: event.target,
        id: this.id,
      }),
    );
  }

  protected subscribeEvent(
    event: SubscribeEvent,
    port: MessagePortLike,
  ): void {
    if (Array.isArray(event.name)) {
      if (event.name.length === 0) {
        this.registerPeer(port, event.source);
      }
      for (const name of event.name) {
        this.addPortSubscription(port, name, event.source);
        if (this.options.onSubscribe) {
          this.options.onSubscribe(name, port, event.source);
        }
      }
    } else if (event.name) {
      this.addPortSubscription(port, event.name, event.source);
      if (this.options.onSubscribe) {
        this.options.onSubscribe(event.name, port, event.source);
      }
    } else {
      this.registerPeer(port, event.source);
    }
    this.eventBus.emit(
      new PortEvents.subscribeEvent({
        eventName: event.name,
        port,
        source: event.source,
        id: this.id,
      }),
    );
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
      }
    } else if (event.name) {
      this.removePortSubscription(port, event.name, event.source);
      if (this.options.onUnsubscribe) {
        this.options.onUnsubscribe(event.name, port, event.source);
      }
    }
    this.eventBus.emit(
      new PortEvents.unsubscribeEvent({
        eventName: event.name,
        port,
        source: event.source,
        id: this.id,
      }),
    );
  }

  protected startEvent(event: StartEvent, port: MessagePortLike): void {
    this.registerPeer(port, event.source);

    // Register any listeners announced by the incoming peer
    if (event.listeners && event.listeners.length > 0) {
      for (const name of event.listeners) {
        this.addPortSubscription(port, name, event.source);
      }
    }

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

  protected startAckEvent(event: StartAckEvent, port: MessagePortLike): void {
    this.registerPeer(port, event.source);

    if (event.listeners && event.listeners.length > 0) {
      for (const name of event.listeners) {
        this.addPortSubscription(port, name, event.source);
      }
    }
    this.eventBus.emit(new PortEvents.startAckEvent());
  }

  protected pingEvent(event: PingEvent, port: MessagePortLike): void {
    if (event.target && event.target !== this.id) {
      return;
    }
    this.peerLastSeen.set(event.source, Date.now());
    const pong: PongEvent = {
      type: "pongEvent",
      source: this.id,
      target: event.source,
    };
    port.postMessage(this.serializer.serialize(pong));
    this.eventBus.emit(new PortEvents.pingEvent());
  }

  protected pongEvent(event: PongEvent, _port: MessagePortLike): void {
    if (event.target && event.target !== this.id) {
      return;
    }
    this.peerLastSeen.set(event.source, Date.now());
    this.eventBus.emit(new PortEvents.pongEvent());
  }

  protected closeEvent(event: CloseEvent, port: MessagePortLike): void {
    this.removePort(port, event.source);

    this.eventBus.emit(
      new PortEvents.closeEvent({ source: event.source, id: this.id }),
    );
  }

  protected onMessage(event: ChannelEvent, port: MessagePortLike): void {
    const data: ChannelEvent["data"] = this.serializer.deserialize(
      event.data,
    );

    if (!data || typeof data !== "object") return;

    if (data.source === this.id) {
      return;
    }

    if (data.source) {
      this.peerLastSeen.set(data.source, Date.now());
    }

    if (
      data.type in this &&
      (data.type === "dataEvent" ||
        data.type === "subscribeEvent" ||
        data.type === "unsubscribeEvent" ||
        data.type === "startEvent" ||
        data.type === "startAckEvent" ||
        data.type === "pingEvent" ||
        data.type === "pongEvent" ||
        data.type === "closeEvent")
    ) {
      (this as any)[data.type](data, port);
    }
  }

  protected onMessageError(
    _event: ChannelEvent,
    port: MessagePortLike,
  ): void {
    this.removePort(port);
  }

  public startHeartbeat(): void {
    if (!this.options.heartbeat?.enabled) return;
    const interval = this.options.heartbeat.interval ?? 5000;
    const timeout = this.options.heartbeat.timeout ?? 15000;

    if (this.heartbeatIntervalId !== null) return;

    const timer = setInterval(() => {
      const now = Date.now();
      // Check timeouts for all known peers
      for (const [source, lastSeen] of this.peerLastSeen) {
        if (now - lastSeen > timeout) {
          const portMap = this.idPorts.get(source);
          if (portMap) {
            for (const port of Array.from(portMap.keys())) {
              this.removePort(port, source);
            }
          }
        }
      }

      // Send ping to all connected ports
      const ping: PingEvent = {
        type: "pingEvent",
        source: this.id,
      };
      const serialized = this.serializer.serialize(ping);
      for (const port of this.ports) {
        try {
          port.postMessage(serialized);
        } catch {
          // ignore
        }
      }
    }, interval);

    // Unref timer if supported so it doesn't block process exit
    if (typeof (timer as any)?.unref === "function") {
      (timer as any).unref();
    } else if (typeof (globalThis as any).Deno?.unrefTimer === "function") {
      (globalThis as any).Deno.unrefTimer(timer);
    }

    this.heartbeatIntervalId = timer;
  }

  public stopHeartbeat(): void {
    if (this.heartbeatIntervalId !== null) {
      clearInterval(this.heartbeatIntervalId);
      this.heartbeatIntervalId = null;
    }
  }

  public addPort(port: MessagePortLike): () => void {
    this.ports.add(port);

    port.onmessage = (event) => this.onMessage(event, port);
    port.onmessageerror = (event) => this.onMessageError(event, port);

    const startEvent: StartEvent = {
      type: "startEvent",
      source: this.id,
      listeners: Array.from(this.listeners.keys()),
    };
    port.postMessage(this.serializer.serialize(startEvent));

    if (this.options.heartbeat?.enabled && this.heartbeatIntervalId === null) {
      this.startHeartbeat();
    }

    if (this.options.onConnect) {
      this.options.onConnect(port, this.id);
    }
    this.eventBus.emit(new PortEvents.connectEvent());

    return () => {
      const closeEvent: CloseEvent = {
        type: "closeEvent",
        source: this.id,
      };
      try {
        port.postMessage(this.serializer.serialize(closeEvent));
      } catch {
        // ignore
      }
      this.removePort(port);
    };
  }

  public removePort(port: MessagePortLike, source?: string): void {
    if (source) {
      // 1. Remove from all sourceSubscriptions
      for (const [eventName, srcSet] of this.sourceSubscriptions) {
        srcSet.delete(source);
        if (srcSet.size === 0) {
          this.sourceSubscriptions.delete(eventName);
        }
      }

      // 2. Remove from portEventSources and conditionally from portSubscriptions
      for (const [eventName, portMap] of this.portEventSources) {
        const sourceSet = portMap.get(port);
        if (sourceSet) {
          sourceSet.delete(source);
          if (sourceSet.size === 0) {
            portMap.delete(port);
            const portSet = this.portSubscriptions.get(eventName);
            if (portSet) {
              portSet.delete(port);
              if (portSet.size === 0) {
                this.portSubscriptions.delete(eventName);
              }
            }
          }
        }
        if (portMap.size === 0) {
          this.portEventSources.delete(eventName);
        }
      }

      // 3. Clear from idPorts and peer tracking
      this.idPorts.delete(source);
      this.peerLastSeen.delete(source);

      // 4. Remove source from portIds
      const sourceMap = this.portIds.get(port);
      if (sourceMap) {
        sourceMap.delete(source);
      }

      // 5. Check if ANY other sources are still alive on this port!
      const remainingSourcesCount = sourceMap ? sourceMap.size : 0;
      if (remainingSourcesCount > 0) {
        // Other peers still share this port (e.g. BroadcastChannel, WindowCustomEventPort)!
        // DO NOT delete the physical port!
        return;
      }
    }

    // If source is NOT provided, or if zero sources remain on this port:
    // Fully clean up the physical port!
    for (const [eventName, portSet] of this.portSubscriptions) {
      portSet.delete(port);
      if (portSet.size === 0) {
        this.portSubscriptions.delete(eventName);
      }
    }

    for (const [eventName, portMap] of this.portEventSources) {
      portMap.delete(port);
      if (portMap.size === 0) {
        this.portEventSources.delete(eventName);
      }
    }

    const associatedSources = this.portIds.get(port);
    if (associatedSources) {
      for (const src of associatedSources.keys()) {
        const pMap = this.idPorts.get(src);
        if (pMap) {
          pMap.delete(port);
          if (pMap.size === 0) {
            this.idPorts.delete(src);
            for (const [eventName, srcSet] of this.sourceSubscriptions) {
              srcSet.delete(src);
              if (srcSet.size === 0) {
                this.sourceSubscriptions.delete(eventName);
              }
            }
          }
        }
      }
      this.portIds.delete(port);
    }

    this.ports.delete(port);

    if (this.options.onDisconnect) {
      this.options.onDisconnect(port, this.id);
    }
    this.eventBus.emit(new PortEvents.disconnectEvent());
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

      // round robin to get the next port for the event
      const sourceSubscribers = this.sourceSubscriptions.get(name);

      if (sourceSubscribers && sourceSubscribers.size > 0) {
        const subscriberArray = Array.from(sourceSubscribers).flatMap(
          (source): Array<[MessagePortLike, string]> => {
            return Array.from(
              this.idPorts.get(source)?.keys() ?? [],
            ).map((port) => [port, source]);
          },
        );

        if (subscriberArray.length > 0) {
          const index = this.roundRobinIndices.get(name) || 0;
          const [selectedPort, selectedSource] =
            subscriberArray[index % subscriberArray.length]!;
          this.roundRobinIndices.set(
            name,
            (index + 1) % subscriberArray.length,
          );
          dataEvent.target = selectedSource;

          selectedPort.postMessage(this.serializer.serialize(dataEvent));
          return;
        }
      }
    }

    this.bufferEvent(name, dataEvent);
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
