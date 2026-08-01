import path from "path";

export function getJavaRuntimeRoot(): string {
  const dataDir = process.env.DATA_DIR ?? process.cwd();
  return path.join(dataDir, "java-runtimes");
}

export const javaRuntimePaths = {
  root: getJavaRuntimeRoot(),
  managedRoot: path.join(getJavaRuntimeRoot(), "managed"),
  downloadsRoot: path.join(getJavaRuntimeRoot(), "downloads"),
  tmpRoot: path.join(getJavaRuntimeRoot(), "tmp"),
  logsRoot: path.join(getJavaRuntimeRoot(), "logs"),
  metadataPath: path.join(getJavaRuntimeRoot(), "metadata.json"),
};
