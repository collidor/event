// sharedWorkerPublishingChannel.ts
import type {
  DataEvent,
  PublishingChannel,
  PublishingEvent,
  StartEvent,
  SubscribeEvent,
  UnsubscribeEvent,
} from "../../publishingEvents.type.ts";
import { EventHandler, type EventHandlerOptions } from "../eventHandler.ts";

type SharedWorkerLike = {
  onconnect:
    | ((
      ev: MessageEvent<any>,
    ) => void)
    | null;
};

export function createSharedWorkerPublishingChannel<
  TContext extends Record<string, any>,
>(
  sharedWorker: SharedWorkerLike,
  context: TContext = {} as TContext,
  options?: {
    onConnect?: (port: MessagePort) => void;
  } & EventHandlerOptions,
): PublishingChannel<TContext> {
  const eventHandler = new EventHandler(context, options);

  // Called when a new port connects.
  function addPort(port: MessagePort): void {
    eventHandler.ports.add(port);
    port.onmessage = (ev: PublishingEvent) => {
      if (ev.data.type in eventHandler) {
        eventHandler[ev.data.type](ev.data as any, port);
      }
    };

    // Listen for errors (which may indicate the port is no longer active)
    port.onmessageerror = () => {
      for (const [eventName, portSet] of eventHandler.portSubscriptions) {
        portSet.delete(port);
        if (portSet.size === 0) {
          eventHandler.portSubscriptions.delete(eventName);
        }
      }
      eventHandler.ports.delete(port);
    };

    // For MessagePort objects (as from a SharedWorker) start the port.
    port.start?.();
    // Send an initial "start" event to prime the connection.
    port.postMessage({ type: "start" } as StartEvent);

    if (options?.onConnect) {
      options.onConnect(port);
    }
  }

  sharedWorker.onconnect = (
    ev: MessageEvent<any> & { ports: readonly MessagePort[] },
  ): void => {
    const port = ev.ports[0];
    if (!port) return;
    addPort(port);
  };

  return {
    subscribe(name, callback): void {
      // Register a local callback.
      if (!eventHandler.listeners.has(name)) {
        eventHandler.listeners.set(name, []);
      }
      eventHandler.listeners.get(name)!.push(callback as any);

      // (Optional) Notify all connected ports that the server is subscribing locally.
      for (const port of eventHandler.ports) {
        port.postMessage({
          name,
          type: "subscribe",
        } as SubscribeEvent);
      }
    },
    unsubscribe(name, callback): void {
      if (!eventHandler.listeners.has(name)) return;
      eventHandler.listeners.set(
        name,
        eventHandler.listeners.get(name)!.filter((cb) => cb !== callback),
      );
      if (eventHandler.listeners.get(name)!.length === 0) {
        eventHandler.listeners.delete(name);
        // Optionally, notify all ports that the server has unsubscribed.
        for (const port of eventHandler.ports) {
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
      const subscribedPorts = eventHandler.portSubscriptions.get(eventName);

      if (subscribedPorts && subscribedPorts.size > 0) {
        const dataEvent: DataEvent = {
          name: eventName,
          data: event.data,
          type: "data",
        };
        eventHandler.sendToPorts(dataEvent, subscribedPorts);
      }
    },
  };
}
