// workerServerPublishingChannel_test.ts
import { assert, assertEquals } from "jsr:@std/assert";
import type {
  DataEvent,
  MessagePortLike,
  PublishingEvent,
  SubscribeEvent,
} from "../../publishingEvents.type.ts";
import { createWorkerPublishingChannel } from "./worker.server.ts";

// A FakeMessagePort that implements MessagePortLike for testing.
class FakeMessagePort implements MessagePortLike {
  public messages: any[] = [];
  public onmessage: ((ev: PublishingEvent) => void) | null = null;
  public onmessageerror: ((ev: MessageEvent) => void) | null = null;
  postMessage(message: any): void {
    this.messages.push(message);
  }
}

// A simple test event class for publish.
class TestEvent {
  data: any;
  constructor(data: any) {
    this.data = data;
  }
  // Use the class name as the event name.
  static get name() {
    return "TestEvent";
  }
}

Deno.test("worker server channel sends start message on initialization", () => {
  const fakePort = new FakeMessagePort();

  createWorkerPublishingChannel(fakePort, { server: true });

  // Check that a start message was sent.
  const startMsgs = fakePort.messages.filter(
    (msg) => msg.type === "start",
  );
  assert(
    startMsgs.length >= 1,
    "Expected at least one start message on initialization",
  );
});

Deno.test("worker server channel subscribe sends subscribe message and registers listener", () => {
  const fakePort = new FakeMessagePort();

  const serverChannel = createWorkerPublishingChannel(fakePort, {
    server: true,
  });
  // Clear any initial start messages.
  fakePort.messages = [];

  let callbackCalled = false;
  const callback = (_data: any, _context: Record<string, any>) => {
    callbackCalled = true;
  };

  serverChannel.subscribe("TestEvent", callback);

  // The subscribe method sends a subscribe message.
  const subMsgs = fakePort.messages.filter(
    (msg) => msg.type === "subscribe" && msg.name === "TestEvent",
  );
  assert(subMsgs.length >= 1, "Expected at least one subscribe message");
  assert(callbackCalled === false, "Callback should not be called yet");
});

Deno.test("worker server channel unsubscribe sends unsubscribe message and removes listener", async () => {
  const fakePort = new FakeMessagePort();
  (globalThis as any).self = fakePort;

  const serverChannel = createWorkerPublishingChannel(fakePort, {
    server: true,
  });
  // Clear initial messages.
  fakePort.messages = [];

  let callbackCalled = false;
  const callback = (_data: any, _context: Record<string, any>) => {
    callbackCalled = true;
  };

  serverChannel.subscribe("TestEvent", callback);
  // Clear messages after subscribe.
  fakePort.messages = [];

  serverChannel.unsubscribe("TestEvent", callback);

  const unsubMsgs = fakePort.messages.filter(
    (msg) => msg.type === "unsubscribe" && msg.name === "TestEvent",
  );
  assert(unsubMsgs.length >= 1, "Expected at least one unsubscribe message");

  // Simulate a data event from an external source.
  const dataMsg: DataEvent = {
    name: "TestEvent",
    type: "data",
    data: { message: "should not call" },
  };
  if (fakePort.onmessage) {
    fakePort.onmessage({ data: dataMsg } as PublishingEvent);
  }

  await new Promise((resolve) => setTimeout(resolve, 10));
  assertEquals(
    callbackCalled,
    false,
    "Callback should not be called after unsubscribe",
  );
});

Deno.test("worker server channel publish sends data message if port is subscribed", () => {
  const fakePort = new FakeMessagePort();

  const serverChannel = createWorkerPublishingChannel(fakePort, {
    server: true,
  });
  // Clear initial messages.
  fakePort.messages = [];

  // Simulate an incoming subscribe message to update portSubscriptions.
  // Since the channel listens via port.onmessage, we manually trigger it.
  if (fakePort.onmessage) {
    const subEvent: SubscribeEvent = {
      name: "TestEvent",
      type: "subscribe",
    };
    fakePort.onmessage({ data: subEvent } as PublishingEvent);
  }

  // Create and publish a TestEvent.
  const testEvent = new TestEvent({ message: "published" });
  serverChannel.publish(testEvent);

  // Check that a data message was sent.
  const dataMsgs = fakePort.messages.filter(
    (msg) => msg.type === "data" && msg.name === "TestEvent",
  );
  assert(dataMsgs.length >= 1, "Expected at least one data message on publish");

  // In the worker server channel, event.data is sent as-is (not stringified).
  const dataMsg: DataEvent = dataMsgs[0];
  assertEquals(dataMsg.data, { message: "published" });
});
