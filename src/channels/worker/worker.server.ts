import type {
  DataEvent,
  PublishingChannel,
  PublishingEvent,
  StartEvent,
  SubscribeEvent,
  UnsubscribeEvent,
} from "../../publishingEvents.type.ts";

export function createWorkerPublishingChannel<
  TContext extends Record<string, any>,
>(
  context: TContext = {} as TContext,
): PublishingChannel<TContext> {
  // In a dedicated worker, `self` (the worker global) acts as our MessagePort.
  const port = self as unknown as MessagePort;

  const listeners = new Map<
    string,
    ((data: any, context: Record<string, any>) => void)[]
  >();
  const subscribers = new Map<string, number>();

  const handleEvent: {
    [K in Pick<PublishingEvent["data"], "type">["type"]]: (
      event: (DataEvent | SubscribeEvent | UnsubscribeEvent) & { type: K },
    ) => void;
  } = {
    data(event) {
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
      for (const name of listeners.keys()) {
        port.postMessage({
          name,
          type: "subscribe",
        } as SubscribeEvent);
      }
    },
  };

  port.addEventListener("message", (ev: PublishingEvent) => {
    handleEvent[ev.data.type](ev.data as any);
  });

  // Notify that the worker is ready.
  port.postMessage({ type: "start" } as StartEvent);

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
      if ((subscribers.get(event.constructor.name) || 0) > 0) {
        port.postMessage({
          name: event.constructor.name,
          data: event.data,
          type: "data",
        } as DataEvent);
      }
    },
  };
}
