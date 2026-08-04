import { AppRequestError, createRendererError, isAppError, pushError } from "./errorStore.js";

interface BackendConfig {
  origin: string;
  token: string;
}

let configCache: BackendConfig | null = null;
const RETRYABLE_FETCH_ATTEMPTS = 20;
const RETRY_DELAY_MS = 250;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function getConfig(): Promise<BackendConfig> {
  if (configCache) return configCache;

  if (typeof window !== "undefined" && window.serverlab) {
    configCache = await window.serverlab.getBackendConfig();
  } else {
    // Standalone Vite dev server, no Electron.
    configCache = { origin: "http://127.0.0.1:3001", token: "" };
  }

  return configCache!;
}

async function fetchWithStartupRetry(
  url: string,
  init: RequestInit
): Promise<Response> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= RETRYABLE_FETCH_ATTEMPTS; attempt += 1) {
    try {
      return await fetch(url, init);
    } catch (error) {
      lastError = error;
      if (attempt === RETRYABLE_FETCH_ATTEMPTS) break;
      await sleep(RETRY_DELAY_MS);
    }
  }

  throw lastError;
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const { origin, token } = await getConfig();
  const url = `${origin}${path}`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetchWithStartupRetry(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (error) {
    const appError = createRendererError({
      category: "network",
      severity: "error",
      userMessage: "ServerLab could not reach the local backend.",
      technicalDetails: error instanceof Error ? error.stack ?? error.message : String(error),
      possibleSolution: "Restart ServerLab MC or open Developer tools in Settings.",
      source: "renderer:api",
      action: `${method} ${path}`,
      recoveries: ["retry", "open-settings", "copy-details", "dismiss"],
    });
    pushError(appError, { report: true });
    throw new AppRequestError(appError);
  }

  if (!res.ok) {
    const payload = await res.json().catch(() => ({ error: res.statusText }));
    const raw = (payload as { error?: unknown }).error;
    const appError = isAppError(raw)
      ? raw
      : createRendererError({
          category: res.status === 401 ? "auth" : "unknown",
          severity: res.status >= 500 ? "error" : "warning",
          userMessage: typeof raw === "string" ? raw : res.statusText,
          technicalDetails: JSON.stringify(payload),
          possibleSolution:
            res.status >= 500
              ? "Try again. If it keeps failing, copy the error details."
              : "Review the request and try again.",
          source: "renderer:api",
          action: `${method} ${path}`,
          recoveries: ["retry", "copy-details", "dismiss"],
        });
    pushError(appError);
    throw new AppRequestError(appError);
  }

  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body),
  patch: <T>(path: string, body: unknown) => request<T>("PATCH", path, body),
  delete: <T>(path: string) => request<T>("DELETE", path),
  put: <T>(path: string, body: unknown) => request<T>("PUT", path, body),
  getConfig,
};
