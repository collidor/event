import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { EventBus } from "@collidor/event";
import { createClientWorkerPublishingChannel } from "@collidor/event/worker/client";
import { register } from "./injector.ts";

const worker = new Worker(new URL("./worker.ts", import.meta.url), {
  type: "module",
});
const eventBus = new EventBus({
  publishingChannel: createClientWorkerPublishingChannel(worker),
});

register(EventBus, eventBus);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
