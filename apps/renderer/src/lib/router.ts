import { useEffect, useState } from "react";

export function toHashPath(path: string): string {
  return `#${path.startsWith("/") ? path : `/${path}`}`;
}

export function currentRoute(): string {
  if (typeof window === "undefined") return "/dashboard";
  const route = window.location.hash.replace(/^#/, "");
  return route.startsWith("/") ? route : "/dashboard";
}

export function navigate(path: string, replace = false): void {
  const next = toHashPath(path);
  if (replace) {
    window.history.replaceState(null, "", next);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    return;
  }
  window.location.hash = next;
}

export function useHashRoute(): string {
  const [route, setRoute] = useState(currentRoute);

  useEffect(() => {
    const handleChange = () => setRoute(currentRoute());
    window.addEventListener("hashchange", handleChange);
    return () => window.removeEventListener("hashchange", handleChange);
  }, []);

  return route;
}

export function serverRouteId(route: string): string | null {
  const match = route.match(/^\/servers\/([^/]+)$/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}
