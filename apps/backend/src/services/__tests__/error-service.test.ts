import { describe, expect, it } from "vitest";
import { errorService } from "../ErrorService.js";

describe("ErrorService", () => {
  it("maps Java errors to structured app errors", () => {
    const error = errorService.createFromUnknown(
      new Error("Java executable is missing"),
      { source: "backend:servers", action: "create-server" }
    );

    expect(error.category).toBe("java");
    expect(error.severity).toBe("warning");
    expect(error.userMessage).toContain("Java executable is missing");
    expect(error.recoveries).toContain("open-java-center");
  });

  it("redacts auth tokens and Windows user names from technical details", () => {
    const error = errorService.createFromUnknown("Failed", {
      technicalDetails:
        "Authorization: Bearer abc123 C:\\Users\\abder\\AppData\\Roaming\\ServerLab MC",
      userMessage: "Failed",
    });

    expect(error.technicalDetails).toContain("Bearer [redacted]");
    expect(error.technicalDetails).toContain("C:\\Users\\[redacted]");
    expect(error.technicalDetails).not.toContain("abc123");
    expect(error.technicalDetails).not.toContain("abder");
  });
});
