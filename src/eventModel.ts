export abstract class Event<T = unknown> {
  public data: T;

  constructor(data: T) {
    this.data = data;
  }
}
