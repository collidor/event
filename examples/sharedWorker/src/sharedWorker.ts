import { EventBus } from "@collidor/event";
import { createSharedWorkerPublishingChannel } from "@collidor/event/worker/shared/server";
import { CounterClickedEvent } from "./events/counterClicked.event";
import { CounterUpdatedEvent } from "./events/counterUpdated.event";

let count = 0;

export const eventBus = new EventBus({
  publishingChannel: createSharedWorkerPublishingChannel(self as unknown as SharedWorkerGlobalScope)
});

eventBus.on(CounterClickedEvent, () => {
  console.log("Counter clicked");
    count++;
    eventBus.emit(new CounterUpdatedEvent(count));
});

