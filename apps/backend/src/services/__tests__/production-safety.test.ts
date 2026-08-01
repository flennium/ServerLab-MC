import { mkdir, mkdtemp, rm, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import { describe, expect, it } from "vitest";
import { FileManager } from "../FileManager.js";
import { parseStartupArgs } from "../ProcessArgs.js";
import { parseJavaVersionOutput } from "../java/JavaRuntimeValidator.js";
import { assertAllowedHttpsUrl } from "../software/providers.js";

describe("Java runtime parsing", () => {
  it("parses legacy Java 8 output", () => {
    const info = parseJavaVersionOutput('java version "1.8.0_402"\nJava(TM) SE Runtime Environment');

    expect(info).toMatchObject({
      major: 8,
      version: "1.8.0_402",
      distribution: "Java",
    });
  });

  it("parses modern OpenJDK output", () => {
    const info = parseJavaVersionOutput('openjdk version "21.0.4" 2024-07-16\nOpenJDK Runtime Environment Temurin');

    expect(info).toMatchObject({
      major: 21,
      version: "21.0.4",
      distribution: "Temurin",
    });
  });
});

describe("startup argument parsing", () => {
  it("keeps quoted values together", () => {
    expect(parseStartupArgs('-Dserver.name="Local Test" --nogui')).toEqual([
      "-Dserver.name=Local Test",
      "--nogui",
    ]);
  });

  it("rejects unterminated quotes", () => {
    expect(() => parseStartupArgs('-Dname="broken')).toThrow(/unterminated quote/i);
  });
});

describe("download URL allow list", () => {
  it("allows HTTPS provider-owned hosts", () => {
    const url = assertAllowedHttpsUrl("https://fill.papermc.io/v3/projects/paper", ["fill.papermc.io"]);

    expect(url.hostname).toBe("fill.papermc.io");
  });

  it("rejects unexpected hosts and protocols", () => {
    expect(() => assertAllowedHttpsUrl("http://fill.papermc.io/file.jar", ["fill.papermc.io"])).toThrow(/HTTPS/);
    expect(() => assertAllowedHttpsUrl("https://example.com/file.jar", ["fill.papermc.io"])).toThrow(/not allowed/);
  });
});

describe("file manager sandbox", () => {
  it("rejects sibling-prefix traversal", async () => {
    const parent = await mkdtemp(path.join(os.tmpdir(), "serverlab-file-test-"));
    const serverRoot = path.join(parent, "server");
    const sibling = path.join(parent, "server-backup");

    try {
      await mkdir(serverRoot, { recursive: true });
      await mkdir(sibling, { recursive: true });
      await writeFile(path.join(serverRoot, "server.properties"), "online-mode=true", {
        encoding: "utf-8",
        flag: "w",
      });

      const manager = new FileManager(serverRoot);
      await expect(manager.readFile(path.relative(serverRoot, path.join(sibling, "secret.txt")))).rejects.toThrow(
        /Path traversal/
      );
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });
});
