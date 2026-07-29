/**
 * Thin wrapper around fetch that:
 * 1. Reads the backend origin + token from the Electron contextBridge (or falls
 *    back to a hardcoded dev address when running outside Electron).
 * 2. Attaches the Authorization header on every request.
 */

interface BackendConfig {
  origin: string;
  token: string;
}

let configCache: BackendConfig | null = null;

async function getConfig(): Promise<BackendConfig> {
  if (configCache) return configCache;

  if (typeof window !== "undefined" && window.serverlab) {
    configCache = await window.serverlab.getBackendConfig();
  } else {
    // Standalone Vite dev server — no Electron
    configCache = { origin: "http://127.0.0.1:3001", token: "" };
  }

  return configCache!;
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

  const res = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error: string }).error ?? res.statusText);
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
