import { createWorkerPublishingChannel } from "@collidor/event/worker/server";
import { EventBus } from "@collidor/event";
import { ClickEvent } from "./events/click.event";
import { CountUpdatedEvent } from "./events/counter.event";

const serverChannel = createWorkerPublishingChannel();

const eventBus = new EventBus({
    publishingChannel: serverChannel,
});

let count = 0;

eventBus.on(ClickEvent, () => {
    count++;
    eventBus.emit(new CountUpdatedEvent(count));
});
