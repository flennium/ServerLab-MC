import { mkdir, mkdtemp, rm, writeFile } from "fs/promises";
import { createServer } from "net";
import os from "os";
import path from "path";
import { describe, expect, it } from "vitest";
import { FileConflictError, FileManager } from "../FileManager.js";
import { parseStartupArgs } from "../ProcessArgs.js";
import { parseJavaVersionOutput } from "../java/JavaRuntimeValidator.js";
import { javaRecommendationService, minimumJavaMajorForMinecraft } from "../java/JavaRecommendationService.js";
import { assertAllowedHttpsUrl, softwareProviderRegistry } from "../software/providers.js";
import { BuildToolsProvider } from "../software/BuildToolsProvider.js";
import { portManagerService } from "../PortManagerService.js";
import { sanitizePluginFileName } from "../plugins/PluginInstallService.js";
import { pluginCompatibilityService } from "../plugins/PluginCompatibilityService.js";
import { javaRequirementDetectionService } from "../java/JavaRequirementDetectionService.js";

function storedZip(entries: Array<{ name: string; data: Buffer }>): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const local = Buffer.alloc(30 + name.length + entry.data.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt32LE(entry.data.length, 18);
    local.writeUInt32LE(entry.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    name.copy(local, 30);
    entry.data.copy(local, 30 + name.length);
    localParts.push(local);

    const central = Buffer.alloc(46 + name.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt32LE(entry.data.length, 20);
    central.writeUInt32LE(entry.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    name.copy(central, 46);
    centralParts.push(central);
    offset += local.length;
  }
  const central = Buffer.concat(centralParts);
  const local = Buffer.concat(localParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(central.length, 12);
  end.writeUInt32LE(local.length, 16);
  return Buffer.concat([local, central, end]);
}

function classFile(classFileMajor: number): Buffer {
  const bytes = Buffer.alloc(8);
  bytes.writeUInt32BE(0xcafebabe, 0);
  bytes.writeUInt16BE(0, 4);
  bytes.writeUInt16BE(classFileMajor, 6);
  return bytes;
}

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

describe("JAR Java requirement detection", () => {
  it.each([
    ["paper", "net/minecraft/server/Main.class", 65, 21],
    ["fabric", "net/fabricmc/loader/impl/launch/server/FabricServerLauncher.class", 69, 25],
    ["velocity", "com/velocitypowered/proxy/Velocity.class", 69, 25],
  ])("detects the class-file requirement from %s", async (name, className, classMajor, javaMajor) => {
    const parent = await mkdtemp(path.join(os.tmpdir(), `serverlab-jar-${name}-`));
    const jarPath = path.join(parent, `${name}.jar`);
    try {
      await writeFile(jarPath, storedZip([{ name: className, data: classFile(classMajor) }]));
      const result = await javaRequirementDetectionService.detect(jarPath);
      expect(result).toMatchObject({
        requiredMajor: javaMajor,
        confidence: "high",
        method: "class-file",
      });
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });

  it("uses manifest metadata when a JAR has no readable classes", async () => {
    const parent = await mkdtemp(path.join(os.tmpdir(), "serverlab-jar-manifest-"));
    const jarPath = path.join(parent, "metadata.jar");
    try {
      await writeFile(jarPath, storedZip([
        { name: "META-INF/MANIFEST.MF", data: Buffer.from("Manifest-Version: 1.0\nBuild-Jdk-Spec: 17\n") },
      ]));
      const result = await javaRequirementDetectionService.detect(jarPath);
      expect(result).toMatchObject({ requiredMajor: 17, confidence: "medium", method: "manifest" });
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });

  it("treats the highest class-file version as authoritative over lower metadata", async () => {
    const parent = await mkdtemp(path.join(os.tmpdir(), "serverlab-jar-authority-"));
    const jarPath = path.join(parent, "authoritative.jar");
    try {
      await writeFile(jarPath, storedZip([
        { name: "META-INF/MANIFEST.MF", data: Buffer.from("Manifest-Version: 1.0\nBuild-Jdk-Spec: 17\n") },
        { name: "com/example/Main.class", data: classFile(69) },
      ]));
      const result = await javaRequirementDetectionService.detect(jarPath);
      expect(result).toMatchObject({
        minimumMajor: 25,
        requiredMajor: 25,
        status: "confirmed",
        method: "class-file",
        artifactSizeBytes: expect.any(Number),
      });
      expect(result.warnings.some((warning) => /metadata/i.test(warning))).toBe(true);
      expect(result.artifactSha256).toMatch(/^[a-f0-9]{64}$/);
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });
});

describe("Minecraft Java recommendations", () => {
  it("accepts newer runtimes when they meet the minimum", () => {
    expect(javaRecommendationService.isCompatible(25, 17, false)).toBe(true);
    expect(javaRecommendationService.isCompatible(17, 25, false)).toBe(false);
    expect(javaRecommendationService.isCompatible(26, 17, false, "paper", 25)).toBe(false);
    expect(javaRecommendationService.isCompatible(26, 17, true, "paper", 25)).toBe(true);
  });

  it("requires Java 25 for Fabric-era Minecraft 1.21.9 and newer", () => {
    expect(minimumJavaMajorForMinecraft("1.21.9")).toBe(25);
    expect(minimumJavaMajorForMinecraft("1.21.11")).toBe(25);
    expect(minimumJavaMajorForMinecraft("26.1")).toBe(25);
  });

  it("keeps earlier Minecraft versions on their supported Java baseline", () => {
    expect(minimumJavaMajorForMinecraft("1.21.8")).toBe(21);
    expect(minimumJavaMajorForMinecraft("1.20.4")).toBe(17);
    expect(minimumJavaMajorForMinecraft("1.20.5")).toBe(21);
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

describe("BuildTools URL allow list", () => {
  it("allows the official BuildTools host", () => {
    const provider = new BuildToolsProvider();
    expect(provider.validateDownloadUrl("https://hub.spigotmc.org/jenkins/job/BuildTools/lastSuccessfulBuild/artifact/target/BuildTools.jar").hostname).toBe("hub.spigotmc.org");
  });

  it("rejects non-official BuildTools hosts", () => {
    const provider = new BuildToolsProvider();
    expect(() => provider.validateDownloadUrl("https://example.com/BuildTools.jar")).toThrow(/not allowed/i);
  });
});

describe("server software providers", () => {
  it("exposes Folia and Vanilla as enabled download providers", () => {
    const providers = softwareProviderRegistry.list();
    expect(providers.find((provider) => provider.id === "folia")).toMatchObject({
      enabled: true,
      acquisition: "download",
    });
    expect(providers.find((provider) => provider.id === "vanilla")).toMatchObject({
      enabled: true,
      acquisition: "download",
      supportedRevisionSource: "minecraft-release-metadata",
    });
  });

  it("allows Mojang's official server download host", () => {
    expect(() => assertAllowedHttpsUrl(
      "https://piston-data.mojang.com/v1/objects/example/server.jar",
      ["piston-meta.mojang.com", "piston-data.mojang.com"]
    )).not.toThrow();
  });

  it("exposes proxy providers with official-source metadata", () => {
    const providers = softwareProviderRegistry.list();
    expect(providers.find((provider) => provider.id === "velocity")).toMatchObject({
      kind: "proxy",
      requiresEula: false,
      recommendedJavaMajor: 25,
      pluginLoaders: ["velocity"],
    });
    expect(providers.find((provider) => provider.id === "waterfall")).toMatchObject({
      kind: "proxy",
      deprecated: true,
      configFormat: "yaml",
    });
    expect(providers.find((provider) => provider.id === "bungeecord")).toMatchObject({
      kind: "proxy",
      releaseSource: "jenkins",
      deprecated: true,
    });
  });

  it("rejects plugins for Vanilla servers", () => {
    expect(pluginCompatibilityService.check(
      { software: "vanilla", version: "1.21.8" },
      { loaders: ["paper"], gameVersions: ["1.21.8"] }
    )).toMatchObject({
      status: "incompatible",
      reason: "Vanilla servers do not support plugins.",
    });
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

  it("returns metadata for editable server config files", async () => {
    const parent = await mkdtemp(path.join(os.tmpdir(), "serverlab-file-meta-"));
    const serverRoot = path.join(parent, "server");

    try {
      await mkdir(serverRoot, { recursive: true });
      await writeFile(path.join(serverRoot, "server.properties"), "online-mode=true", "utf-8");

      const manager = new FileManager(serverRoot);
      const entries = await manager.listDirectory("");
      const properties = entries.find((entry) => entry.name === "server.properties");

      expect(properties).toMatchObject({
        type: "properties",
        isEditable: true,
        isBinary: false,
        readonly: false,
      });

      const content = await manager.readFileContent("server.properties");
      expect(content).toMatchObject({
        language: "properties",
        readonly: false,
        restartHint: "Restart the server for most server.properties changes.",
      });
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });

  it("detects save conflicts from stale file metadata", async () => {
    const parent = await mkdtemp(path.join(os.tmpdir(), "serverlab-file-conflict-"));
    const serverRoot = path.join(parent, "server");

    try {
      await mkdir(serverRoot, { recursive: true });
      await writeFile(path.join(serverRoot, "config.json"), "{\"a\":1}", "utf-8");

      const manager = new FileManager(serverRoot);
      const opened = await manager.readFileContent("config.json");
      await writeFile(path.join(serverRoot, "config.json"), "{\"a\":2}", "utf-8");

      await expect(
        manager.writeFile({
          path: "config.json",
          content: "{\"a\":3}",
          expectedEtag: opened.etag,
        })
      ).rejects.toBeInstanceOf(FileConflictError);
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });

  it("hides internal plugin management folders", async () => {
    const parent = await mkdtemp(path.join(os.tmpdir(), "serverlab-plugin-folders-"));
    const serverRoot = path.join(parent, "server");

    try {
      await mkdir(path.join(serverRoot, "plugins", ".staging"), { recursive: true });
      await mkdir(path.join(serverRoot, "plugins", ".trash"), { recursive: true });
      await writeFile(path.join(serverRoot, "plugins", "EssentialsX.jar"), "", "utf-8");

      const manager = new FileManager(serverRoot);
      const entries = await manager.listDirectory("plugins");
      expect(entries.map((entry) => entry.name)).toEqual(["EssentialsX.jar"]);
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });
});

describe("plugin file safety", () => {
  it("sanitizes Modrinth-provided jar names", () => {
    expect(sanitizePluginFileName("../bad:name")).toBe("bad-name.jar");
    expect(sanitizePluginFileName("Plugin One.jar")).toBe("Plugin One.jar");
  });
});

describe("port management", () => {
  it("detects an occupied OS port", async () => {
    const server = createServer();
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 0;

    try {
      const status = await portManagerService.checkPort({
        port,
        host: "127.0.0.1",
        checkSavedServers: false,
      });
      expect(status.available).toBe(false);
      expect(["external", "unknown"]).toContain(status.source);
      expect(status.suggestedPort).toBeGreaterThan(port);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }, 10000);

  it("suggests a different port when a ServerLab reservation exists", async () => {
    const server = createServer();
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    await new Promise<void>((resolve) => server.close(() => resolve()));

    portManagerService.reservePort({
      ownerType: "server",
      ownerId: "test-server",
      ownerName: "Test Server",
      port,
    });

    try {
      const status = await portManagerService.checkPort({
        port,
        checkSavedServers: false,
      });
      expect(status.available).toBe(false);
      expect(status.source).toBe("serverlab-running");
      expect(status.suggestedPort).not.toBe(port);
    } finally {
      portManagerService.releasePort({ ownerType: "server", ownerId: "test-server" });
    }
  });
});
