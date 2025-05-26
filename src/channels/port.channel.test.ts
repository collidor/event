import { assert, assertEquals } from "@std/assert";
import { assertSpyCalls, spy } from "@std/testing/mock";

import { EventBus, type MessagePortLike } from "../main.ts";
import { PortChannel, type PortChannelOptions } from "./port.channel.ts";
import { Event } from "../eventModel.ts";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// A simple FakeMessagePort that implements MessagePortLike for testing.
class FakeMessagePort implements MessagePortLike {
  public messages: any[] = [];
  public onmessage: ((ev: any) => void) | null = null;
  public onmessageerror: ((ev: MessageEvent) => void) | null = null;

  constructor(public name = "FakeMessagePort") {}

  postMessage(message: any): void {
    this.messages.push(
      typeof message === "string" ? JSON.parse(message) : message,
    );
  }
  start(): void {}
}

Deno.test(
  "PortChannel - addPort should add a port and listen to message events",
  () => {
    const port = new FakeMessagePort();
    using channel = new PortChannel({});
    channel.addPort(port);

    assertEquals(channel.ports.has(port), true);
    assert(port.onmessage !== null, "onmessage should be set");
    assert(port.onmessageerror !== null, "onmessageerror should be set");
  },
);

Deno.test("PortChannel - addPort should send start message to port", () => {
  const port = new FakeMessagePort();
  using channel = new PortChannel({});
  channel.addPort(port);

  assertEquals(port.messages.length, 1);
  assertEquals(port.messages[0].type, "startEvent");
});

Deno.test("PortChannel - addPort should call onConnect if provided", () => {
  const port = new FakeMessagePort();
  const onConnect = spy();
  using channel = new PortChannel({ onConnect });
  channel.addPort(port);

  assertSpyCalls(onConnect, 1);
  assertEquals(onConnect.calls[0]?.args, [port, channel.id]);
});

Deno.test(
  "PortChannel - subscribe adds listeners and publish subscribeEvent",
  () => {
    const port = new FakeMessagePort();
    using channel = new PortChannel({});
    channel.addPort(port);

    channel.subscribe("TestEvent", () => {});

    assertEquals(channel.listeners.has("TestEvent"), true);
    assertEquals(port.messages.length, 2);
    assertEquals(port.messages[1].type, "subscribeEvent");
    assertEquals(port.messages[1].name, "TestEvent");
  },
);

Deno.test(
  "PortChannel - unsubscribe removes listeners and publish unsubscribeEvent",
  () => {
    const port = new FakeMessagePort();
    using channel = new PortChannel({});
    channel.addPort(port);

    const callback = () => {};
    channel.subscribe("TestEvent", callback);
    channel.unsubscribe("TestEvent", callback);

    assertEquals(channel.listeners.has("TestEvent"), false);
    assertEquals(port.messages.length, 3);
    assertEquals(port.messages[2].type, "unsubscribeEvent");
    assertEquals(port.messages[2].name, "TestEvent");
  },
);

Deno.test(
  "PortChannel - should send subscribeEvent to all connected ports when start is received",
  () => {
    using channel = new PortChannel({});
    const fakePort = new FakeMessagePort();
    channel.addPort(fakePort);

    channel.subscribe("TestEvent", () => {});
    channel.subscribe("TestEvent2", () => {});

    fakePort.onmessage?.({
      data: JSON.stringify({ type: "startEvent", source: crypto.randomUUID() }),
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
  },
);

Deno.test(
  "PortChannel - unsubscribe should do nothing if no listeners",
  () => {
    const port = new FakeMessagePort();
    using channel = new PortChannel({});
    channel.addPort(port);

    channel.unsubscribe("TestEvent", () => {});

    assertEquals(port.messages.length, 1);
  },
);

Deno.test(
  "PortChannel - publish should send dataEvent to all subscribed ports",
  () => {
    using channel = new PortChannel({});
    const fakePort = new FakeMessagePort();
    channel.addPort(fakePort);

    class TestEvent extends Event<string> {}

    fakePort.onmessage?.({
      data: JSON.stringify({
        type: "subscribeEvent",
        name: "TestEvent",
        source: crypto.randomUUID(),
      }),
      currentTarget: fakePort,
    });

    const event = new TestEvent("Hello");

    channel.publish(TestEvent.name, event.data);

    assertEquals(fakePort.messages.length, 2);
    assertEquals(fakePort.messages[1].type, "dataEvent");
    assertEquals(fakePort.messages[1].name, "TestEvent");
  },
);

Deno.test("PortChannel - should delete port on message error", () => {
  const port = new FakeMessagePort();
  using channel = new PortChannel({});
  channel.addPort(port);

  port.onmessageerror?.({
    currentTarget: port,
  } as any);

  assertEquals(channel.ports.has(port), false);
});

Deno.test(
  "PortChannel - should call options.onStart when receives a start message",
  () => {
    const port = new FakeMessagePort();
    const onStart = spy();
    using channel = new PortChannel({ onStart });
    channel.addPort(port);

    const source = crypto.randomUUID();
    port.onmessage?.({
      data: JSON.stringify({ type: "startEvent", source }),
      currentTarget: port,
    });

    assertSpyCalls(onStart, 1);
    assertEquals(onStart.calls[0]?.args, [port, source]);
  },
);

Deno.test("PortChannel - subscribeEvent should add port subscription", () => {
  const port = new FakeMessagePort();
  using channel = new PortChannel({});
  channel.addPort(port);

  const source = crypto.randomUUID();
  port.onmessage?.({
    data: JSON.stringify({ type: "subscribeEvent", name: "TestEvent", source }),
    currentTarget: port,
  });

  assertEquals(channel.portSubscriptions.has("TestEvent"), true);
  assertEquals(channel.portSubscriptions.get("TestEvent")?.has(port), true);
});

Deno.test(
  "PortChannel - subscribeEvent should add port subscription for multiple event names",
  () => {
    const port = new FakeMessagePort();
    using channel = new PortChannel({});
    channel.addPort(port);

    const source = crypto.randomUUID();
    port.onmessage?.({
      data: JSON.stringify({
        type: "subscribeEvent",
        name: ["TestEvent", "TestEvent2"],
        source,
      }),
      currentTarget: port,
    });

    assertEquals(channel.portSubscriptions.get("TestEvent")?.has(port), true);
    assertEquals(channel.portSubscriptions.get("TestEvent2")?.has(port), true);

    // event -> source
    assertEquals(
      channel.sourceSubscriptions.get("TestEvent")?.has(source),
      true,
    );
    assertEquals(
      channel.sourceSubscriptions.get("TestEvent2")?.has(source),
      true,
    );

    // port -> source
    assertEquals(channel.portIds.get(port)?.has(source), true);

    // source -> port
    assertEquals(channel.idPorts.get(source)?.has(port), true);
  },
);

Deno.test(
  "PortChannel - unsubscribeEvent should remove port subscription",
  () => {
    const port = new FakeMessagePort();
    using channel = new PortChannel({});
    channel.addPort(port);

    const source = crypto.randomUUID();

    port.onmessage?.({
      data: JSON.stringify({
        type: "subscribeEvent",
        name: "TestEvent",
        source,
      }),
      currentTarget: port,
    });

    port.onmessage?.({
      data: JSON.stringify({
        type: "unsubscribeEvent",
        name: "TestEvent",
        source,
      }),
      currentTarget: port,
    });

    assertEquals(
      channel.portSubscriptions.has("TestEvent"),
      false,
      'channel.portSubscriptions.has("TestEvent")',
    );
    assertEquals(
      channel.idPorts.has(source),
      false,
      "channel.idPorts.has(source)",
    );
    assertEquals(channel.portIds.has(port), false, "channel.portIds.has(port)");
    assertEquals(
      channel.sourceSubscriptions.has("TestEvent"),
      false,
      'channel.sourceSubscriptions.has("TestEvent")',
    );
  },
);

Deno.test(
  "PortChannel - unsubscribeEvent should remove port subscription for multiple event names",
  () => {
    const port = new FakeMessagePort();
    using channel = new PortChannel({});
    channel.addPort(port);

    const source = crypto.randomUUID();
    port.onmessage?.({
      data: JSON.stringify({
        type: "subscribeEvent",
        name: ["TestEvent", "TestEvent2"],
        source,
      }),
      currentTarget: port,
    });

    port.onmessage?.({
      data: JSON.stringify({
        type: "unsubscribeEvent",
        name: ["TestEvent", "TestEvent2"],
        source,
      }),
      currentTarget: port,
    });

    assertEquals(channel.portSubscriptions.has("TestEvent"), false);
    assertEquals(channel.portSubscriptions.has("TestEvent2"), false);
  },
);

Deno.test("PortChannel - remove port with removePort call", () => {
  const port = new FakeMessagePort();
  using channel = new PortChannel({});
  channel.addPort(port);

  channel.removePort(port);

  assertEquals(channel.ports.has(port), false);
});

Deno.test("PortChannel - emits internal PortChannelEvents", () => {
  const port = new FakeMessagePort();
  using channel = new PortChannel({});
  const source = crypto.randomUUID();
  {
    const onConnect = spy();
    channel.on("connectEvent", onConnect);
    channel.addPort(port);
    assertSpyCalls(onConnect, 1);
    assertEquals(channel["eventBus"]["listeners"]["connectEvent"]?.size, 1);

    channel.off("connectEvent", onConnect);

    assertEquals(channel["eventBus"]["listeners"]["connectEvent"]?.size, 0);
  }

  {
    const onStart = spy();
    channel.on("startEvent", onStart);
    port.onmessage?.({
      data: JSON.stringify({ type: "startEvent", source }),
      currentTarget: port,
    });
    assertSpyCalls(onStart, 1);
  }

  {
    const onSubscribe = spy();
    channel.on("subscribeEvent", onSubscribe);
    port.onmessage?.({
      data: JSON.stringify({
        type: "subscribeEvent",
        name: "TestEvent",
        source,
      }),
      currentTarget: port,
    });
    assertSpyCalls(onSubscribe, 1);
  }

  {
    const onUnsubscribe = spy();
    channel.on("unsubscribeEvent", onUnsubscribe);
    port.onmessage?.({
      data: JSON.stringify({
        type: "unsubscribeEvent",
        name: "TestEvent",
        source,
      }),
      currentTarget: port,
    });
    assertSpyCalls(onUnsubscribe, 1);
  }

  {
    const onData = spy();
    channel.on("dataEvent", onData);
    port.onmessage?.({
      data: JSON.stringify({ type: "dataEvent", name: "TestEvent", source }),
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

Deno.test(
  "PortChannel Buffer - buffered events are flushed when a port subscribes",
  async () => {
    const options: PortChannelOptions = { bufferTimeout: 2000 };
    using channel = new PortChannel(options);
    // Publish an event with no subscribers.
    channel.publish("TestEvent", "Hello");

    // Create a FakeMessagePort and add it to the channel.
    const port = new FakeMessagePort();
    channel.addPort(port);
    const source = crypto.randomUUID();

    // Now subscribe to the event. This should trigger a subscribeEvent which in turn calls addPortSubscription,
    // flushing any buffered events for "TestEvent" to the port.
    port.onmessage?.({
      data: JSON.stringify({
        type: "subscribeEvent",
        name: "TestEvent",
        source,
      }),
      currentTarget: port,
    });

    // Allow some time for the buffered events to be flushed.
    await delay(100);

    // The port should now have received the buffered dataEvent.
    // The first message is the "startEvent" from addPort.
    // The subsequent messages should include a subscribeEvent (from subscribe) and then the flushed buffered event.
    assert(
      port.messages.length >= 2,
      "Port should have received buffered event",
    );
    const flushed = port.messages.find(
      (msg: any) => msg.type === "dataEvent" && msg.name === "TestEvent",
    );
    assert(flushed, "Buffered event should have been flushed to the port");
    assertEquals(flushed.data, "Hello");
  },
);

Deno.test(
  "PortChannel Buffer - buffered events are removed after timeout",
  async () => {
    const options: PortChannelOptions = { bufferTimeout: 100 };
    const channel = new PortChannel(options);
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
  },
);

function connectPorts(...ports: FakeMessagePort[]) {
  for (const port of ports) {
    port.postMessage = function (this: FakeMessagePort, message: any) {
      this.messages.push(
        typeof message === "string" ? JSON.parse(message) : message,
      );

      for (const p of ports) {
        if (p === port) continue;
        p.onmessage?.({ data: message, currentTarget: p });
      }
    };
  }

  return ports;
}

class TestEvent extends Event<string> {}

Deno.test(
  "PortChannel - should send event from one end to the other",
  async () => {
    const options: PortChannelOptions = { bufferTimeout: 100 };
    using channel1 = new PortChannel(options);
    using channel2 = new PortChannel(options);

    const port1 = new FakeMessagePort();
    const port2 = new FakeMessagePort();

    connectPorts(port1, port2);

    channel1.addPort(port1);
    channel2.addPort(port2);

    const eventBus1 = new EventBus({
      channel: channel1,
    });

    const eventBus2 = new EventBus({
      channel: channel2,
    });

    const testEventSpy = spy();
    eventBus2.on(TestEvent, testEventSpy);

    eventBus1.emit(new TestEvent("hello there"));

    await delay(150);

    assertEquals(testEventSpy.calls[0]?.args[0], "hello there");
  },
);

Deno.test(
  "PortChannel - should send event with single consumer to listener",
  async () => {
    using channel1 = new PortChannel({ bufferTimeout: 100, id: "1" });
    using channel2 = new PortChannel({ bufferTimeout: 100, id: "2" });

    const port1 = new FakeMessagePort("1");
    const port2 = new FakeMessagePort("2");

    connectPorts(port1, port2);

    channel1.addPort(port1);
    channel2.addPort(port2);

    const eventBus2 = new EventBus({
      channel: channel2,
    });

    const testEventSpy = spy();
    eventBus2.on(TestEvent, testEventSpy);

    channel1.publish("TestEvent", "hello there", {
      singleConsumer: true,
    });

    await delay(150);

    assertEquals(testEventSpy.calls[0]?.args[0], "hello there");
  },
);

Deno.test("PortChannel - should send event for all consumers", async () => {
  using channel1 = new PortChannel({ bufferTimeout: 100, id: "1" });
  using channel2 = new PortChannel({ bufferTimeout: 100, id: "2" });
  using channel3 = new PortChannel({ bufferTimeout: 100, id: "3" });

  const port1 = new FakeMessagePort("1");
  const port2 = new FakeMessagePort("2");
  const port3 = new FakeMessagePort("3");

  connectPorts(port1, port2, port3);

  channel1.addPort(port1);
  channel2.addPort(port2);
  channel3.addPort(port3);

  const eventBus2 = new EventBus({
    channel: channel2,
  });

  const eventBus3 = new EventBus({
    channel: channel3,
  });

  const testEventSpy = spy();
  eventBus2.on(TestEvent, testEventSpy);
  eventBus3.on(TestEvent, testEventSpy);

  channel1.publish("TestEvent", "hello there");

  await delay(150);

  assertEquals(testEventSpy.calls.length, 2);
});

Deno.test("PortChannel - should send event for single consumer", async () => {
  using channel1 = new PortChannel({ bufferTimeout: 100, id: "1" });
  using channel2 = new PortChannel({ bufferTimeout: 100, id: "2" });
  using channel3 = new PortChannel({ bufferTimeout: 100, id: "3" });

  const port1 = new FakeMessagePort("1");
  const port2 = new FakeMessagePort("2");
  const port3 = new FakeMessagePort("3");

  connectPorts(port1, port2, port3);

  channel1.addPort(port1);
  channel2.addPort(port2);
  channel3.addPort(port3);

  const eventBus2 = new EventBus({
    channel: channel2,
  });

  const eventBus3 = new EventBus({
    channel: channel3,
  });

  const testEventSpy2 = spy();
  const testEventSpy3 = spy();
  eventBus2.on(TestEvent, testEventSpy2);
  eventBus3.on(TestEvent, testEventSpy3);

  channel1.publish("TestEvent", "hello there", {
    singleConsumer: true,
  });

  await delay(150);

  assertEquals(testEventSpy2.calls.length, 1);
  assertEquals(testEventSpy3.calls.length, 0);

  channel1.publish("TestEvent", "hello there", {
    singleConsumer: true,
  });

  await delay(150);

  assertEquals(testEventSpy2.calls.length, 1);
  assertEquals(testEventSpy3.calls.length, 1);

  channel1.publish("TestEvent", "hello there", {
    singleConsumer: true,
  });

  await delay(150);

  assertEquals(testEventSpy2.calls.length, 2);
  assertEquals(testEventSpy3.calls.length, 1);
});

Deno.test(
  "PortChannel - should send event for targeted consumer",
  async () => {
    using channel1 = new PortChannel({ bufferTimeout: 100, id: "1" });
    using channel2 = new PortChannel({ bufferTimeout: 100, id: "2" });
    using channel3 = new PortChannel({ bufferTimeout: 100, id: "3" });

    const port1 = new FakeMessagePort("1");
    const port2 = new FakeMessagePort("2");
    const port3 = new FakeMessagePort("3");

    connectPorts(port1, port2, port3);

    channel1.addPort(port1);
    channel2.addPort(port2);
    channel3.addPort(port3);

    const eventBus2 = new EventBus({
      channel: channel2,
    });

    const eventBus3 = new EventBus({
      channel: channel3,
    });

    const testEventSpy2 = spy();
    const testEventSpy3 = spy();
    eventBus2.on(TestEvent, testEventSpy2);
    eventBus3.on(TestEvent, testEventSpy3);

    channel1.publish("TestEvent", "hello there", {
      singleConsumer: true,
      target: "3",
    });

    await delay(150);

    assertEquals(testEventSpy2.calls.length, 0);
    assertEquals(testEventSpy3.calls.length, 1);

    channel1.publish("TestEvent", "hello there", {
      singleConsumer: true,
      target: "3",
    });

    await delay(150);

    assertEquals(testEventSpy2.calls.length, 0);
    assertEquals(testEventSpy3.calls.length, 2);

    channel1.publish("TestEvent", "hello there", {
      singleConsumer: true,
    });

    await delay(150);

    assertEquals(testEventSpy2.calls.length, 1);
    assertEquals(testEventSpy3.calls.length, 2);
  },
);

Deno.test("PortChannel - default serializer should ignore undefined values", async () => {
  using channel1 = new PortChannel({ bufferTimeout: 100, id: "1" });
  using channel2 = new PortChannel({ bufferTimeout: 100, id: "2" });
  using channel3 = new PortChannel({ bufferTimeout: 100, id: "3" });

  const port1 = new FakeMessagePort("1");
  const port2 = new FakeMessagePort("2");
  const port3 = new FakeMessagePort("3");

  connectPorts(port1, port2, port3);

  channel1.addPort(port1);
  channel2.addPort(port2);
  channel3.addPort(port3);

  const eventBus2 = new EventBus({
    channel: channel2,
  });

  const eventBus3 = new EventBus({
    channel: channel3,
  });

  const testEventSpy = spy();
  eventBus2.on(TestEvent, testEventSpy);
  eventBus3.on(TestEvent, testEventSpy);

  channel1.publish("TestEvent", undefined);

  await delay(150);

  assertEquals(testEventSpy.calls.length, 2);
  assertEquals(
    testEventSpy.calls.every((call) => call.args[0] === undefined),
    true,
  );
});

Deno.test("PortChannel - should emit close event on Symbol.dispose call", async () => {
  const port = new FakeMessagePort();

  {
    using channel = new PortChannel();
    channel.addPort(port);
    await delay(100);
  }

  assertEquals(port.messages.at(0).type, "startEvent");
  assertEquals(port.messages.at(1).type, "closeEvent");
});

Deno.test("PortChannel - should accept custom serializer", async () => {
  let receivedData: Uint8Array | undefined;
  const serializer = {
    deserialize(data: Uint8Array) {
      const textDecoder = new TextDecoder();
      receivedData = data;
      return JSON.parse(textDecoder.decode(data));
    },
    serialize(data: any): Uint8Array {
      const textEncoder = new TextEncoder();
      return textEncoder.encode(JSON.stringify(data));
    },
  };
  using channel = new PortChannel({
    context: {},
    serializer,
  });
  using channel2 = new PortChannel({
    context: {},
    serializer,
  });

  const port = new FakeMessagePort();
  const port2 = new FakeMessagePort();

  channel.addPort(port);
  channel2.addPort(port2);

  connectPorts(port, port2);

  const eventBus = new EventBus(
    { channel },
  );

  const eventBus2 = new EventBus(
    { channel: channel2 },
  );

  await delay(50);

  const eventSpy = spy();
  eventBus.on(TestEvent, eventSpy);

  eventBus2.emit(new TestEvent("Hello there"));

  await delay(50);

  assertSpyCalls(eventSpy, 1);
  assertEquals(eventSpy.calls[0]?.args?.[0], "Hello there");
  assertEquals(receivedData?.byteLength, 108);
});

Deno.test("PortChannel - should send aliveEvent to all ports", async () => {
  {
    using channel1 = new PortChannel({ aliveInterval: 50, id: "1" });
    using channel2 = new PortChannel({ aliveInterval: 50, id: "2" });
    const port1 = new FakeMessagePort("port1");
    const port2 = new FakeMessagePort("port2");

    channel1.addPort(port1);
    channel2.addPort(port2);

    connectPorts(port1, port2);

    port1.onmessage?.({
      data: JSON.stringify({ type: "startEvent", source: crypto.randomUUID() }),
      currentTarget: port1,
    });

    port2.onmessage?.({
      data: JSON.stringify({ type: "startEvent", source: crypto.randomUUID() }),
      currentTarget: port2,
    });

    await delay(100);

    assert(port1.messages.some((msg: any) => msg.type === "aliveEvent"));
  }

  await delay(200);
});

Deno.test("PortChannel - should send remove port on alive timeout", async () => {
  {
    const port1 = new FakeMessagePort("port1");
    const onDisconnectSpy = spy();
    using channel1 = new PortChannel({
      aliveInterval: 50,
      id: "1",
      onDisconnect: onDisconnectSpy,
    });
    channel1.addPort(port1);

    {
      using channel2 = new PortChannel({ aliveInterval: 50, id: "2" });
      const port2 = new FakeMessagePort("port2");
      channel2.addPort(port2);

      const ports = connectPorts(port1, port2);
      port1.onmessage?.({
        data: JSON.stringify({
          type: "startEvent",
          source: crypto.randomUUID(),
        }),
        currentTarget: port1,
      });
      port2.onmessage?.({
        data: JSON.stringify({
          type: "startEvent",
          source: crypto.randomUUID(),
        }),
        currentTarget: port2,
      });

      await delay(100);
      assert(port1.messages.some((msg: any) => msg.type === "aliveEvent"));
      assert(port2.messages.some((msg: any) => msg.type === "aliveEvent"));

      clearInterval(channel2["aliveIntervalId"]!);
      if (channel2["aliveTimeout"].get(port2)) {
        clearTimeout(channel2["aliveTimeout"].get(port2)!);
      }
      channel2.ports.delete(port2);
      ports[1] = undefined as any;
      ports.length = 1;
    }

    await delay(500);
    assertSpyCalls(onDisconnectSpy, 1);
  }

  await delay(200);
});
