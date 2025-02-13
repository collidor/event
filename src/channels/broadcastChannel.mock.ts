// Define a mock BroadcastChannel that mimics the minimal API.
export class MockBroadcastChannel {
  // A static store to keep track of channels by name.
  private static channels = new Map<string, MockBroadcastChannel[]>();

  public name: string;
  public onmessage: ((ev: MessageEvent) => void) | null = null;

  constructor(name: string) {
    this.name = name;
    if (!MockBroadcastChannel.channels.has(name)) {
      MockBroadcastChannel.channels.set(name, []);
    }
    MockBroadcastChannel.channels.get(name)!.push(this);
  }

  postMessage(data: any): void {
    // When postMessage is called, dispatch the message to all other channels
    // with the same name.
    const channels = MockBroadcastChannel.channels.get(this.name) || [];
    for (const channel of channels) {
      if (channel !== this && channel.onmessage) {
        // Create a MessageEvent similar to the real one.
        const event = new MessageEvent("message", { data });
        channel.onmessage(event);
      }
    }
  }

  addEventListener(type: string, listener: (ev: MessageEvent) => void): void {
    if (type === "message") {
      this.onmessage = listener;
    }
  }

  removeEventListener(
    type: string,
    listener: (ev: MessageEvent) => void,
  ): void {
    if (type === "message" && this.onmessage === listener) {
      this.onmessage = null;
    }
  }

  close(): void {
    // Remove this instance from the static channel store.
    const channels = MockBroadcastChannel.channels.get(this.name);
    if (channels) {
      MockBroadcastChannel.channels.set(
        this.name,
        channels.filter((ch) => ch !== this),
      );
    }
  }

  onmessageerror: ((ev: MessageEvent) => void) | null = null;

  dispatchEvent(_event: Event): boolean {
    throw new Error("Method not implemented.");
  }
}
