import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App.tsx";
import { useConsoleStore } from "./store/consoleStore.js";
import { useServerStore } from "./store/serverStore.js";
import { reportError } from "./lib/errorStore.js";
import "./styles/globals.css";

class RootErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    window.serverlab?.reportRendererError?.({
      category: "renderer",
      severity: "critical",
      userMessage: "The interface failed to render.",
      technicalDetails: error.stack ?? error.message,
      possibleSolution: "Reload the app. If it happens again, copy diagnostics from Settings.",
      source: "renderer:root-boundary",
      action: "render",
      recoveries: ["retry", "open-logs", "copy-details", "dismiss"],
    }).catch(() => {});
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
              background: "#79D928",
              color: "#071008",
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
  Promise.all([
    useServerStore.getState().initSocket(),
    useConsoleStore.getState().initSocket(),
  ]).catch((err) => {
    if (attempts > 1) {
      setTimeout(() => initSocketWithRetry(attempts - 1, delay), delay);
      return;
    }
    reportError(err, {
      category: "network",
      severity: "error",
      userMessage: "ServerLab could not connect to its live server events.",
      possibleSolution: "Retry the connection or restart ServerLab MC.",
      source: "renderer:startup",
      action: "socket-init",
      recoveries: ["retry", "open-logs", "copy-details", "dismiss"],
    });
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
