import type { Event } from "./eventModel.ts";

export type VerboseLevel = "debug" | "info" | "warn" | "error";

export type DataEvent = {
  type: "dataEvent";
  name: string;
  data: any;
  source?: string;
};

export type SubscribeEvent = {
  type: "subscribeEvent";
  name: string | string[];
  source?: string;
};

export type UnsubscribeEvent = {
  type: "unsubscribeEvent";
  name: string | string[];
  source?: string;
};

export type StartEvent = {
  type: "startEvent";
  source?: string;
};

export type ChannelEvent = MessageEvent<
  DataEvent | SubscribeEvent | UnsubscribeEvent | StartEvent
>;

export type MessagePortLike = {
  onmessage?: ((ev: MessageEvent) => void) | null;
  onmessageerror?: ((ev: MessageEvent) => void) | null;
  postMessage: (message: any) => void;
};
export type Channel<
  TContext extends Record<string, any> = Record<string, any>,
> = {
  publish: (event: Event<any>, context?: TContext) => void;
  subscribe: (
    event: string,
    callback: (data: any, context: TContext) => void,
  ) => void;
  unsubscribe: (
    event: string,
    callback: (data: any, context: TContext) => void,
  ) => void;
};
