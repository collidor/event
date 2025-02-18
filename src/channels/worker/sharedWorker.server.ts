// sharedWorkerPublishingChannel.ts
import type {
  DataEvent,
  PublishingChannel,
  PublishingEvent,
  StartEvent,
  SubscribeEvent,
  UnsubscribeEvent,
} from "../../publishingEvents.type.ts";

export function createSharedWorkerPublishingChannel<
  TContext extends Record<string, any>,
>(
  context: TContext = {} as TContext,
): PublishingChannel<TContext> {
  // Local subscriptions: callbacks registered by the server code itself.
  const localListeners = new Map<
    string,
    ((data: any, context: Record<string, any>) => void)[]
  >();

  // Mapping of event name to a Set of MessagePorts that have subscribed.
  const portSubscriptions = new Map<string, Set<MessagePort>>();

  // Set of all connected ports.
  const ports = new Set<MessagePort>();

  // Helpers to add or remove a port for a given event.
  function addPortSubscription(port: MessagePort, eventName: string): void {
    let set = portSubscriptions.get(eventName);
    if (!set) {
      set = new Set<MessagePort>();
      portSubscriptions.set(eventName, set);
    }
    set.add(port);
  }

  function removePortSubscription(port: MessagePort, eventName: string): void {
    const set = portSubscriptions.get(eventName);
    if (set) {
      set.delete(port);
      if (set.size === 0) {
        portSubscriptions.delete(eventName);
      }
    }
  }

  // When a data event is to be sent to a group of ports.
  function sendToPorts(event: DataEvent, portSet: Set<MessagePort>): void {
    for (const port of portSet) {
      port.postMessage(event);
    }
  }

  // Handlers for incoming events from client ports.
  const handleEvent = {
    data(event: DataEvent, _port: MessagePort): void {
      // When a data event is received from a client,
      // call any local (server-side) listeners.
      console.log("Received data event", event);
      if (localListeners.has(event.name)) {
        localListeners.get(event.name)!.forEach((cb) =>
          cb(event.data, context)
        );
      }
      // We do not forward data events here, as publishing will only be done
      // when the server explicitly calls publish().
    },
    subscribe(event: SubscribeEvent, port: MessagePort): void {
      // Record that this port is subscribing to the event.
      addPortSubscription(port, event.name);
    },
    unsubscribe(event: UnsubscribeEvent, port: MessagePort): void {
      removePortSubscription(port, event.name);
    },
    start(_event: StartEvent, port: MessagePort): void {
      // When a new port connects, send it subscribe events for all local subscriptions.
      for (const eventName of localListeners.keys()) {
        port.postMessage({
          name: eventName,
          type: "subscribe",
        } as SubscribeEvent);
      }
    },
  };

  // Called when a new port connects.
  function addPort(port: MessagePort): void {
    ports.add(port);
    port.onmessage = (ev: PublishingEvent) => {
      if (ev.data.type in handleEvent) {
        handleEvent[ev.data.type](ev.data as any, port);
      }
    };

    // Listen for errors (which may indicate the port is no longer active)
    port.onmessageerror = () => {
      // Clean up this port from all event subscriptions.
      for (const [eventName, portSet] of portSubscriptions) {
        portSet.delete(port);
        if (portSet.size === 0) {
          portSubscriptions.delete(eventName);
        }
      }
      ports.delete(port);
    };

    // For MessagePort objects (as from a SharedWorker) start the port.
    port.start?.();
    // Send an initial "start" event to prime the connection.
    console.log("Worker publishing channel started", port);
    port.postMessage({ type: "start" } as StartEvent);
  }

  // Listen for new connections on the SharedWorker.
  if (typeof self !== "undefined" && "onconnect" in self) {
    (self as any).onconnect = (
      ev: MessageEvent<any> & { ports: readonly MessagePort[] },
    ) => {
      const port = ev.ports[0];
      if (!port) return;
      addPort(port);
    };
  }

  return {
    subscribe(name, callback): void {
      console.log("Subscribing to", name);
      // Register a local callback.
      if (!localListeners.has(name)) {
        localListeners.set(name, []);
      }
      localListeners.get(name)!.push(callback as any);

      // (Optional) Notify all connected ports that the server is subscribing locally.
      for (const port of ports) {
        port.postMessage({
          name,
          type: "subscribe",
        } as SubscribeEvent);
      }
    },
    unsubscribe(name, callback): void {
      if (!localListeners.has(name)) return;
      localListeners.set(
        name,
        localListeners.get(name)!.filter((cb) => cb !== callback),
      );
      if (localListeners.get(name)!.length === 0) {
        localListeners.delete(name);
        // Optionally, notify all ports that the server has unsubscribed.
        for (const port of ports) {
          port.postMessage({
            name,
            type: "unsubscribe",
          } as UnsubscribeEvent);
        }
      }
    },
    publish(event): void {
      const eventName = event.constructor.name;

      // Then, only send the event to those ports that subscribed to this event.
      const subscribedPorts = portSubscriptions.get(eventName);

      console.log("Publishing event", event);
      console.log("Subscribers", subscribedPorts);
      if (subscribedPorts && subscribedPorts.size > 0) {
        const dataEvent: DataEvent = {
          name: eventName,
          data: event.data,
          type: "data",
        };
        sendToPorts(dataEvent, subscribedPorts);
      }
    },
  };
}
