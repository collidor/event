import { EventBus, PortChannel } from "@collidor/event";

const broadcastChannel = new BroadcastChannel("test-channel");

const channel = new PortChannel();
channel.addPort(broadcastChannel);

export const eventBus = new EventBus({ channel });
