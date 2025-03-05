import { assert, assertEquals } from "jsr:@std/assert";
import { assertSpyCalls, spy } from "@std/testing/mock";

import type { MessagePortLike } from "../main.ts";
import { PortChannel, PortChannelOptions } from "./port.channel.ts";
import { Event } from "../eventModel.ts";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// A simple FakeMessagePort that implements MessagePortLike for testing.
class FakeMessagePort implements MessagePortLike {
  public messages: any[] = [];
  public onmessage: ((ev: any) => void) | null = null;
  public onmessageerror: ((ev: MessageEvent) => void) | null = null;

  postMessage(message: any): void {
    this.messages.push(message);
  }
  start(): void {}
}

Deno.test("Port Channel - addPort should add a port and listen to message events", () => {
  const port = new FakeMessagePort();
  const channel = new PortChannel({});
  channel.addPort(port);

  assertEquals(channel.ports.has(port), true);
  assert(port.onmessage !== null, "onmessage should be set");
  assert(port.onmessageerror !== null, "onmessageerror should be set");
});

Deno.test("Port Channel - addPort should send start message to port", () => {
  const port = new FakeMessagePort();
  const channel = new PortChannel({});
  channel.addPort(port);

  assertEquals(port.messages.length, 1);
  assertEquals(port.messages[0].type, "startEvent");
});

Deno.test("Port Channel - addPort should call onConnect if provided", () => {
  const port = new FakeMessagePort();
  const onConnect = spy();
  const channel = new PortChannel({}, { onConnect });
  channel.addPort(port);

  assertSpyCalls(onConnect, 1);
  assertEquals(onConnect.calls[0]?.args, [port]);
});

Deno.test("Port Channel - subscribe adds listeners and publish subscribeEvent", () => {
  const port = new FakeMessagePort();
  const channel = new PortChannel({});
  channel.addPort(port);

  channel.subscribe("TestEvent", () => {});

  assertEquals(channel.listeners.has("TestEvent"), true);
  assertEquals(port.messages.length, 2);
  assertEquals(port.messages[1].type, "subscribeEvent");
  assertEquals(port.messages[1].name, "TestEvent");
});

Deno.test("Port Channel - unsubscribe removes listeners and publish unsubscribeEvent", () => {
  const port = new FakeMessagePort();
  const channel = new PortChannel({});
  channel.addPort(port);

  const callback = () => {};
  channel.subscribe("TestEvent", callback);
  channel.unsubscribe("TestEvent", callback);

  assertEquals(channel.listeners.has("TestEvent"), false);
  assertEquals(port.messages.length, 3);
  assertEquals(port.messages[2].type, "unsubscribeEvent");
  assertEquals(port.messages[2].name, "TestEvent");
});

Deno.test("Port Channel - should send subscribeEvent to all connected ports when start is received", () => {
  const channel = new PortChannel({});
  const fakePort = new FakeMessagePort();
  channel.addPort(fakePort);

  channel.subscribe("TestEvent", () => {});
  channel.subscribe("TestEvent2", () => {});

  fakePort.onmessage?.({
    data: { type: "startEvent" },
    currentTarget: fakePort,
  });

  assertEquals(fakePort.messages.length, 4);
  assertEquals(fakePort.messages[0].type, "startEvent");
  assertEquals(fakePort.messages[1].type, "subscribeEvent");
  assertEquals(fakePort.messages[1].name, "TestEvent");
  assertEquals(fakePort.messages[2].type, "subscribeEvent");
  assertEquals(fakePort.messages[2].name, "TestEvent2");
  assertEquals(fakePort.messages[3].type, "subscribeEvent");
  assertEquals(fakePort.messages[3].name, ["TestEvent", "TestEvent2"]);
});

Deno.test("Port Channel - unsubscribe should do nothing if no listeners", () => {
  const port = new FakeMessagePort();
  const channel = new PortChannel({});
  channel.addPort(port);

  channel.unsubscribe("TestEvent", () => {});

  assertEquals(port.messages.length, 1);
});

Deno.test("Port Channel - publish should send dataEvent to all subscribed ports", () => {
  const channel = new PortChannel({});
  const fakePort = new FakeMessagePort();
  channel.addPort(fakePort);

  class TestEvent extends Event<string> {
  }

  fakePort.onmessage?.({
    data: { type: "subscribeEvent", name: "TestEvent" },
    currentTarget: fakePort,
  });

  const event = new TestEvent("Hello");

  channel.publish(TestEvent.name, event.data);

  assertEquals(fakePort.messages.length, 2);
  assertEquals(fakePort.messages[1].type, "dataEvent");
  assertEquals(fakePort.messages[1].name, "TestEvent");
});

Deno.test("Port Channel - should delete port on message error", () => {
  const port = new FakeMessagePort();
  const channel = new PortChannel({});
  channel.addPort(port);

  port.onmessageerror?.({
    currentTarget: port,
  } as any);

  assertEquals(channel.ports.has(port), false);
});

Deno.test("Port Channel - should call options.onStart when receives a start message", () => {
  const port = new FakeMessagePort();
  const onStart = spy();
  const channel = new PortChannel({}, { onStart });
  channel.addPort(port);

  port.onmessage?.({ data: { type: "startEvent" }, currentTarget: port });

  assertSpyCalls(onStart, 1);
  assertEquals(onStart.calls[0]?.args, [port]);
});

Deno.test("Port Channel - subscribeEvent should add port subscription", () => {
  const port = new FakeMessagePort();
  const channel = new PortChannel({});
  channel.addPort(port);

  port.onmessage?.({
    data: { type: "subscribeEvent", name: "TestEvent" },
    currentTarget: port,
  });

  assertEquals(channel.portSubscriptions.has("TestEvent"), true);
  assertEquals(channel.portSubscriptions.get("TestEvent")?.has(port), true);
});

Deno.test("Port Channel - subscribeEvent should add port subscription for multiple event names", () => {
  const port = new FakeMessagePort();
  const channel = new PortChannel({});
  channel.addPort(port);

  port.onmessage?.({
    data: { type: "subscribeEvent", name: ["TestEvent", "TestEvent2"] },
    currentTarget: port,
  });

  assertEquals(channel.portSubscriptions.has("TestEvent"), true);
  assertEquals(channel.portSubscriptions.get("TestEvent")?.has(port), true);
  assertEquals(channel.portSubscriptions.has("TestEvent2"), true);
  assertEquals(channel.portSubscriptions.get("TestEvent2")?.has(port), true);
});

Deno.test("Port Channel - unsubscribeEvent should remove port subscription", () => {
  const port = new FakeMessagePort();
  const channel = new PortChannel({});
  channel.addPort(port);

  port.onmessage?.({
    data: { type: "subscribeEvent", name: "TestEvent" },
    currentTarget: port,
  });

  port.onmessage?.({
    data: { type: "unsubscribeEvent", name: "TestEvent" },
    currentTarget: port,
  });

  assertEquals(channel.portSubscriptions.has("TestEvent"), false);
});

Deno.test("Port Channel - unsubscribeEvent should remove port subscription for multiple event names", () => {
  const port = new FakeMessagePort();
  const channel = new PortChannel({});
  channel.addPort(port);

  port.onmessage?.({
    data: { type: "subscribeEvent", name: ["TestEvent", "TestEvent2"] },
    currentTarget: port,
  });

  port.onmessage?.({
    data: { type: "unsubscribeEvent", name: ["TestEvent", "TestEvent2"] },
    currentTarget: port,
  });

  assertEquals(channel.portSubscriptions.has("TestEvent"), false);
  assertEquals(channel.portSubscriptions.has("TestEvent2"), false);
});

Deno.test("Port Channel - remove port with removePort call", () => {
  const port = new FakeMessagePort();
  const channel = new PortChannel({});
  channel.addPort(port);

  channel.removePort(port);

  assertEquals(channel.ports.has(port), false);
});

Deno.test("Port Channel - emits internal PortChannelEvents", () => {
  const port = new FakeMessagePort();
  const channel = new PortChannel({});

  {
    const onConnect = spy();
    channel.on("connectEvent", onConnect);
    channel.addPort(port);
    assertSpyCalls(onConnect, 1);
  }

  {
    const onStart = spy();
    channel.on("startEvent", onStart);
    port.onmessage?.({ data: { type: "startEvent" }, currentTarget: port });
    assertSpyCalls(onStart, 1);
  }

  {
    const onSubscribe = spy();
    channel.on("subscribeEvent", onSubscribe);
    port.onmessage?.({
      data: { type: "subscribeEvent", name: "TestEvent" },
      currentTarget: port,
    });
    assertSpyCalls(onSubscribe, 1);
  }

  {
    const onUnsubscribe = spy();
    channel.on("unsubscribeEvent", onUnsubscribe);
    port.onmessage?.({
      data: { type: "unsubscribeEvent", name: "TestEvent" },
      currentTarget: port,
    });
    assertSpyCalls(onUnsubscribe, 1);
  }

  {
    const onData = spy();
    channel.on("dataEvent", onData);
    port.onmessage?.({
      data: { type: "dataEvent", name: "TestEvent" },
      currentTarget: port,
    });
    assertSpyCalls(onData, 1);
  }

  {
    const onDisconnect = spy();
    channel.on("disconnectEvent", onDisconnect);
    channel.removePort(port);
    assertSpyCalls(onDisconnect, 1);
  }
});

Deno.test("Port Channel Buffer - buffered events are flushed when a port subscribes", async () => {
  const options: PortChannelOptions = { bufferTimeout: 2000 };
  const channel = new PortChannel({}, options);
  // Publish an event with no subscribers.
  channel.publish("TestEvent", "Hello");

  // Create a FakeMessagePort and add it to the channel.
  const port = new FakeMessagePort();
  channel.addPort(port);

  // Now subscribe to the event. This should trigger a subscribeEvent which in turn calls addPortSubscription,
  // flushing any buffered events for "TestEvent" to the port.
  port.onmessage?.({
    data: { type: "subscribeEvent", name: "TestEvent" },
    currentTarget: port,
  });

  // Allow some time for the buffered events to be flushed.
  await delay(100);

  // The port should now have received the buffered dataEvent.
  // The first message is the "startEvent" from addPort.
  // The subsequent messages should include a subscribeEvent (from subscribe) and then the flushed buffered event.
  assert(port.messages.length >= 2, "Port should have received buffered event");
  const flushed = port.messages.find((msg: any) =>
    msg.type === "dataEvent" && msg.name === "TestEvent"
  );
  assert(flushed, "Buffered event should have been flushed to the port");
  assertEquals(JSON.parse(flushed.data), "Hello");
});

Deno.test("Port Channel Buffer - buffered events are removed after timeout", async () => {
  const options: PortChannelOptions = { bufferTimeout: 100 };
  const channel = new PortChannel({}, options);
  // Publish an event with no subscribers.
  channel.publish("TestEvent", "Hello Timeout");

  // Wait for longer than the buffer timeout.
  await delay(150);

  // Verify that the buffer for "TestEvent" has been cleared.
  const buffered = (channel as any).bufferedEvents.get("TestEvent");
  assertEquals(
    buffered,
    undefined,
    "Buffered events should be cleared after timeout",
  );
});
