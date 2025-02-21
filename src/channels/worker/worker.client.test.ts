// workerClientPublishingChannel_test.ts
import { assert, assertEquals } from "jsr:@std/assert";
import type {
  DataEvent,
  MessagePortLike,
  PublishingEvent,
  SubscribeEvent,
} from "../../publishingEvents.type.ts";
import { createClientWorkerPublishingChannel } from "./worker.client.ts";

// A FakeMessagePort that implements MessagePortLike for testing.
class FakeMessagePort implements MessagePortLike {
  public messages: any[] = [];
  public onmessage: ((ev: PublishingEvent) => void) | null = null;
  public onmessageerror: ((ev: MessageEvent) => void) | null = null;
  postMessage(message: any): void {
    this.messages.push(message);
  }
}

// A simple test event class.
class TestEvent {
  data: any;
  constructor(data: any) {
    this.data = data;
  }
  // Its name will be used as the event name.
  static get name() {
    return "TestEvent";
  }
}

Deno.test("client channel subscribe sends subscribe message and registers listener", async () => {
  const fakePort = new FakeMessagePort();
  const clientChannel = createClientWorkerPublishingChannel(fakePort, {
    user: "client",
  });

  // Clear any initial messages (like start message).
  fakePort.messages = [];

  let callbackCalled = false;
  const callback = (_data: any, _context: Record<string, any>) => {
    callbackCalled = true;
  };

  clientChannel.subscribe("TestEvent", callback);

  // Verify that a subscribe message was sent.
  const subMsgs = fakePort.messages.filter(
    (msg) => msg.type === "subscribe" && msg.name === "TestEvent",
  );
  assert(subMsgs.length >= 1, "Expected at least one subscribe message");

  // Also, check that the callback was registered.
  // (We simulate an incoming data message to trigger the callback.)
  const dataMsg: DataEvent = {
    name: "TestEvent",
    type: "data",
    data: JSON.stringify({ message: "hello" }),
  };
  // Simulate receiving a data message from the port.
  if (fakePort.onmessage) {
    fakePort.onmessage({ data: dataMsg } as PublishingEvent);
  } else {
    // Directly call the event handler on the fake port.
    clientChannel.publish(new TestEvent({ message: "hello" }));
  }

  // Wait a tick if needed.
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert(callbackCalled, "Expected the subscribed callback to be called");
});

Deno.test("client channel unsubscribe sends unsubscribe message and removes listener", async () => {
  const fakePort = new FakeMessagePort();
  const clientChannel = createClientWorkerPublishingChannel(fakePort, {
    user: "client",
  });

  // Clear any initial messages.
  fakePort.messages = [];

  let callbackCalled = false;
  const callback = (_data: any, _context: Record<string, any>) => {
    callbackCalled = true;
  };

  clientChannel.subscribe("TestEvent", callback);
  // Reset messages after subscribe.
  fakePort.messages = [];

  clientChannel.unsubscribe("TestEvent", callback);

  // Verify that an unsubscribe message was sent.
  const unsubMsgs = fakePort.messages.filter(
    (msg) => msg.type === "unsubscribe" && msg.name === "TestEvent",
  );
  assert(unsubMsgs.length >= 1, "Expected at least one unsubscribe message");

  // Now, simulate a data event.
  const dataMsg: DataEvent = {
    name: "TestEvent",
    type: "data",
    data: JSON.stringify({ message: "should not call" }),
  };
  if (fakePort.onmessage) {
    fakePort.onmessage({ data: dataMsg } as PublishingEvent);
  }
  await new Promise((resolve) => setTimeout(resolve, 10));
  // The callback should not be called.
  assertEquals(callbackCalled, false);
});

Deno.test("client channel publish sends data message if port is subscribed", () => {
  const fakePort = new FakeMessagePort();
  const clientChannel = createClientWorkerPublishingChannel(fakePort, {
    user: "client",
  });

  // Clear any initial messages.
  fakePort.messages = [];

  // Simulate an incoming subscribe event from the worker.
  // This will update the internal portSubscriptions for "TestEvent".
  const subEvent: SubscribeEvent = {
    name: "TestEvent",
    type: "subscribe",
  };
  if (fakePort.onmessage) {
    fakePort.onmessage({ data: subEvent } as PublishingEvent);
  }

  // Create a TestEvent instance.
  const testEvent = new TestEvent({ message: "published" });
  clientChannel.publish(testEvent);

  // Verify that a data message was sent.
  const dataMsgs = fakePort.messages.filter(
    (msg) => msg.type === "data" && msg.name === "TestEvent",
  );
  assert(dataMsgs.length >= 1, "Expected at least one data message on publish");
  // Check that the data message has the expected payload.
  const dataMsg: DataEvent = dataMsgs[0];
  const parsedData = JSON.parse(dataMsg.data);
  assertEquals(parsedData, { message: "published" });
});

Deno.test("client channel sends start message on initialization", () => {
  const fakePort = new FakeMessagePort();
  // When creating the channel, it sends a start message.
  createClientWorkerPublishingChannel(fakePort, {
    user: "client",
  });

  // Check that a start message was sent.
  const startMsgs = fakePort.messages.filter(
    (msg) => msg.type === "start",
  );
  assert(
    startMsgs.length >= 1,
    "Expected at least one start message on initialization",
  );
});
