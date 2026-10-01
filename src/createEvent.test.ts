import { assertEquals, assertInstanceOf, assertThrows } from "@std/assert";
import { assertSpyCalls, spy } from "@std/testing/mock";
import { Event } from "./eventModel.ts";
import { EventBus } from "./eventBus.ts";
import { createEvent } from "./createEvent.ts";
import { PortChannel } from "./channels/port.channel.ts";
import type { Channel } from "./types.ts";

Deno.test("createEvent - Basic Creation and Naming", async (t) => {
  await t.step("should create an event class with explicit name", () => {
    const UserCreated = createEvent<{ id: string; name: string }>(
      "UserCreated",
    );

    assertEquals(UserCreated.name, "UserCreated");

    const event = new UserCreated({ id: "1", name: "Alice" });
    assertEquals(event.constructor.name, "UserCreated");
    assertEquals(event.data, { id: "1", name: "Alice" });
    assertInstanceOf(event, Event);
    assertInstanceOf(event, UserCreated);
  });

  await t.step("should support void payload events without arguments", () => {
    const PingEvent = createEvent<void>("PingEvent");

    assertEquals(PingEvent.name, "PingEvent");

    const event = new PingEvent();
    assertEquals(event.constructor.name, "PingEvent");
    assertEquals(event.data, undefined);
    assertInstanceOf(event, Event);
    assertInstanceOf(event, PingEvent);
  });

  await t.step("should support primitive payloads", () => {
    const CountChanged = createEvent<number>("CountChanged");
    const event = new CountChanged(42);

    assertEquals(event.data, 42);
    assertEquals(event.constructor.name, "CountChanged");
  });

  await t.step("should support default untyped events without arguments", () => {
    const LogoutEvent = createEvent("LogoutEvent");
    const event = new LogoutEvent();

    assertEquals(event.data, undefined);
    assertEquals(event.constructor.name, "LogoutEvent");
    assertInstanceOf(event, Event);
  });

  await t.step("should support any payload events", () => {
    const AnyEvent = createEvent<any>("AnyEvent");
    const e1 = new AnyEvent();
    const e2 = new AnyEvent({ foo: "bar" });

    assertEquals(e1.data, undefined);
    assertEquals(e2.data, { foo: "bar" });
    assertEquals(e1.constructor.name, "AnyEvent");
    assertEquals(e2.constructor.name, "AnyEvent");
  });
});

Deno.test("createEvent - Name Validation", async (t) => {
  await t.step("should throw TypeError for empty or whitespace name", () => {
    assertThrows(
      () => createEvent(""),
      TypeError,
      "Event name must be a non-empty string",
    );
    assertThrows(
      () => createEvent("   "),
      TypeError,
      "Event name must be a non-empty string",
    );
  });

  await t.step("should throw TypeError for non-string names", () => {
    assertThrows(
      () => createEvent(null as any),
      TypeError,
      "Event name must be a non-empty string",
    );
    assertThrows(
      () => createEvent(undefined as any),
      TypeError,
      "Event name must be a non-empty string",
    );
    assertThrows(
      () => createEvent(123 as any),
      TypeError,
      "Event name must be a non-empty string",
    );
  });
});

Deno.test("createEvent - Bundler Minification Resilience", async (t) => {
  await t.step(
    "should preserve class name even if variable name is mangled",
    () => {
      // Simulating a bundler renaming variable `UserLoginEvent` to `a`
      const a = createEvent<{ user: string }>("UserLoginEvent");

      assertEquals(a.name, "UserLoginEvent");

      const instance = new a({ user: "admin" });
      assertEquals(instance.constructor.name, "UserLoginEvent");
    },
  );
});

Deno.test("createEvent - EventBus Integration", async (t) => {
  const UserLoggedIn = createEvent<{ username: string }>("UserLoggedIn");
  const SessionExpired = createEvent<void>("SessionExpired");

  await t.step("should subscribe and receive emitted typed event", () => {
    const bus = new EventBus();
    const listener = spy();

    bus.on(UserLoggedIn, listener);
    bus.emit(new UserLoggedIn({ username: "alice" }));

    assertSpyCalls(listener, 1);
    assertEquals(listener.calls[0]?.args, [{ username: "alice" }, {}]);
  });

  await t.step("should subscribe and receive emitted void event", () => {
    const bus = new EventBus();
    const listener = spy();

    bus.on(SessionExpired, listener);
    bus.emit(new SessionExpired());

    assertSpyCalls(listener, 1);
    assertEquals(listener.calls[0]?.args, [undefined, {}]);
  });

  await t.step("should support unsubscription via returned function", () => {
    const bus = new EventBus();
    const listener = spy();

    const unsubscribe = bus.on(UserLoggedIn, listener);
    unsubscribe();

    bus.emit(new UserLoggedIn({ username: "bob" }));
    assertSpyCalls(listener, 0);
  });

  await t.step("should support unsubscription via bus.off()", () => {
    const bus = new EventBus();
    const listener = spy();

    bus.on(UserLoggedIn, listener);
    bus.off(UserLoggedIn, listener);

    bus.emit(new UserLoggedIn({ username: "bob" }));
    assertSpyCalls(listener, 0);
  });

  await t.step("should handle abort signal unsubscription", () => {
    const bus = new EventBus();
    const listener = spy();
    const controller = new AbortController();

    bus.on(UserLoggedIn, listener, controller.signal);
    controller.abort();

    bus.emit(new UserLoggedIn({ username: "carol" }));
    assertSpyCalls(listener, 0);
  });

  await t.step("should emit by name matching createEvent name", () => {
    const bus = new EventBus();
    const listener = spy();

    bus.on(UserLoggedIn, listener);
    bus.emitByName("UserLoggedIn", { username: "dave" });

    assertSpyCalls(listener, 1);
    assertEquals(listener.calls[0]?.args, [{ username: "dave" }, {}]);
  });

  await t.step("should support listening to multiple createEvent classes", () => {
    const bus = new EventBus();
    const listener = spy();

    bus.on([UserLoggedIn, SessionExpired], listener);

    bus.emit(new UserLoggedIn({ username: "eve" }));
    bus.emit(new SessionExpired());

    assertSpyCalls(listener, 2);
    assertEquals(listener.calls[0]?.args, [{ username: "eve" }, {}]);
    assertEquals(listener.calls[1]?.args, [undefined, {}]);
  });

  await t.step("should integrate with channel for publish and subscribe", () => {
    const mockChannel = {
      publish: spy(),
      subscribe: spy(),
    };

    const bus = new EventBus({
      channel: mockChannel as unknown as Channel<Record<string, any>>,
    });
    const listener = spy();

    bus.on(UserLoggedIn, listener);
    assertSpyCalls(mockChannel.subscribe, 1);
    assertEquals(mockChannel.subscribe.calls[0]?.args[0], "UserLoggedIn");

    const event = new UserLoggedIn({ username: "frank" });
    bus.emit(event);
    assertSpyCalls(mockChannel.publish, 1);
    assertEquals(mockChannel.publish.calls[0]?.args, [
      "UserLoggedIn",
      { username: "frank" },
      {},
    ]);
  });
});

Deno.test("createEvent - PortChannel Cross-Context Integration", async (t) => {
  const NotificationEvent = createEvent<{ message: string }>(
    "NotificationEvent",
  );

  await t.step(
    "should propagate event across paired PortChannels",
    async () => {
      const channelA = new PortChannel();
      const channelB = new PortChannel();

      const { port1, port2 } = new MessageChannel();
      channelA.addPort(port1);
      channelB.addPort(port2);

      const busA = new EventBus({ channel: channelA });
      const busB = new EventBus({ channel: channelB });

      const received: { message: string }[] = [];

      busB.on(NotificationEvent, (data) => {
        received.push(data);
      });

      // Wait briefly for subscribeEvent handshake over MessageChannel
      await new Promise((resolve) => setTimeout(resolve, 50));

      busA.emit(new NotificationEvent({ message: "Hello across ports!" }));

      await new Promise((resolve) => setTimeout(resolve, 50));

      assertEquals(received, [{ message: "Hello across ports!" }]);

      port1.close();
      port2.close();
    },
  );
});

Deno.test("createEvent - Subclassing", async (t) => {
  await t.step("should allow extending the returned event class", () => {
    const BaseEvent = createEvent<{ code: number }>("BaseEvent");

    class ChildEvent extends BaseEvent {
      public extra = "custom_field";
    }

    const child = new ChildEvent({ code: 200 });
    assertEquals(child.data, { code: 200 });
    assertEquals(child.extra, "custom_field");
    assertEquals(child.constructor.name, "ChildEvent");
    assertInstanceOf(child, BaseEvent);
    assertInstanceOf(child, Event);
  });
});
