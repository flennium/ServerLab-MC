import { describe, expect, it } from "vitest";
import { formatConsoleLine } from "../consoleFormat.js";

describe("console formatting", () => {
  it("parses Minecraft colors without returning HTML", () => {
    expect(formatConsoleLine("\u00a7aReady <ok>")).toEqual([
      { text: "Ready <ok>", color: "#56d364" },
    ]);
  });

  it("parses ANSI color and reset codes", () => {
    expect(formatConsoleLine("\x1B[31mError\x1B[0m done")).toEqual([
      { text: "Error", color: "#ff7b72" },
      { text: " done" },
    ]);
  });
});
