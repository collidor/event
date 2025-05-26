import { EventBus, PortChannel } from "@collidor/event";
import SharedWorker from "./sharedWorker.ts?sharedworker";

const worker = new SharedWorker();

const channel = new PortChannel();
channel.addPort(worker.port);

export const eventBus = new EventBus({
  channel,
});
