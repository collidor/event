export type VerboseLevel = "debug" | "info" | "warn" | "error";

export type DataEvent = {
  type: "dataEvent";
  name: string;
  data: any;
  source: string;
  target?: string;
};

export type SubscribeEvent = {
  type: "subscribeEvent";
  name: string | string[];
  source: string;
};

export type UnsubscribeEvent = {
  type: "unsubscribeEvent";
  name: string | string[];
  source: string;
};

export type StartEvent = {
  type: "startEvent";
  source: string;
};

export type CloseEvent = {
  type: "closeEvent";
  source: string;
};

export type ChannelEvent = MessageEvent<
  DataEvent | SubscribeEvent | UnsubscribeEvent | StartEvent | CloseEvent
>;

export type MessagePortLike = {
  onmessage?: ((ev: MessageEvent) => void) | null;
  onmessageerror?: ((ev: MessageEvent) => void) | null;
  postMessage: (message: any) => void;
};
export type Channel<
  TContext extends Record<string, any> = Record<string, any>,
> = {
  publish: (event: string, data: any, context?: TContext) => void;
  subscribe: (
    event: string,
    callback: (data: any, context: TContext) => void,
  ) => void;
  unsubscribe: (
    event: string,
    callback: (data: any, context: TContext) => void,
  ) => void;
};

type TypedArray =
  | Int8Array
  | Uint8Array
  | Uint8ClampedArray
  | Int16Array
  | Uint16Array
  | Int32Array
  | Uint32Array
  | Float32Array
  | Float64Array;

export type Clonable =
  | Array<Clonable>
  | ArrayBuffer
  | ArrayBufferView
  | Blob
  | DataView
  | Date
  | Error
  | Map<any, Clonable>
  | Set<Clonable>
  | { [key: string]: Clonable }
  | RegExp
  | string
  | boolean
  | null
  | number
  // deno-lint-ignore ban-types
  | Number
  // deno-lint-ignore ban-types
  | String
  | TypedArray;

export type Serializer<S extends Clonable> = {
  serialize: (data: any) => S;
  deserialize: (data: S) => any;
};
