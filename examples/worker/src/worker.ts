import { EventBus, PortChannel } from "@collidor/event";
import { ClickEvent } from "./events/click.event";
import { CountUpdatedEvent } from "./events/counter.event";

const channel = new PortChannel();
channel.addPort(self as unknown as MessagePort);

const eventBus = new EventBus({
    channel,
});

let count = 0;

eventBus.on(ClickEvent, () => {
    count++;
    eventBus.emit(new CountUpdatedEvent(count));
});
