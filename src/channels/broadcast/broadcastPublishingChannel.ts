import type {
  DataEvent,
  PublishingChannel,
  PublishingEvent,
  StartEvent,
  SubscribeEvent,
  UnsubscribeEvent,
} from "../../publishingEvents.type.ts";
import { EventHandler } from "../eventHandler.ts";

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

  const eventHandler = new EventHandler(context);

  broadcastChannel.addEventListener(
    "message",
    (event: PublishingEvent) => {
      if (source && event.data.source === source) {
        return;
      }
      eventHandler[event.data.type](event.data as any, broadcastChannel);
    },
  );

  broadcastChannel.postMessage({
    type: "start",
    source,
  } as StartEvent);

  return {
    subscribe(name, callback): void {
      if (!eventHandler.listeners.has(name)) {
        eventHandler.listeners.set(name, []);
      }

      broadcastChannel.postMessage({
        name,
        type: "subscribe",
        source,
      } as SubscribeEvent);

      eventHandler.listeners.get(name)!.push(callback as any);
    },
    unsubscribe(name, callback): void {
      broadcastChannel.postMessage({
        type: "unsubscribe",
        name,
        source,
      } as UnsubscribeEvent);

      if (!eventHandler.listeners.has(name)) {
        return;
      }

      eventHandler.listeners.set(
        name,
        eventHandler.listeners.get(name)!.filter((cb) => cb !== callback),
      );

      if (eventHandler.listeners.get(name)!.length === 0) {
        eventHandler.listeners.delete(name);
        broadcastChannel.postMessage({
          name,
          type: "unsubscribe",
          source,
        } as UnsubscribeEvent);
      }
    },
    publish(event): void {
      if (
        (eventHandler.portSubscriptions.get(event.constructor.name)?.size ||
          0) > 0
      ) {
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
