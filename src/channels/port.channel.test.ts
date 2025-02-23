import { assert, assertEquals } from "jsr:@std/assert";
import { assertSpyCalls, spy } from "@std/testing/mock";

import type { MessagePortLike } from "../main.ts";
import { PortChannel } from "./port.channel.ts";

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
