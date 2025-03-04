import { assertEquals } from "jsr:@std/assert";
import { assertSpyCalls, spy } from "@std/testing/mock";
import { EventBus } from "./eventBus.ts";
import { Event } from "./eventModel.ts";
import type { Channel } from "./types.ts";

// Test event classes
class UserCreated extends Event<string> {}

class OrderPlaced extends Event<number> {}

class VoidEvent extends Event {}

Deno.test("EventBus - should register and trigger event listeners", () => {
  const bus = new EventBus();
  const mockListener = spy();

  bus.on(UserCreated, mockListener);
  bus.emit(new UserCreated("test-user"));

  assertSpyCalls(mockListener, 1);
  assertEquals(mockListener.calls[0]?.args, ["test-user", {}]);
});

Deno.test("EventBus - should remove listeners with off()", () => {
  const bus = new EventBus();
  const mockListener = spy();

  bus.on(UserCreated, mockListener);
  bus.off(UserCreated, mockListener);
  bus.emit(new UserCreated("test-user"));

  assertSpyCalls(mockListener, 0);
});

Deno.test("EventBus - should handle abort signals", () => {
  const bus = new EventBus();
  const mockListener = spy();
  const controller = new AbortController();

  bus.on(UserCreated, mockListener, controller.signal);
  controller.abort();
  bus.emit(new UserCreated("test-user"));

  assertSpyCalls(mockListener, 0);
});

Deno.test("EventBus - should emit events by name", () => {
  const bus = new EventBus();
  const mockListener = spy();

  bus.on(UserCreated, mockListener);
  bus.emitByName("UserCreated", "name-test");

  assertSpyCalls(mockListener, 1);
  assertEquals(mockListener.calls[0]?.args, ["name-test", {}]);
});

Deno.test("EventBus - should integrate with publishing channel", () => {
  const mockChannel = {
    publish: spy(),
    subscribe: spy(),
  };

  const bus = new EventBus({
    channel: mockChannel as unknown as Channel<
      Record<string, any>
    >,
  });
  const mockListener = spy();

  // Test channel registration
  bus.on(UserCreated, mockListener);
  assertSpyCalls(mockChannel.subscribe, 1);

  // Test event publishing
  const event = new UserCreated("channel-test");
  bus.emit(event);
  assertSpyCalls(mockChannel.publish, 1);
  assertEquals(mockChannel.publish.calls[0]?.args, [
    event.constructor.name,
    event.data,
    {},
  ]);
});

Deno.test("EventBus - should handle multiple listeners", () => {
  const bus = new EventBus();
  const listener1 = spy();
  const listener2 = spy();

  bus.on(UserCreated, listener1);
  bus.on(UserCreated, listener2);
  bus.emit(new UserCreated("multi-test"));

  assertSpyCalls(listener1, 1);
  assertSpyCalls(listener2, 1);
});

Deno.test("EventBus - should handle different event types", () => {
  const bus = new EventBus();
  const userListener = spy();
  const orderListener = spy();

  bus.on(UserCreated, userListener);
  bus.on(OrderPlaced, orderListener);

  bus.emit(new UserCreated("user1"));
  bus.emit(new OrderPlaced(42));

  assertSpyCalls(userListener, 1);
  assertSpyCalls(orderListener, 1);
});

Deno.test("EventBus - should ignore unknown events", () => {
  const bus = new EventBus();
  const mockListener = spy();

  bus.on(UserCreated, mockListener);
  bus.emitByName("UnknownEvent", "data");

  assertSpyCalls(mockListener, 0);
});

Deno.test("EventBus - should handle channel-less operation", () => {
  const bus = new EventBus();
  const mockListener = spy();

  bus.on(UserCreated, mockListener);
  bus.emit(new UserCreated("no-channel"));

  assertSpyCalls(mockListener, 1);
  assertEquals(mockListener.calls[0]?.args, ["no-channel", {}]);
});

Deno.test("EventBus - should handle context", () => {
  const context = {
    user: "test-user",
  };
  const bus = new EventBus({ context });
  const mockListener = spy();

  bus.on(UserCreated, mockListener);
  bus.emit(new UserCreated("context-test"));

  assertSpyCalls(mockListener, 1);
  assertEquals(mockListener.calls[0]?.args, ["context-test", context]);
});

Deno.test("EventBus - should handle void events", () => {
  const bus = new EventBus();
  const mockListener = spy();

  bus.on(VoidEvent, mockListener);
  bus.emit(new VoidEvent());

  assertSpyCalls(mockListener, 1);
  assertEquals(mockListener.calls[0]?.args, [undefined, {}]);
});

Deno.test("EventBus - should emit with custom context", () => {
  const bus = new EventBus();
  const mockListener = spy();
  const context = {
    user: "test-user",
  };

  bus.on(UserCreated, mockListener);
  bus.emit(new UserCreated("custom-context"), context);

  assertSpyCalls(mockListener, 1);
  assertEquals(mockListener.calls[0]?.args, ["custom-context", context]);
});

Deno.test("EventBus - should handle multiple events", () => {
  const bus = new EventBus();
  const userListener = spy();

  bus.on([UserCreated, OrderPlaced], userListener);

  bus.emit(new UserCreated("user1"));
  bus.emit(new OrderPlaced(42));

  assertSpyCalls(userListener, 2);
});
