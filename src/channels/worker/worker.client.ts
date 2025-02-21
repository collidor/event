import type {
  DataEvent,
  MessagePortLike,
  PublishingChannel,
  PublishingEvent,
  StartEvent,
  SubscribeEvent,
  UnsubscribeEvent,
} from "../../publishingEvents.type.ts";
import { EventHandler } from "../eventHandler.ts";

// Generic type for a port-like object (Worker and MessagePort both have these members)

// Create a publishing channel that uses a Worker (or a MessagePort) to communicate.
export function createClientWorkerPublishingChannel<
  TContext extends Record<string, any>,
>(
  port: Worker | MessagePortLike,
  context: TContext = {} as TContext,
  options?: {
    onConnect?: (port: MessagePort) => void;
  },
): PublishingChannel<TContext> {
  const eventHandler = new EventHandler(context);
  eventHandler.ports.add(port);

  port.onmessage = (ev: PublishingEvent) => {
    eventHandler[ev.data.type](ev.data as any, port);
  };

  port.onmessageerror = (ev: MessageEvent) => {
    console.error("Error in worker publishing channel:", ev);
  };

  // Tell the worker we are ready.
  port.postMessage({
    type: "start",
  } as StartEvent);

  if (options?.onConnect) {
    options.onConnect(port as MessagePort);
  }

  return {
    subscribe(name, callback): void {
      if (!eventHandler.listeners.has(name)) {
        eventHandler.listeners.set(name, []);
      }
      port.postMessage({
        name,
        type: "subscribe",
      } as SubscribeEvent);
      eventHandler.listeners.get(name)!.push(callback as any);
    },
    unsubscribe(name, callback): void {
      port.postMessage({
        type: "unsubscribe",
        name,
      } as UnsubscribeEvent);
      if (!eventHandler.listeners.has(name)) return;
      eventHandler.listeners.set(
        name,
        eventHandler.listeners.get(name)!.filter((cb) => cb !== callback),
      );
      if (eventHandler.listeners.get(name)!.length === 0) {
        eventHandler.listeners.delete(name);
        port.postMessage({
          name,
          type: "unsubscribe",
        } as UnsubscribeEvent);
      }
    },
    publish(event): void {
      if (
        (eventHandler.portSubscriptions.get(event.constructor.name)?.size ||
          0) > 0
      ) {
        port.postMessage({
          name: event.constructor.name,
          data: JSON.stringify(event.data),
          type: "data",
        } as DataEvent);
      }
    },
  };
}
