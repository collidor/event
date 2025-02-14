import type {
  DataEvent,
  PublishingChannel,
  PublishingEvent,
  StartEvent,
  SubscribeEvent,
  UnsubscribeEvent,
} from "../../publishingEvents.type.ts";

function getBroadcastChannel(
  name: string | BroadcastChannel,
): BroadcastChannel {
  if (typeof name === "string") {
    return new BroadcastChannel(name);
  }
  return name;
}

export function createBroadcastPublishingChannel<
  TContext extends Record<string, any>,
>(
  nameOrBroadcastChannel: string | BroadcastChannel,
  context: TContext = {} as TContext,
  source?: string,
): PublishingChannel<TContext> {
  const broadcastChannel = getBroadcastChannel(nameOrBroadcastChannel);

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
      if (listeners.has(event.name)) {
        listeners.get(event.name)!.forEach((callback) => {
          callback(event.data, context);
        });
      }
    },
    subscribe(event) {
      subscribers.set(event.name, (subscribers.get(event.name) || 0) + 1);
    },
    unsubscribe(event) {
      subscribers.set(event.name, (subscribers.get(event.name) || 0) - 1);
    },
    start() {
      listeners.keys().forEach((name) => {
        broadcastChannel.postMessage({
          name,
          type: "subscribe",
        });
      });
    },
  };

  broadcastChannel.addEventListener(
    "message",
    (event: PublishingEvent) => {
      if (source && event.data.source === source) {
        return;
      }
      handleEvent[event.data.type](event.data as any);
    },
  );

  broadcastChannel.postMessage({
    type: "start",
    source,
  } as StartEvent);

  return {
    subscribe(name, callback): void {
      if (!listeners.has(name)) {
        listeners.set(name, []);
      }

      broadcastChannel.postMessage({
        name,
        type: "subscribe",
        source,
      } as SubscribeEvent);

      listeners.get(name)!.push(callback as any);
    },
    unsubscribe(name, callback): void {
      broadcastChannel.postMessage({
        type: "unsubscribe",
        name,
        source,
      } as UnsubscribeEvent);

      if (!listeners.has(name)) {
        return;
      }

      listeners.set(
        name,
        listeners.get(name)!.filter((cb) => cb !== callback),
      );

      if (listeners.get(name)!.length === 0) {
        listeners.delete(name);
        broadcastChannel.postMessage({
          name,
          type: "unsubscribe",
          source,
        } as UnsubscribeEvent);
      }
    },
    publish(event): void {
      if ((subscribers.get(event.constructor.name) || 0) > 0) {
        broadcastChannel.postMessage({
          name: event.constructor.name,
          data: event.data,
          type: "data",
          source,
        } as DataEvent);
      }
    },
  };
}
