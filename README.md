[![Codecov](https://codecov.io/gh/collidor/event/branch/main/graph/badge.svg)](https://codecov.io/gh/collidor/event)

# @collidor/event

A small library to create, register, and listen to events. This library provides an event bus with a customizable event model and supports cross-context event propagation using a BroadcastChannel–based publishing channel.

## Features

- **Event Bus** – Easily register, unregister, and emit events.
- **Custom Event Model** – Extend the base `Event` class to create your own events.
- **Publishing Channel** – Use a BroadcastChannel for propagating events between contexts (e.g. across browser tabs or windows).
- **Flexible Contexts** – Pass custom context data along with your events.

## Installation

### Deno

[https://jsr.io/@collidor/event]
Import directly with a jsr specifier:

```ts
import { EventBus, Event } from "jsr:@collidor/event";
```

### Node.js / npm

Install via npm:

```bash
npm install @collidor/event
```

Then import it:

```ts
import { EventBus, Event } from "@collidor/event";
```

## Usage

### Creating Custom Events

Extend the `Event` class from `eventModel.ts`:

```ts
import { Event } from "@collidor/event";

export class MyEvent extends Event<{ message: string }> {}
```

### Setting Up the Event Bus

Create an instance of the `EventBus` and subscribe to your custom event. Optionally, configure a publishing channel using the BroadcastChannel API.

```ts
import { EventBus, MyEvent } from "@collidor/event";
import { createBroadcastPublishingChannel } from "@collidor/event/broadcastPublishingChannel";

const publishingChannel = createBroadcastPublishingChannel("my-channel", { user: "John Doe" }, "main");

const bus = new EventBus({
  context: { user: "John Doe" },
  publishingChannel,
});

bus.on(MyEvent, (data, context) => {
  console.log("Received event:", data.message);
});
```

### Emitting Events

Emit events using the `emit` method:

```ts
bus.emit(new MyEvent("Hello, world!"));
```

## Examples

Check the examples [folder](https://github.com/collidor/event/tree/main/examples).

## API Reference

### Event Model

The base event model, defined in `eventModel.ts`:

```ts
export abstract class Event<T = unknown> {
  public data: T;

  constructor(data: T) {
    this.data = data;
  }
}
```

### Event Bus

The `EventBus` class, defined in `eventBus.ts`, provides the main API:

```ts
export class EventBus<TContext extends Record<string, any> = Record<string, any>> {
  on<T>(
    event: new (...args: any[]) => Event<T>,
    callback: (data: T, context: TContext) => void,
    abortSignal?: AbortSignal,
  ): void;

  off<T>(
    event: new (...args: any[]) => Event<T>,
    callback: (data: T, context: TContext) => void,
  ): void;

  emit<T>(event: Event<T>): void;
}
```

### Publishing Channel

The publishing channel API is defined via the `PublishingChannel` interface in [publishingEvents.type.ts](./publishingEvents.type.ts) and implemented by the `createBroadcastPublishingChannel` function:

```ts
export function createBroadcastPublishingChannel<TContext extends Record<string, any>>(
  nameOrBroadcastChannel: string | BroadcastChannel,
  context: TContext,
  source?: string,
): PublishingChannel<TContext>;
```

This channel uses the browser’s native BroadcastChannel API to send and receive messages.

## Package Structure

- **main.ts** – Re-exports the primary API (EventBus, Event, etc.).
- **eventModel.ts** – Contains the abstract `Event` class.
- **eventBus.ts** – Implements the EventBus class.
- **channels/broadcastPublishingChannel.ts** – Provides the BroadcastChannel–based publishing channel.
- **publishingEvents.type.ts** – Contains type definitions for publishing events.

## License

MIT License. See [LICENSE](LICENSE) for details.
