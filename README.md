# @collidor/event

[![Codecov](https://codecov.io/gh/collidor/event/branch/main/graph/badge.svg)](https://codecov.io/gh/collidor/event)
[![npm version](https://img.shields.io/npm/v/@collidor/event)](https://www.npmjs.com/package/@collidor/event)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A lightweight event system with cross-context communication. Perfect for modern web apps, workers, and distributed systems.

---

## Installation

```bash
npm install @collidor/event
```

---

## Core Features

- Class-based event system with strict typing
- Cross-context communication (Window ↔ Worker ↔ Tab)
- Built-in support for BroadcastChannel/SharedWorker
- Context propagation & AbortController integration

## Basic Usage

```ts [Event Definition]
import { Event } from "@collidor/event";

class UserUpdate extends Event<{ id: string }> {}
class SystemAlert extends Event<string> {}
```

```ts [Event Bus]
import { EventBus } from "@collidor/event";

const bus = new EventBus();

// Subscribe
bus.on(UserUpdate, (data) => {
  console.log(`User ${data.id} updated`);
});

// Publish
bus.emit(new UserUpdate({ id: "123" }));
```

---

## Cross-Context Patterns

The PortChannel is the main exported channel, it accepts `MessagePortLike` ports, which
have a `postMessage` method, and can set and use a `onmessage` property callback. This means that
the browsers APIs like BroadcastChannel, Worker and SharedWorker will work by default.

My plan is to add adapters later so other things can behave like ports, like Websockets, WebRTC, Http+SEE and Datagrams.

The PortChannel will not emit events to ports that didn't send a message first telling that it has a subscriber for such event.

### 1. BroadcastChannel (Tab-to-Tab)

```ts [Tab A]
import { PortChannel, EventBus } from "@collidor/event";

const channel = new PortChannel();
const bus = new EventBus({ channel });
channel.addPort(new BroadcastChannel("app-channel"));

class TabMessage extends Event<string> {}
bus.emit(new TabMessage("Hello from Tab A!"));
```

```ts
import { PortChannel, EventBus } from "@collidor/event";

const channel = new PortChannel();
const bus = new EventBus({ channel });
channel.addPort(new BroadcastChannel("app-channel"));

bus.on(TabMessage, (msg) => {
  console.log("Received:", msg); // "Hello from Tab A!"
});
```

---

### 2. SharedWorker (Multi-Context)

```ts
import { PortChannel, EventBus } from "@collidor/event";

const channel = new PortChannel();
const bus = new EventBus({ channel });
const worker = new SharedWorker("worker.js");

channel.addPort(worker.port);

class TaskEvent extends Event<{ id: string }> {}
bus.emit(new TaskEvent({ id: "shared-task" }));
```

```ts
import { PortChannel, EventBus } from "@collidor/event";

const channel = new PortChannel();
const bus = new EventBus({ channel });

// Handle new connections
self.onconnect = (event) => {
  const port = event.ports[0];
  channel.addPort(port);
};

self.start();

bus.on(TaskEvent, ({ id }) => {
  console.log("Processing shared task:", id);
});
```

---

## Advanced Patterns

### Context Propagation
```ts
const bus = new EventBus({
  context: { requestId: "123" }
});

bus.on(DataEvent, (data, ctx) => {
  console.log(ctx.requestId); // "123"
});

// Override per emission
bus.emit(new DataEvent(), { requestId: "temp" });
```

---

## API Overview

### EventBus
- `on(event, handler, signal?)`
- `off(event, handler)`
- `emit(event, context?)`
- `emitByName(name, data, context?)`

### PortChannel
- `addPort(port)`
- `removePort(port)`
- `publish(event)`
- `subscribe(name, callback)`
- `unsubscribe(name, callback)`

#### PortChannel sequence diagram

```mermaid
sequenceDiagram
    participant S as Server PortChannel
    participant MP as MessagePort
    participant C as Client PortChannel

    %% Server adds a MessagePort (acts as connecting port)
    S->>MP: addPort(port)
    Note over S,MP: Server attaches MessagePort

    %% MessagePort forwards startEvent to the Client
    MP->>C: onmessage({type: "startEvent"})
    Note over C: Client receives startEvent and sets up message handlers

    %% Client subscribes to "TestEvent"
    C->>MP: postMessage({type:"subscribeEvent", name:"TestEvent"})
    Note over C: Client tells that it has a subscription for "TestEvent"

    %% MessagePort delivers subscribeEvent to Server
    MP->>S: onmessage({type:"subscribeEvent", name:"TestEvent"})
    Note over S: Server calls addPortSubscription("TestEvent")

    %% If the Server had buffered events for "TestEvent", flush them:
    alt Buffered events exist for "TestEvent"
      S->>MP: postMessage(buffered dataEvent for "TestEvent")
      MP->>C: onmessage(buffered dataEvent for "TestEvent")
    else
      Note over S: No buffered events to flush
    end

    %% Now, the Server publishes a new event "TestEvent"
    S->>S: publish("TestEvent", data)
    alt Subscriber exists
      S->>MP: postMessage({type:"dataEvent", name:"TestEvent", data})
      MP->>C: onmessage({type:"dataEvent", name:"TestEvent", data})
      Note over C: Client processes the dataEvent
    else
      S->>S: Buffer event "TestEvent" with timeout
      Note over S: Event buffered until a subscriber appears
    end

```

---

## Development

```bash [Commands]
# Install dependencies
npm install

# Run tests (requires Deno)
npm test

# Build project
npm run build
```

---

*MIT License | © 2024 [Alykam Burdzaki](https://alykam.com)*
*[Report Issues](https://github.com/collidor/event/issues)*