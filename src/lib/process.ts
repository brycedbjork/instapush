import { spawn } from "node:child_process";

export interface CommandResult {
  code: number;
  stdout: string;
  stderr: string;
}

export class CommandError extends Error {
  readonly command: string;
  readonly args: string[];
  readonly result: CommandResult;
  readonly signal: NodeJS.Signals | null;

  constructor(
    command: string,
    args: string[],
    result: CommandResult,
    signal: NodeJS.Signals | null
  ) {
    const renderedArgs = args.map((arg) => JSON.stringify(arg)).join(" ");
    super(`Command failed (${result.code}): ${command} ${renderedArgs}`);
    this.name = "CommandError";
    this.command = command;
    this.args = args;
    this.result = result;
    this.signal = signal;
  }
}

interface RunCommandOptions {
  cwd?: string;
  allowFailure?: boolean;
}

export async function runCommand(
  command: string,
  args: string[],
  options: RunCommandOptions = {}
): Promise<CommandResult> {
  const child = spawn(command, args, {
    cwd: options.cwd,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stdout = "";
  let stderr = "";

  child.stdout.on("data", (chunk: Buffer | string) => {
    stdout += chunk.toString();
  });

  child.stderr.on("data", (chunk: Buffer | string) => {
    stderr += chunk.toString();
  });

  const outcome = await new Promise<{
    code: number;
    signal: NodeJS.Signals | null;
  }>((resolve, reject) => {
    child.once("error", (error) => reject(error));
    child.once("close", (code, signal) => {
      resolve({ code: code ?? 1, signal });
    });
  });

  const result: CommandResult = {
    code: outcome.code,
    stdout: stdout.trim(),
    stderr: stderr.trim(),
  };

  if (result.code !== 0 && !options.allowFailure) {
    throw new CommandError(command, args, result, outcome.signal);
  }

  return result;
}
