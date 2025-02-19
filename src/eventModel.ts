export abstract class Event<T = undefined> {
  public data: T;

  constructor(...args: T extends undefined ? [] : [data: T]) {
    const [data] = args;
    this.data = data as T;
  }
}
