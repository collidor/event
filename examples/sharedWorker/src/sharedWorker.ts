import { EventBus, PortChannel } from "@collidor/event";
import { CounterClickedEvent } from "./events/counterClicked.event";
import { CounterUpdatedEvent } from "./events/counterUpdated.event";

let count = 0;

const channel = new PortChannel({}, {
  onSubscribe(name) {
    if (name === CounterUpdatedEvent.name) {
      eventBus.emit(new CounterUpdatedEvent(count));
    }
  }
})
export const eventBus = new EventBus({
  channel,
});

(self as unknown as SharedWorkerGlobalScope).onconnect = (event) => {
  const port = event.ports[0];
  channel.addPort(port);
}

eventBus.on(CounterClickedEvent, () => {
  console.log("Counter clicked");
    count++;
    eventBus.emit(new CounterUpdatedEvent(count));
});

