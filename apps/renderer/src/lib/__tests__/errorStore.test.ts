import { describe, expect, it } from "vitest";
import { AppRequestError, createRendererError, normalizeError } from "../errorStore.js";

describe("renderer error normalization", () => {
  it("keeps structured app errors intact", () => {
    const appError = createRendererError({
      category: "network",
      userMessage: "Backend unavailable",
      action: "GET /api/servers",
    });

    expect(normalizeError({ error: appError })).toBe(appError);
    expect(normalizeError(new AppRequestError(appError))).toBe(appError);
  });

  it("converts regular errors into renderer app errors", () => {
    const appError = normalizeError(new Error("Save failed"), {
      action: "save-settings",
    });

    expect(appError.userMessage).toBe("Save failed");
    expect(appError.action).toBe("save-settings");
    expect(appError.recoveries).toContain("copy-details");
  });
});
