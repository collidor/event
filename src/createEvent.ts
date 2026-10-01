import { Event } from "./eventModel.ts";

export type EventArgs<T> = [T] extends [void]
  ? [data?: T]
  : undefined extends T
  ? [data?: T]
  : [data: T];

export interface EventConstructor<T = undefined> {
  new (...args: EventArgs<T>): Event<T>;
  readonly prototype: Event<T>;
  readonly name: string;
}

/**
 * Creates an event class constructor with an explicit name and types.
 *
 * This protects against bundlers minifying or mangling class names in production,
 * ensuring that event routing and serialization based on `event.constructor.name`
 * remain stable and deterministic.
 *
 * @param name The unique name of the event.
 * @returns A class constructor extending Event<T> with the specified name.
 *
 * @example
 * ```ts
 * const PingEvent = createEvent<void>("PingEvent");
 * const UserCreated = createEvent<{ id: string }>("UserCreated");
 *
 * bus.on(UserCreated, (data) => console.log(data.id));
 * bus.emit(new UserCreated({ id: "123" }));
 * ```
 */
export function createEvent<T = undefined>(
  name: string,
): EventConstructor<T> {
  if (typeof name !== "string" || name.trim().length === 0) {
    throw new TypeError("Event name must be a non-empty string");
  }

  const EventClass = class extends Event<T> {
    constructor(...args: any[]) {
      super(...(args as any));
    }
  };

  Object.defineProperty(EventClass, "name", {
    value: name,
    configurable: true,
  });

  return EventClass as unknown as EventConstructor<T>;
}
