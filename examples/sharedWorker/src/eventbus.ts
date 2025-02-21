import { EventBus } from "@collidor/event";
import { createClientWorkerPublishingChannel } from "@collidor/event/worker/client";
import SharedWorker from './sharedWorker.ts?sharedworker';

const worker = new SharedWorker();

export const eventBus = new EventBus({
  publishingChannel: createClientWorkerPublishingChannel(worker.port),
});
