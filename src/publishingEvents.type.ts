import type { Event } from "./eventModel.ts";

export type DataEvent = {
  type: "data";
  name: string;
  data: any;
  source?: string;
};

export type SubscribeEvent = {
  type: "subscribe";
  name: string;
  source?: string;
};

export type UnsubscribeEvent = {
  type: "unsubscribe";
  name: string;
  source?: string;
};

export type StartEvent = {
  type: "start";
  source?: string;
};

export type PublishingEvent = MessageEvent<
  DataEvent | SubscribeEvent | UnsubscribeEvent | StartEvent
>;

export type PublishingChannel<
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
