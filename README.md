[![Codecov](https://codecov.io/gh/collidor/event/branch/main/graph/badge.svg)](https://codecov.io/gh/collidor/event)

# @collidor/event

A small library to create, register, and listen to events. This library provides an event bus with a customizable event model and supports cross-context event propagation using multiple publishing channels:

- A **BroadcastChannel–based** publishing channel for communication across browser tabs or windows.
- A **Worker–based** publishing channel for dedicated workers.
- A **SharedWorker–based** publishing channel for multi-client scenarios.

## Features

- **Event Bus** – Easily register, unregister, and emit events.
- **Custom Event Model** – Extend the base `Event` class to create your own events.
- **Publishing Channels** – Choose from multiple channels for propagating events between contexts:
  - **BroadcastChannel** – For browser tabs and windows.
  - **Worker** – For dedicated workers.
  - **SharedWorker** – For shared worker scenarios with dynamic client connections.
- **Flexible Contexts** – Pass custom context data along with your events.

## Installation

### Deno

Import directly using a jsr specifier:

:::ts
import { EventBus, Event } from "jsr:@collidor/event";
:::

### Node.js / npm

Install via npm:

:::bash
npm install @collidor/event
:::

Then import it:

:::ts
import { EventBus, Event } from "@collidor/event";
:::

## Usage

### Creating Custom Events

Extend the `Event` class from `eventModel.ts`:

:::ts
import { Event } from "@collidor/event";

export class MyEvent extends Event<{ message: string }> {}
:::

### Setting Up the Event Bus with a Publishing Channel

Create an instance of the `EventBus` and subscribe to your custom event. You can choose the appropriate publishing channel for your use case.

#### Using the BroadcastChannel Publishing Channel

:::ts
import { EventBus, MyEvent } from "@collidor/event";
import { createBroadcastPublishingChannel } from "@collidor/event/broadcastChannel";

const publishingChannel = createBroadcastPublishingChannel("my-channel", { user: "John Doe" }, "main");

export const eventBus = new EventBus({
  context: { user: "John Doe" },
  publishingChannel,
});

eventBus.on(MyEvent, (data, context) => {
  console.log("Received event:", data.message);
});
:::

#### Using the Worker Publishing Channel

**Server Side (Dedicated Worker):**

Inside your dedicated worker script:

:::ts
import { createWorkerPublishingChannel } from "@collidor/event/worker/server";

const serverChannel = createWorkerPublishingChannel({ server: true });
// Use serverChannel.subscribe(), publish(), etc. within the worker.
:::

**Client Side (Main Thread):**

On the client side, create a worker and set up the client channel:

:::ts
import { EventBus } from "@collidor/event";
import { createClientWorkerPublishingChannel } from "@collidor/event/worker/client";

const worker = new Worker(new URL("./worker.ts", import.meta.url).href, { type: "module" });
export const eventBus = new EventBus({
  publishingChannel: createClientWorkerPublishingChannel(worker),
});
:::

#### Using the SharedWorker Publishing Channel

**Server Side (Shared Worker):**

Inside your shared worker script:

:::ts
import { createSharedWorkerPublishingChannel } from "@collidor/event/worker/shared/server";

const serverChannel = createSharedWorkerPublishingChannel(self, { server: true });
// The channel automatically listens for new connections.
:::

**Client Side (Main Thread):**

On the client side, create a SharedWorker and configure the client channel:

:::ts
import { EventBus } from "@collidor/event";
import { createClientWorkerPublishingChannel } from "@collidor/event/worker/client";

const sharedWorker = new SharedWorker(new URL("./sharedWorker.ts", import.meta.url).href, { type: "module" });
export const eventBus = new EventBus({
  publishingChannel: createClientWorkerPublishingChannel(sharedWorker.port),
});
:::

### Emitting Events

Emit events using the `emit` method:

:::ts
eventBus.emit(new MyEvent("Hello, world!"));
:::

## Examples

Check the examples [folder](https://github.com/collidor/event/tree/main/examples).

## API Reference

### Event Model

The base event model, defined in `eventModel.ts`:

:::ts
export abstract class Event<T = unknown> {
  public data: T;

  constructor(data: T) {
    this.data = data;
  }
}
:::

### Event Bus

The `EventBus` class, defined in `eventBus.ts`, provides the main API:

:::ts
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
:::

### Publishing Channels

#### BroadcastChannel Publishing Channel

Defined via the `PublishingChannel` interface in [publishingEvents.type.ts](./publishingEvents.type.ts) and implemented by:

:::ts
export function createBroadcastPublishingChannel<TContext extends Record<string, any>>(
  nameOrBroadcastChannel: string | BroadcastChannel,
  context: TContext,
  source?: string,
): PublishingChannel<TContext>;
:::

This channel uses the browser’s native BroadcastChannel API to send and receive messages.

#### Worker Publishing Channel

For dedicated workers, see:

:::ts
export function createWorkerPublishingChannel<TContext extends Record<string, any>>(
  port: Worker | MessagePortLike,
  context: TContext,
  options?: { onConnect?: (port: MessagePort) => void }
): PublishingChannel<TContext>;
:::

#### SharedWorker Publishing Channel

For SharedWorker scenarios (which support dynamic client connections), see:

:::ts
export function createSharedWorkerPublishingChannel<TContext extends Record<string, any>>(
  sharedWorker: SharedWorkerLike,
  context: TContext,
  options?: { onConnect?: (port: MessagePort) => void } & EventHandlerOptions
): PublishingChannel<TContext>;
:::

## Package Structure

- **main.ts** – Re-exports the primary API (EventBus, Event, etc.).
- **eventModel.ts** – Contains the abstract `Event` class.
- **eventBus.ts** – Implements the EventBus class.
- **channels/**
  - **broadcastPublishingChannel.ts** – Provides the BroadcastChannel–based publishing channel.
  - **worker/client.ts** – Provides the client-side Worker publishing channel.
  - **worker/server.ts** – Provides the server-side Worker publishing channel.
  - **worker/shared/server.ts** – Provides the SharedWorker–based publishing channel.
- **publishingEvents.type.ts** – Contains type definitions for publishing events.
- **eventHandler.ts** – Contains shared event handler logic for all channels.

## License

MIT License. See [LICENSE](LICENSE) for details.
