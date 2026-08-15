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
      child.once("error", reject);
      child.once("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`BuildTools exited with code ${code ?? "unknown"}`));
      });
    });

    return { child, completion };
  }
}

export const buildToolsProcessRunner = new BuildToolsProcessRunner();
