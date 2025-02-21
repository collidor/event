import { assert, assertEquals } from "jsr:@std/assert";
import { createBroadcastPublishingChannel } from "./broadcastPublishingChannel.ts";
import { MockBroadcastChannel } from "./broadcastChannel.mock.ts";

// Define a minimal UnsubscribeEvent type for testing purposes.
type UnsubscribeEvent = {
  type: "unsubscribe";
  name: string;
  source?: string;
};

Deno.test("BroadcastPublishingChannel - publishing event is received by subscribed channel", async () => {
  // Create a unique channel name for isolation.
  const channelName = "test-channel-" + crypto.randomUUID();
  const bc1 = new MockBroadcastChannel(channelName);
  const bc2 = new MockBroadcastChannel(channelName);

  // Create two publishing channel instances sharing the same BroadcastChannel.
  // They will have different internal 'source' values.
  const subscriber = createBroadcastPublishingChannel(
    bc1 as BroadcastChannel,
    { testContext: "sub" },
    "sub",
  );
  const publisher = createBroadcastPublishingChannel(
    bc2 as BroadcastChannel,
    { testContext: "pub" },
    "pub",
  );

  let callbackCalled = false;
  let callbackData: any = null;
  let callbackContext: any = null;

  // Define a test event class.
  class TestEvent {
    data: any;
    constructor(data: any) {
      this.data = data;
    }
  }

  // Subscribe on the subscriber instance using the event name equal to the class name.
  subscriber.subscribe("TestEvent", (data, ctx) => {
    callbackCalled = true;
    callbackData = data;
    callbackContext = ctx;
  });

  // Give some time for the subscribe event to propagate between instances.
  await new Promise((resolve) => setTimeout(resolve, 100));

  // Publish an event from the publisher instance.
  publisher.publish(new TestEvent({ message: "hello" }));

  // Wait for the published event to propagate.
  await new Promise((resolve) => setTimeout(resolve, 100));

  assert(callbackCalled, "Expected the callback to be called");
  assertEquals(callbackData, { message: "hello" });
  // The context delivered should be the one passed to the subscriber instance.
  assertEquals(callbackContext, { testContext: "sub" });

  bc1.close();
  bc2.close();
});

Deno.test("BroadcastPublishingChannel - multiple subscribers receive published event", async () => {
  // Create a unique channel name for isolation.
  const channelName = "test-channel-" + crypto.randomUUID();
  const bc1 = new MockBroadcastChannel(channelName) as BroadcastChannel;
  const bc2 = new MockBroadcastChannel(channelName) as BroadcastChannel;
  const bc3 = new MockBroadcastChannel(channelName) as BroadcastChannel;

  // Create two subscriber instances and one publisher, each with its own source.
  const subscriber1 = createBroadcastPublishingChannel(
    bc1,
    { testContext: "sub1" },
    "sub1",
  );
  const subscriber2 = createBroadcastPublishingChannel(
    bc2,
    { testContext: "sub2" },
    "sub2",
  );
  const publisher = createBroadcastPublishingChannel(
    bc3,
    { testContext: "pub" },
    "pub",
  );

  let callCount1 = 0;
  let callCount2 = 0;

  // Define a test event class.
  class TestEvent {
    data: any;
    constructor(data: any) {
      this.data = data;
    }
  }

  // Each subscriber listens for "TestEvent" (the event name is the class name).
  subscriber1.subscribe("TestEvent", () => {
    callCount1++;
  });
  subscriber2.subscribe("TestEvent", () => {
    callCount2++;
  });

  // Allow subscription messages to propagate.
  await new Promise((resolve) => setTimeout(resolve, 100));

  // Publish an event.
  publisher.publish(new TestEvent({ message: "broadcast" }));

  // Wait for the published event to propagate.
  await new Promise((resolve) => setTimeout(resolve, 100));

  assertEquals(
    callCount1,
    1,
    "Subscriber 1 should have received one event",
  );
  assertEquals(
    callCount2,
    1,
    "Subscriber 2 should have received one event",
  );

  bc1.close();
  bc2.close();
  bc3.close();
});

Deno.test("BroadcastPublishingChannel - unsubscribed channel does not receive published event", async () => {
  // Create a unique channel name for isolation.
  const channelName = "test-channel-" + crypto.randomUUID();
  const bc1 = new MockBroadcastChannel(channelName) as BroadcastChannel;
  const bc2 = new MockBroadcastChannel(channelName) as BroadcastChannel;

  // Create a subscriber and a publisher.
  const subscriber = createBroadcastPublishingChannel(
    bc1,
    { testContext: "sub" },
    "sub",
  );
  const publisher = createBroadcastPublishingChannel(
    bc2,
    { testContext: "pub" },
    "pub",
  );

  let callCount = 0;

  // Define a test event class.
  class TestEvent {
    data: any;
    constructor(data: any) {
      this.data = data;
    }
  }

  const callback = () => {
    callCount++;
  };

  // Subscribe to "TestEvent".
  subscriber.subscribe("TestEvent", callback);

  // Allow subscription to propagate.
  await new Promise((resolve) => setTimeout(resolve, 100));

  // Publish an event; expect the callback to be called.
  publisher.publish(new TestEvent({ message: "hello" }));

  await new Promise((resolve) => setTimeout(resolve, 100));
  assertEquals(callCount, 1, "Expected callback to be called once");

  // Unsubscribe from the event.
  subscriber.unsubscribe("TestEvent", callback);

  // Allow the unsubscribe to propagate.
  await new Promise((resolve) => setTimeout(resolve, 100));

  // Publish another event; this time the callback should not be called.
  publisher.publish(new TestEvent({ message: "should not be received" }));

  await new Promise((resolve) => setTimeout(resolve, 100));
  assertEquals(
    callCount,
    1,
    "Callback should not have been called after unsubscribe",
  );

  bc1.close();
  bc2.close();
});
