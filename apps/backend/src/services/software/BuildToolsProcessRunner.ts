import { spawn, type ChildProcess } from "child_process";

export interface BuildToolsProcessHandle {
  child: ChildProcess;
  completion: Promise<void>;
}

export class BuildToolsProcessRunner {
  launch(input: {
    javaExecutable: string;
    toolPath: string;
    revision: string;
    workspacePath: string;
    env?: NodeJS.ProcessEnv;
    onOutput: (chunk: Buffer) => void;
  }): BuildToolsProcessHandle {
    const child = spawn(
      input.javaExecutable,
      ["-jar", input.toolPath, "--rev", input.revision],
      {
        cwd: input.workspacePath,
        windowsHide: true,
        shell: false,
        env: input.env,
      }
    );

    child.stdout?.on("data", input.onOutput);
    child.stderr?.on("data", input.onOutput);

    const completion = new Promise<void>((resolve, reject) => {
      let settled = false;
      let spawnError: NodeJS.ErrnoException | null = null;

      child.once("error", (error: NodeJS.ErrnoException) => {
        spawnError = error;
        if (settled) return;
        settled = true;
        const detail = [
          error.message || "unknown spawn error",
          error.code ? `code=${error.code}` : null,
          error.path ? `path=${error.path}` : null,
        ].filter(Boolean).join("; ");
        reject(new Error(`BuildTools could not start: ${detail}`));
      });
      child.once("close", (code, signal) => {
        if (settled) return;
        settled = true;
        if (spawnError) {
          reject(new Error(`BuildTools could not start: ${spawnError.message || "unknown spawn error"}`));
        } else if (code === 0) {
          resolve();
        } else {
          reject(new Error(`BuildTools exited with code ${code ?? "unknown"}${signal ? ` (${signal})` : ""}`));
        }
      });
    });

    return { child, completion };
  }
}

export const buildToolsProcessRunner = new BuildToolsProcessRunner();
