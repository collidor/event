import { EventBus } from "@collidor/event";
import { createBroadcastPublishingChannel } from "@collidor/event/broadcastPublishingChannel";

export const eventBus = new EventBus({
    publishingChannel: createBroadcastPublishingChannel("test-channel"),
});
