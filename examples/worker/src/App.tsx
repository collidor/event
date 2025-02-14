import { useCallback, useEffect, useState } from "react";

import "./App.css";
import { inject } from "./injector";
import { EventBus } from "@collidor/event";
import { ClickEvent } from "./events/click.event";
import { CountUpdatedEvent } from "./events/counter.event";

function App() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const eventBus = inject(EventBus);
    const subscribe = (event: number) => {
      setCount(event);
    };

    eventBus.on(CountUpdatedEvent, subscribe);

    return () => {
      eventBus.off(CountUpdatedEvent, subscribe);
    };
  }, []);

  const handleClick = useCallback(() => {
    const eventBus = inject(EventBus);
    eventBus.emit(new ClickEvent());
  }, []);

  return (
    <>
      <h1>React + EventBus + Worker</h1>
      <div className="card">
        <button onClick={handleClick}>count is {count}</button>
        <p>
          Edit <code>src/App.tsx</code> and save to test HMR
        </p>
      </div>
      <p className="read-the-docs">
        Click on the Vite and React logos to learn more
      </p>
    </>
  );
}

export default App;
