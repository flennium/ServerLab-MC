import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App.tsx";
import { useServerStore } from "./store/serverStore.js";
import "./styles/globals.css";

// Initialise the Socket.IO connection once, before first render.
// Errors are intentionally swallowed here — the app is usable without realtime
// (e.g. during early backend startup) and will reconnect automatically.
useServerStore.getState().initSocket().catch(console.warn);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
