import { assert, assertEquals } from "jsr:@std/assert";
import { assertSpyCalls, spy } from "@std/testing/mock";

import type { MessagePortLike } from "../main.ts";
import { PortChannel } from "./port.channel.ts";
import { Event } from "../eventModel.ts";

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
    source: fakePort,
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
    source: fakePort,
  });

  channel.publish(new TestEvent("Hello"));

  assertEquals(fakePort.messages.length, 2);
  assertEquals(fakePort.messages[1].type, "dataEvent");
  assertEquals(fakePort.messages[1].name, "TestEvent");
});

Deno.test("Port Channel - should delete port on message error", () => {
  const port = new FakeMessagePort();
  const channel = new PortChannel({});
  channel.addPort(port);

  port.onmessageerror?.({
    source: port,
  } as any);

  assertEquals(channel.ports.has(port), false);
});

Deno.test("Port Channel - should call options.onStart when receives a start message", () => {
  const port = new FakeMessagePort();
  const onStart = spy();
  const channel = new PortChannel({}, { onStart });
  channel.addPort(port);

  port.onmessage?.({ data: { type: "startEvent" }, source: port });

  assertSpyCalls(onStart, 1);
  assertEquals(onStart.calls[0]?.args, [port]);
});

Deno.test("Port Channel - subscribeEvent should add port subscription", () => {
  const port = new FakeMessagePort();
  const channel = new PortChannel({});
  channel.addPort(port);

  port.onmessage?.({
    data: { type: "subscribeEvent", name: "TestEvent" },
    source: port,
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
    source: port,
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
    source: port,
  });

  port.onmessage?.({
    data: { type: "unsubscribeEvent", name: "TestEvent" },
    source: port,
  });

  assertEquals(channel.portSubscriptions.has("TestEvent"), false);
});

Deno.test("Port Channel - unsubscribeEvent should remove port subscription for multiple event names", () => {
  const port = new FakeMessagePort();
  const channel = new PortChannel({});
  channel.addPort(port);

  port.onmessage?.({
    data: { type: "subscribeEvent", name: ["TestEvent", "TestEvent2"] },
    source: port,
  });

  port.onmessage?.({
    data: { type: "unsubscribeEvent", name: ["TestEvent", "TestEvent2"] },
    source: port,
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
    port.onmessage?.({ data: { type: "startEvent" }, source: port });
    assertSpyCalls(onStart, 1);
  }

  {
    const onSubscribe = spy();
    channel.on("subscribeEvent", onSubscribe);
    port.onmessage?.({
      data: { type: "subscribeEvent", name: "TestEvent" },
      source: port,
    });
    assertSpyCalls(onSubscribe, 1);
  }

  {
    const onUnsubscribe = spy();
    channel.on("unsubscribeEvent", onUnsubscribe);
    port.onmessage?.({
      data: { type: "unsubscribeEvent", name: "TestEvent" },
      source: port,
    });
    assertSpyCalls(onUnsubscribe, 1);
  }

  {
    const onData = spy();
    channel.on("dataEvent", onData);
    port.onmessage?.({
      data: { type: "dataEvent", name: "TestEvent" },
      source: port,
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
