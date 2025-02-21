// eventHandler_test.ts
import { assert, assertEquals } from "jsr:@std/assert";
import type {
  DataEvent,
  MessagePortLike,
  StartEvent,
  SubscribeEvent,
  UnsubscribeEvent,
} from "../publishingEvents.type.ts";
import { EventHandler, type EventHandlerOptions } from "./eventHandler.ts";

// A simple FakeMessagePort that implements MessagePortLike for testing.
class FakeMessagePort implements MessagePortLike {
  public messages: any[] = [];
  postMessage(message: any): void {
    this.messages.push(message);
  }
}

Deno.test("subscribe adds port subscription and calls onSubscribe", () => {
  let subscribedNames: string[] = [];
  const options: EventHandlerOptions = {
    onSubscribe: (name: string) => subscribedNames.push(name),
  };

  const handler = new EventHandler({}, options);
  const fakePort = new FakeMessagePort();

  const subEvent: SubscribeEvent = {
    name: "TestEvent",
    type: "subscribe",
    // source optional; omitted for testing.
  };

  handler.subscribe(subEvent, fakePort);
  // Check that the port is subscribed for "TestEvent"
  const portSet = handler.portSubscriptions.get("TestEvent");
  assert(portSet !== undefined, "Port subscription set should exist");
  assertEquals(portSet!.has(fakePort), true, "Fake port should be subscribed");

  // onSubscribe should have been called with "TestEvent"
  assertEquals(subscribedNames, ["TestEvent"]);
});

Deno.test("unsubscribe removes port subscription", () => {
  const handler = new EventHandler({});
  const fakePort = new FakeMessagePort();

  // First, subscribe.
  const subEvent: SubscribeEvent = {
    name: "TestEvent",
    type: "subscribe",
  };
  handler.subscribe(subEvent, fakePort);

  // Now, unsubscribe.
  const unsubEvent: UnsubscribeEvent = {
    name: "TestEvent",
    type: "unsubscribe",
  };
  handler.unsubscribe(unsubEvent, fakePort);

  // Check that the subscription for "TestEvent" is removed.
  const portSet = handler.portSubscriptions.get("TestEvent");
  assertEquals(portSet, undefined, "Port subscription should be removed");
});

Deno.test("data calls registered listeners with event data", () => {
  const handler = new EventHandler({ user: "tester" });
  let receivedData: any = null;
  let receivedContext: any = null;

  // Register a local listener for "TestEvent"
  handler.listeners.set("TestEvent", [
    (data, context) => {
      receivedData = data;
      receivedContext = context;
    },
  ]);

  // Create a data event.
  const dataEvent: DataEvent = {
    name: "TestEvent",
    type: "data",
    data: { message: "hello" },
    // source optional; omitted for testing.
  };

  handler.data(dataEvent);

  // Listener should be called with the parsed data.
  assertEquals(receivedData, { message: "hello" });
  // In your implementation context is currently {}.
  assertEquals(receivedContext, {
    user: "tester",
  });
});

Deno.test("start sends subscribe messages for each local listener", () => {
  const handler = new EventHandler({});
  const fakePort = new FakeMessagePort();

  // Simulate local listener registrations.
  handler.listeners.set("TestEvent", [
    () => {},
  ]);
  handler.listeners.set("AnotherEvent", [
    () => {},
  ]);

  // Call start with a dummy StartEvent.
  const startEvent: StartEvent = {
    type: "start",
    // source optional.
  };

  handler.start(startEvent, fakePort);

  // The fakePort should have received two subscribe messages.
  assertEquals(fakePort.messages.length, 2);
  // Check that the messages contain the correct event names.
  const subscribeNames = fakePort.messages.map((msg) => msg.name).sort();
  assertEquals(subscribeNames, ["AnotherEvent", "TestEvent"]);
});
