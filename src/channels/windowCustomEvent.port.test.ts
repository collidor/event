import { assert, assertEquals } from "@std/assert";
import { assertSpyCalls, spy } from "@std/testing/mock";
import { EventBus } from "../eventBus.ts";
import { Event } from "../eventModel.ts";
import { PortChannel } from "./port.channel.ts";
import {
  createWindowCustomEventMessageChannel,
  WindowCustomEventMessageChannel,
  WindowCustomEventPort,
} from "./windowCustomEvent.port.ts";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class TestEvent extends Event<string> {}
class NumberEvent extends Event<number> {}

Deno.test("WindowCustomEventPort - send and receive messages between two ports", async () => {
  const target = new EventTarget();
  const port1 = new WindowCustomEventPort({ target, eventName: "test-channel" });
  const port2 = new WindowCustomEventPort({ target, eventName: "test-channel" });

  const received1: any[] = [];
  const received2: any[] = [];

  port1.onmessage = (ev) => received1.push(ev.data);
  port2.onmessage = (ev) => received2.push(ev.data);

  port1.postMessage({ hello: "from port1" });
  port2.postMessage({ hello: "from port2" });

  await delay(10);

  assertEquals(received1, [{ hello: "from port2" }]);
  assertEquals(received2, [{ hello: "from port1" }]);

  port1.close();
  port2.close();
});

Deno.test("WindowCustomEventPort - does not receive own messages", async () => {
  const target = new EventTarget();
  const port = new WindowCustomEventPort({ target, eventName: "self-test" });

  const onMessage = spy();
  port.onmessage = onMessage;

  port.postMessage("ping");

  await delay(10);

  assertSpyCalls(onMessage, 0);
  port.close();
});

Deno.test("WindowCustomEventPort - supports addEventListener and removeEventListener", async () => {
  const target = new EventTarget();
  const port1 = new WindowCustomEventPort({ target, eventName: "listener-test" });
  const port2 = new WindowCustomEventPort({ target, eventName: "listener-test" });

  const listener = spy();
  port2.addEventListener("message", listener as EventListener);

  port1.postMessage("hello");
  await delay(10);

  assertSpyCalls(listener, 1);
  const ev = listener.calls[0]?.args[0] as MessageEvent;
  assertEquals(ev.data, "hello");

  port2.removeEventListener("message", listener as EventListener);
  port1.postMessage("world");
  await delay(10);

  assertSpyCalls(listener, 1);

  port1.close();
  port2.close();
});

Deno.test("WindowCustomEventPort - supports custom serializer and parser", async () => {
  const target = new EventTarget();
  const serializer = spy((data: unknown) => JSON.stringify(data));
  const parser = spy((data: unknown) => JSON.parse(data as string));

  const port1 = new WindowCustomEventPort({
    target,
    eventName: "serializer-test",
    serializer,
  });
  const port2 = new WindowCustomEventPort({
    target,
    eventName: "serializer-test",
    parser,
  });

  const received: any[] = [];
  port2.onmessage = (ev) => received.push(ev.data);

  port1.postMessage({ value: 42 });
  await delay(10);

  assertSpyCalls(serializer, 1);
  assertSpyCalls(parser, 1);
  assertEquals(received, [{ value: 42 }]);

  port1.close();
  port2.close();
});

Deno.test("WindowCustomEventPort - dispatches onmessageerror when parser throws", async () => {
  const target = new EventTarget();
  const port1 = new WindowCustomEventPort({ target, eventName: "error-test" });
  const port2 = new WindowCustomEventPort({
    target,
    eventName: "error-test",
    parser: () => {
      throw new Error("Parse error");
    },
  });

  const onError = spy();
  port2.onmessageerror = onError;

  port1.postMessage("invalid json");
  await delay(10);

  assertSpyCalls(onError, 1);

  port1.close();
  port2.close();
});

Deno.test("WindowCustomEventPort - close stops receiving events", async () => {
  const target = new EventTarget();
  const port1 = new WindowCustomEventPort({ target, eventName: "close-test" });
  const port2 = new WindowCustomEventPort({ target, eventName: "close-test" });

  const onMessage = spy();
  port2.onmessage = onMessage;

  port2.close();
  assertEquals(port2.closed, true);

  port1.postMessage("after-close");
  await delay(10);

  assertSpyCalls(onMessage, 0);
  port1.close();
});

Deno.test("WindowCustomEventPort - Symbol.dispose closes the port", () => {
  const target = new EventTarget();
  const port = new WindowCustomEventPort({ target, eventName: "dispose-test" });

  assertEquals(port.closed, false);
  port[Symbol.dispose]();
  assertEquals(port.closed, true);
});

Deno.test("WindowCustomEventMessageChannel - paired point-to-point communication", async () => {
  const target = new EventTarget();
  const channel = new WindowCustomEventMessageChannel({ target, eventName: "paired-test" });

  const received1: any[] = [];
  const received2: any[] = [];

  channel.port1.onmessage = (ev) => received1.push(ev.data);
  channel.port2.onmessage = (ev) => received2.push(ev.data);

  // A third independent port with the same eventName should NOT receive paired messages
  const port3 = new WindowCustomEventPort({ target, eventName: "paired-test" });
  const received3: any[] = [];
  port3.onmessage = (ev) => received3.push(ev.data);

  channel.port1.postMessage("to port2");
  channel.port2.postMessage("to port1");
  port3.postMessage("from outsider");

  await delay(10);

  assertEquals(received1, ["to port1"]);
  assertEquals(received2, ["to port2"]);
  // port3 does not receive messages paired between port1 and port2
  assertEquals(received3, []);

  channel.port1.close();
  channel.port2.close();
  port3.close();
});

Deno.test("createWindowCustomEventMessageChannel factory creates paired channel", () => {
  const target = new EventTarget();
  const channel = createWindowCustomEventMessageChannel({ target });
  assert(channel instanceof WindowCustomEventMessageChannel);
  assert(channel.port1 instanceof WindowCustomEventPort);
  assert(channel.port2 instanceof WindowCustomEventPort);
  channel.port1.close();
  channel.port2.close();
});

Deno.test("WindowCustomEventPort - integrate with PortChannel and EventBus", async () => {
  const target = new EventTarget();
  const port1 = new WindowCustomEventPort({ target, eventName: "eb-test" });
  const port2 = new WindowCustomEventPort({ target, eventName: "eb-test" });

  const channel1 = new PortChannel({ id: "node1", bufferTimeout: 200 });
  const channel2 = new PortChannel({ id: "node2", bufferTimeout: 200 });

  channel1.addPort(port1);
  channel2.addPort(port2);

  const bus1 = new EventBus({ channel: channel1 });
  const bus2 = new EventBus({ channel: channel2 });

  const spyListener = spy();
  bus2.on(TestEvent, spyListener);

  await delay(50);

  bus1.emit(new TestEvent("Hello from bus 1!"));

  await delay(150);

  assertSpyCalls(spyListener, 1);
  assertEquals(spyListener.calls[0]?.args[0], "Hello from bus 1!");

  port1.close();
  port2.close();
});

Deno.test("WindowCustomEventPort - multiple EventBuses over same window target", async () => {
  const target = new EventTarget();
  const port1 = new WindowCustomEventPort({ target, eventName: "multi-bus" });
  const port2 = new WindowCustomEventPort({ target, eventName: "multi-bus" });
  const port3 = new WindowCustomEventPort({ target, eventName: "multi-bus" });

  const channel1 = new PortChannel({ id: "node1", bufferTimeout: 200 });
  const channel2 = new PortChannel({ id: "node2", bufferTimeout: 200 });
  const channel3 = new PortChannel({ id: "node3", bufferTimeout: 200 });

  channel1.addPort(port1);
  channel2.addPort(port2);
  channel3.addPort(port3);

  const bus1 = new EventBus({ channel: channel1 });
  const bus2 = new EventBus({ channel: channel2 });
  const bus3 = new EventBus({ channel: channel3 });

  const spy2 = spy();
  const spy3 = spy();
  bus2.on(NumberEvent, spy2);
  bus3.on(NumberEvent, spy3);

  await delay(50);

  bus1.emit(new NumberEvent(99));

  await delay(150);

  assertSpyCalls(spy2, 1);
  assertEquals(spy2.calls[0]?.args[0], 99);
  assertSpyCalls(spy3, 1);
  assertEquals(spy3.calls[0]?.args[0], 99);

  port1.close();
  port2.close();
  port3.close();
});

Deno.test("WindowCustomEventPort - createBridge attaches port to channel", () => {
  const target = new EventTarget();
  const channel = new PortChannel({ id: "bridge-test" });

  const bridge = WindowCustomEventPort.createBridge(channel, {
    target,
    eventName: "bridge-event",
  });

  assertEquals(channel.ports.has(bridge.port), true);
  bridge.disconnect();
  assertEquals(bridge.port.closed, true);
});
