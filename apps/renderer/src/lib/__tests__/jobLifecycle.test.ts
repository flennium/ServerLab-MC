import { describe, expect, it } from "vitest";
import {
  getTerminalJobMessage,
  isSuccessfulJobStatus,
  isTerminalJobStatus,
  shouldKeepJobProgress,
} from "../jobLifecycle.js";

describe("job lifecycle helpers", () => {
  it("treats completed and cached jobs as successful terminal states", () => {
    expect(isTerminalJobStatus("completed")).toBe(true);
    expect(isTerminalJobStatus("cached")).toBe(true);
    expect(isSuccessfulJobStatus("completed")).toBe(true);
    expect(isSuccessfulJobStatus("cached")).toBe(true);
    expect(shouldKeepJobProgress("completed")).toBe(false);
    expect(shouldKeepJobProgress("cached")).toBe(false);
  });

  it("keeps failed and cancelled jobs visible for retry context", () => {
    expect(isTerminalJobStatus("failed")).toBe(true);
    expect(isTerminalJobStatus("cancelled")).toBe(true);
    expect(isSuccessfulJobStatus("failed")).toBe(false);
    expect(isSuccessfulJobStatus("cancelled")).toBe(false);
    expect(shouldKeepJobProgress("failed")).toBe(true);
    expect(shouldKeepJobProgress("cancelled")).toBe(true);
  });

  it("returns compact terminal messages", () => {
    expect(getTerminalJobMessage("completed", "Java 21")).toBe("Java 21 installed.");
    expect(getTerminalJobMessage("cached", "Paper")).toBe("Paper is already cached.");
  });
});
