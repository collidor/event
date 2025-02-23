import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { EventBus, PortChannel } from "@collidor/event";
import { register } from "./injector.ts";

const worker = new Worker(new URL("./worker.ts", import.meta.url), {
  type: "module",
});

const channel = new PortChannel();
channel.addPort(worker);
const eventBus = new EventBus({
  channel,
});

register(EventBus, eventBus);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
