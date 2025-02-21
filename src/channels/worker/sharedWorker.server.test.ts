import { assert, assertEquals } from "jsr:@std/assert";
import type {
  DataEvent,
  MessagePortLike,
  PublishingEvent,
  SubscribeEvent,
} from "../../publishingEvents.type.ts";
import { createSharedWorkerPublishingChannel } from "./sharedWorker.server.ts";

// Fake implementation of a MessagePort for testing.
class FakeMessagePort implements MessagePortLike {
  public messages: any[] = [];
  public onmessage: ((ev: PublishingEvent) => void) | null = null;
  public onmessageerror: ((ev: MessageEvent) => void) | null = null;
  postMessage(message: any): void {
    this.messages.push(message);
  }
  start(): void {
    // no-op for fake port
  }
}

// Fake SharedWorker-like object.
class FakeSharedWorker {
  public onconnect:
    | ((ev: { ports: readonly MessagePortLike[] }) => void)
    | null = null;
}

// A simple test event class used for publishing.
class TestEvent {
  data: any;
  constructor(data: any) {
    this.data = data;
  }
}

// Helper to simulate a connection on the fake shared worker.
function simulateConnection(
  sharedWorker: FakeSharedWorker,
  port: FakeMessagePort,
): void {
  if (sharedWorker.onconnect) {
    sharedWorker.onconnect({ ports: [port] });
  }
}

Deno.test("shared worker channel sends start message on new connection", () => {
  const fakeSharedWorker = new FakeSharedWorker();
  createSharedWorkerPublishingChannel(fakeSharedWorker, {
    server: true,
  });
  const fakePort = new FakeMessagePort();

  // Simulate a connection.
  simulateConnection(fakeSharedWorker, fakePort);

  // The addPort function should send a start message.
  const startMsgs = fakePort.messages.filter((msg) => msg.type === "start");
  assert(
    startMsgs.length >= 1,
    "Expected at least one start message on new connection",
  );
});

Deno.test("shared worker channel subscribe sends subscribe message to all connected ports", () => {
  const fakeSharedWorker = new FakeSharedWorker();
  const channel = createSharedWorkerPublishingChannel(fakeSharedWorker, {
    server: true,
  });

  const fakePort1 = new FakeMessagePort();
  const fakePort2 = new FakeMessagePort();

  simulateConnection(fakeSharedWorker, fakePort1);
  simulateConnection(fakeSharedWorker, fakePort2);

  // Clear any existing messages.
  fakePort1.messages = [];
  fakePort2.messages = [];

  // Call subscribe.
  const callback = (_data: any, _context: Record<string, any>) => {};
  channel.subscribe("TestEvent", callback);

  // Both ports should receive a subscribe message.
  const subMsgs1 = fakePort1.messages.filter(
    (msg) => msg.type === "subscribe" && msg.name === "TestEvent",
  );
  const subMsgs2 = fakePort2.messages.filter(
    (msg) => msg.type === "subscribe" && msg.name === "TestEvent",
  );
  assert(
    subMsgs1.length >= 1,
    "Expected at least one subscribe message on port1",
  );
  assert(
    subMsgs2.length >= 1,
    "Expected at least one subscribe message on port2",
  );
});

Deno.test("shared worker channel unsubscribe sends unsubscribe message to all connected ports", () => {
  const fakeSharedWorker = new FakeSharedWorker();
  const channel = createSharedWorkerPublishingChannel(fakeSharedWorker, {
    server: true,
  });

  const fakePort1 = new FakeMessagePort();
  const fakePort2 = new FakeMessagePort();

  simulateConnection(fakeSharedWorker, fakePort1);
  simulateConnection(fakeSharedWorker, fakePort2);

  // Subscribe and then unsubscribe.
  const callback = (_data: any, _context: Record<string, any>) => {};
  channel.subscribe("TestEvent", callback);

  // Clear messages after subscribe.
  fakePort1.messages = [];
  fakePort2.messages = [];

  channel.unsubscribe("TestEvent", callback);

  // Both ports should receive an unsubscribe message.
  const unsubMsgs1 = fakePort1.messages.filter(
    (msg) => msg.type === "unsubscribe" && msg.name === "TestEvent",
  );
  const unsubMsgs2 = fakePort2.messages.filter(
    (msg) => msg.type === "unsubscribe" && msg.name === "TestEvent",
  );
  assert(
    unsubMsgs1.length >= 1,
    "Expected at least one unsubscribe message on port1",
  );
  assert(
    unsubMsgs2.length >= 1,
    "Expected at least one unsubscribe message on port2",
  );
});

Deno.test("shared worker channel publish sends data message only to subscribed ports", () => {
  const fakeSharedWorker = new FakeSharedWorker();
  const channel = createSharedWorkerPublishingChannel(fakeSharedWorker, {
    server: true,
  });

  const fakePort1 = new FakeMessagePort();
  const fakePort2 = new FakeMessagePort();

  simulateConnection(fakeSharedWorker, fakePort1);
  simulateConnection(fakeSharedWorker, fakePort2);

  // Clear messages.
  fakePort1.messages = [];
  fakePort2.messages = [];

  // Simulate that only fakePort1 subscribes to "TestEvent".
  // We simulate this by invoking the onmessage handler of fakePort1 with a subscribe event.
  if (fakePort1.onmessage) {
    const subEvent: SubscribeEvent = {
      name: "TestEvent",
      type: "subscribe",
    };
    fakePort1.onmessage({ data: subEvent } as PublishingEvent);
  } else {
    // Alternatively, manually update portSubscriptions on the internal event handler.
    // (This is only for testing if onmessage is not set.)
    // @ts-ignore
    channel.__eventHandler?.portSubscriptions.set(
      "TestEvent",
      new Set([fakePort1]),
    );
  }

  // Create and publish a TestEvent.
  const testEvent = new TestEvent({ message: "published" });
  channel.publish(testEvent);

  // fakePort1 should receive a data message.
  const dataMsgs1 = fakePort1.messages.filter(
    (msg) => msg.type === "data" && msg.name === "TestEvent",
  );
  assert(
    dataMsgs1.length >= 1,
    "Expected at least one data message on port1",
  );
  const dataMsg1: DataEvent = dataMsgs1[0];
  assertEquals(dataMsg1.data, { message: "published" });

  // fakePort2 should not receive a data message.
  const dataMsgs2 = fakePort2.messages.filter(
    (msg) => msg.type === "data" && msg.name === "TestEvent",
  );
  assertEquals(dataMsgs2.length, 0, "Expected no data messages on port2");
});
