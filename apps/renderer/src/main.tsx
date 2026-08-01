import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App.tsx";
import { useServerStore } from "./store/serverStore.js";
import "./styles/globals.css";

class RootErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      const err = this.state.error as Error;
      return (
        <div
          style={{
            padding: "2rem",
            fontFamily: "monospace",
            color: "#EF4444",
            background: "#101214",
            minHeight: "100vh",
          }}
        >
          <h1 style={{ color: "#fff", marginBottom: "1rem" }}>
            ServerLab MC - Startup Error
          </h1>
          <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
            {err.message}
            {"\n\n"}
            {err.stack}
          </pre>
          <button
            onClick={() => window.location.reload()}
            style={{
              marginTop: "1rem",
              padding: "0.5rem 1rem",
              background: "#D9823B",
              color: "#101214",
              border: "none",
              borderRadius: "6px",
              cursor: "pointer",
            }}
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function initSocketWithRetry(attempts = 5, delay = 1500) {
  useServerStore
    .getState()
    .initSocket()
    .catch((err) => {
      console.warn("[socket] init failed, retrying...", err);
      if (attempts > 1) {
        setTimeout(() => initSocketWithRetry(attempts - 1, delay), delay);
      }
    });
}

initSocketWithRetry();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RootErrorBoundary>
      <App />
    </RootErrorBoundary>
  </React.StrictMode>
);
