import type {
  DataEvent,
  MessagePortLike,
  PublishingEvent,
  StartEvent,
  SubscribeEvent,
  UnsubscribeEvent,
} from "../publishingEvents.type.ts";

type EventHandlers = {
  [K in Pick<PublishingEvent["data"], "type">["type"]]: (
    event: (DataEvent | SubscribeEvent | UnsubscribeEvent) & { type: K },
    port: MessagePortLike,
  ) => void;
};

export type EventHandlerOptions = {
  onSubscribe?: (name: string) => void;
};

export class EventHandler implements EventHandlers {
  public listeners = new Map<
    string,
    ((data: any, context: Record<string, any>) => void)[]
  >();
  public portSubscriptions = new Map<string, Set<MessagePortLike>>();
  public ports = new Set<MessagePortLike>();
  public context: Record<string, any>;
  public options: EventHandlerOptions;

  constructor(
    context: Record<string, any> = {},
    options: EventHandlerOptions = {},
  ) {
    this.context = context;
    this.options = options;
  }

  private addPortSubscription(port: MessagePortLike, eventName: string): void {
    let set = this.portSubscriptions.get(eventName);
    if (!set) {
      set = new Set<MessagePortLike>();
      this.portSubscriptions.set(eventName, set);
    }
    set.add(port);
  }

  private removePortSubscription(
    port: MessagePortLike,
    eventName: string,
  ): void {
    const set = this.portSubscriptions.get(eventName);
    if (set) {
      set.delete(port);
      if (set.size === 0) {
        this.portSubscriptions.delete(eventName);
      }
    }
  }

  public sendToPorts(event: DataEvent, portSet: Set<MessagePortLike>): void {
    for (const port of portSet) {
      port.postMessage(event);
    }
  }

  data(event: DataEvent): void {
    if (this.listeners.has(event.name)) {
      this.listeners.get(event.name)!.forEach((cb) =>
        cb(event.data, this.context)
      );
    }
  }

  subscribe(event: SubscribeEvent, port: MessagePortLike): void {
    if (Array.isArray(event.name as string[])) {
      for (const name of event.name) {
        this.addPortSubscription(port, name);
        if (this.options.onSubscribe) {
          this.options.onSubscribe(name);
        }
      }
    } else {
      this.addPortSubscription(port, event.name as string);
      if (this.options.onSubscribe) {
        this.options.onSubscribe(event.name as string);
      }
    }
  }

  unsubscribe(event: UnsubscribeEvent, port: MessagePortLike): void {
    if (Array.isArray(event.name as string[])) {
      for (const name of event.name) {
        this.removePortSubscription(port, name);
      }
    } else {
      this.removePortSubscription(port, event.name as string);
    }
  }

  start(_event: StartEvent, port: MessagePortLike): void {
    for (const eventName of this.listeners.keys()) {
      port.postMessage({
        name: eventName,
        type: "subscribe",
      } as SubscribeEvent);
    }
  }
}
