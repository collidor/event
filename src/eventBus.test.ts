import { assertEquals } from "@std/assert";
import { assertSpyCalls, spy } from "@std/testing/mock";
import { EventBus } from "./eventBus.ts";
import { Event } from "./eventModel.ts";
import type { Channel } from "./types.ts";

// Test event classes
class UserCreated extends Event<string> {}

class OrderPlaced extends Event<number> {}

class VoidEvent extends Event {}

Deno.test("EventBus", async (t) => {
  await t.step("should register and trigger event listeners", () => {
    const bus = new EventBus();
    const mockListener = spy();

    bus.on(UserCreated, mockListener);
    bus.emit(new UserCreated("test-user"));

    assertSpyCalls(mockListener, 1);
    assertEquals(mockListener.calls[0]?.args, ["test-user", {}]);
  });

  await t.step(
    "should remove listeners with on callback return function",
    () => {
      const bus = new EventBus();
      const mockListener = spy();

      const off = bus.on(UserCreated, mockListener);
      off();
      bus.emit(new UserCreated("test-user"));

      assertSpyCalls(mockListener, 0);
    },
  );

  await t.step("should remove listeners with off()", () => {
    const bus = new EventBus();
    const mockListener = spy();

    bus.on(UserCreated, mockListener);
    bus.off(UserCreated, mockListener);
    bus.emit(new UserCreated("test-user"));

    assertSpyCalls(mockListener, 0);
  });

  await t.step("should handle abort signals", () => {
    const bus = new EventBus();
    const mockListener = spy();
    const controller = new AbortController();

    bus.on(UserCreated, mockListener, controller.signal);
    controller.abort();
    bus.emit(new UserCreated("test-user"));

    assertSpyCalls(mockListener, 0);
  });

  await t.step("should emit events by name", () => {
    const bus = new EventBus();
    const mockListener = spy();

    bus.on(UserCreated, mockListener);
    bus.emitByName("UserCreated", "name-test");

    assertSpyCalls(mockListener, 1);
    assertEquals(mockListener.calls[0]?.args, ["name-test", {}]);
  });

  await t.step("should integrate with publishing channel", () => {
    const mockChannel = {
      publish: spy(),
      subscribe: spy(),
    };

    const bus = new EventBus({
      channel: mockChannel as unknown as Channel<Record<string, any>>,
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

  await t.step("should handle multiple listeners", () => {
    const bus = new EventBus();
    const listener1 = spy();
    const listener2 = spy();

    bus.on(UserCreated, listener1);
    bus.on(UserCreated, listener2);
    bus.emit(new UserCreated("multi-test"));

    assertSpyCalls(listener1, 1);
    assertSpyCalls(listener2, 1);
  });

  await t.step("should handle different event types", () => {
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

  await t.step("should ignore unknown events", () => {
    const bus = new EventBus();
    const mockListener = spy();

    bus.on(UserCreated, mockListener);
    bus.emitByName("UnknownEvent", "data");

    assertSpyCalls(mockListener, 0);
  });

  await t.step("should handle channel-less operation", () => {
    const bus = new EventBus();
    const mockListener = spy();

    bus.on(UserCreated, mockListener);
    bus.emit(new UserCreated("no-channel"));

    assertSpyCalls(mockListener, 1);
    assertEquals(mockListener.calls[0]?.args, ["no-channel", {}]);
  });

  await t.step("should handle context", () => {
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

  await t.step("should handle void events", () => {
    const bus = new EventBus();
    const mockListener = spy();

    bus.on(VoidEvent, mockListener);
    bus.emit(new VoidEvent());

    assertSpyCalls(mockListener, 1);
    assertEquals(mockListener.calls[0]?.args, [undefined, {}]);
  });

  await t.step("should emit with custom context", () => {
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

  await t.step("should handle multiple events", () => {
    const bus = new EventBus();
    const userListener = spy();

    bus.on([UserCreated, OrderPlaced], userListener);

    bus.emit(new UserCreated("user1"));
    bus.emit(new OrderPlaced(42));

    assertSpyCalls(userListener, 2);
  });

  await t.step("can receive array as off argument", () => {
    const bus = new EventBus();
    const userListener = spy();

    bus.on([UserCreated, OrderPlaced], userListener);

    bus.off([UserCreated, OrderPlaced], userListener);

    bus.emit(new UserCreated("user1"));
    bus.emit(new OrderPlaced(42));

    assertSpyCalls(userListener, 0);
  });

  await t.step("can receive an unsubscribed event as off", () => {
    const bus = new EventBus();
    const userListener = spy();

    bus.off([UserCreated, OrderPlaced], userListener);

    bus.emit(new OrderPlaced(42));

    assertSpyCalls(userListener, 0);
  });

  await t.step("calls channel.unsubscribe on off", () => {
    const unsubscribeSpy = spy();
    const bus = new EventBus({
      channel: {
        publish: spy(),
        subscribe: spy(),
        unsubscribe: unsubscribeSpy,
      } as Channel,
    });
    const userListener = spy();

    bus.on([UserCreated, OrderPlaced], userListener);
    bus.off([UserCreated, OrderPlaced], userListener);

    bus.emit(new OrderPlaced(42));

    assertSpyCalls(userListener, 0);
    assertSpyCalls(unsubscribeSpy, 2);
  });
});
