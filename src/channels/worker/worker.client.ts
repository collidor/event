import type {
  DataEvent,
  PublishingChannel,
  PublishingEvent,
  StartEvent,
  SubscribeEvent,
  UnsubscribeEvent,
} from "../../publishingEvents.type.ts";

// Generic type for a port-like object (Worker and MessagePort both have these members)
interface MessagePortLike {
  postMessage(message: any): void;
  addEventListener(
    type: "message",
    listener: (ev: MessageEvent) => void,
  ): void;
}

// Create a publishing channel that uses a Worker (or a MessagePort) to communicate.
export function createClientWorkerPublishingChannel<
  TContext extends Record<string, any>,
>(
  port: Worker | MessagePortLike,
  context: TContext = {} as TContext,
): PublishingChannel<TContext> {
  const listeners = new Map<
    string,
    ((data: any, context: Record<string, any>) => void)[]
  >();

  const subscribers = new Map<string, number>();

  const handleEvent: {
    [K in Pick<PublishingEvent["data"], "type">["type"]]: (
      arg: (DataEvent | SubscribeEvent | UnsubscribeEvent) & { type: K },
    ) => void;
  } = {
    data(event) {
      console.log("Received data event", event);
      if (listeners.has(event.name)) {
        listeners.get(event.name)!.forEach((cb) => cb(event.data, context));
      }
    },
    subscribe(event) {
      subscribers.set(
        event.name,
        (subscribers.get(event.name) || 0) + 1,
      );
    },
    unsubscribe(event) {
      subscribers.set(
        event.name,
        (subscribers.get(event.name) || 0) - 1,
      );
    },
    start() {
      console.log("Worker publishing channel started");
      for (const name of listeners.keys()) {
        port.postMessage({
          name,
          type: "subscribe",
        } as SubscribeEvent);
      }
    },
  };

  port.addEventListener("message", (ev: PublishingEvent | ErrorEvent) => {
    if (ev instanceof ErrorEvent) {
      console.error("Error in worker publishing channel:", ev.error);
      return;
    }
    // Ignore messages originating from the same source.
    console.log("Received message", ev);
    handleEvent[ev.data.type](ev.data as any);
  });

  // Tell the worker we are ready.
  port.postMessage({
    type: "start",
  } as StartEvent);

  return {
    subscribe(name, callback): void {
      if (!listeners.has(name)) {
        listeners.set(name, []);
      }
      port.postMessage({
        name,
        type: "subscribe",
      } as SubscribeEvent);
      listeners.get(name)!.push(callback as any);
    },
    unsubscribe(name, callback): void {
      port.postMessage({
        type: "unsubscribe",
        name,
      } as UnsubscribeEvent);
      if (!listeners.has(name)) return;
      listeners.set(
        name,
        listeners.get(name)!.filter((cb) => cb !== callback),
      );
      if (listeners.get(name)!.length === 0) {
        listeners.delete(name);
        port.postMessage({
          name,
          type: "unsubscribe",
        } as UnsubscribeEvent);
      }
    },
    publish(event): void {
      console.log("Publishing event", event);
      console.log("Subscribers", subscribers);
      if ((subscribers.get(event.constructor.name) || 0) > 0) {
        port.postMessage({
          name: event.constructor.name,
          data: JSON.stringify(event.data),
          type: "data",
        } as DataEvent);
      }
    },
  };
}
