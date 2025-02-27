// src/channels/websocket.adapter.ts
import type { MessagePortLike } from "../main.ts";

export interface WebSocketAdapterOptions {
  serializer?: (data: unknown) => string;
  parser?: (data: string) => unknown;
  auth?: () => Promise<Record<string, unknown>>;
}

export class WebSocketAdapter implements MessagePortLike {
  public onmessage: ((ev: MessageEvent) => void) | null = null;
  public onmessageerror: ((ev: MessageEvent) => void) | null = null;
  private messageQueue: unknown[] = [];

  constructor(
    private ws: WebSocket,
    private options: WebSocketAdapterOptions = {},
  ) {
    this.initializeWebSocket();
  }

  private initializeWebSocket() {
    this.ws.onmessage = (event) => {
      try {
        const data = this.options.parser
          ? this.options.parser(event.data)
          : JSON.parse(event.data);

        this.onmessage?.({ data } as MessageEvent);
      } catch (_error) {
        this.onmessageerror?.({ data: event.data } as MessageEvent);
      }
    };

    this.ws.onopen = async () => {
      if (this.options.auth) {
        const authData = await this.options.auth();
        this.postMessage({ type: "auth", ...authData });
      }
      this.flushQueue();
    };

    this.ws.onclose = () => {
      this.onmessageerror?.({ data: "Connection closed" } as MessageEvent);
    };
  }

  postMessage(data: unknown): void {
    const serialized = this.options.serializer
      ? this.options.serializer(data)
      : JSON.stringify(data);

    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(serialized);
    } else {
      this.messageQueue.push(serialized);
    }
  }

  private flushQueue() {
    while (this.messageQueue.length > 0) {
      const message = this.messageQueue.shift();
      if (message) this.ws.send(message as string);
    }
  }

  static createBridge(channel: { addPort: (port: MessagePortLike) => void }) {
    return {
      connect: (ws: WebSocket, options?: WebSocketAdapterOptions) => {
        const adapter = new WebSocketAdapter(ws, options);
        channel.addPort(adapter);
        return adapter;
      },
    };
  }
}
