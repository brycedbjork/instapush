import { runCommand } from "./process.js";

interface GitOptions {
  allowFailure?: boolean;
}

export function runGit(
  args: string[],
  options: GitOptions = {}
): Promise<{
  code: number;
  stdout: string;
  stderr: string;
}> {
  return runCommand(
    "git",
    args,
    options.allowFailure === undefined
      ? {}
      : { allowFailure: options.allowFailure }
  );
}

export async function runGitOrThrow(args: string[]): Promise<string> {
  const result = await runGit(args);
  return result.stdout;
}

export async function ensureGitRepository(): Promise<void> {
  await runGit(["rev-parse", "--is-inside-work-tree"]);
}

export async function stageAllChanges(): Promise<void> {
  await runGit(["add", "."]);
}

export async function hasStagedChanges(): Promise<boolean> {
  const result = await runGit(["diff", "--staged", "--quiet"], {
    allowFailure: true,
  });
  return result.code !== 0;
}

export async function hasUncommittedChanges(): Promise<boolean> {
  const worktree = await runGit(["diff", "--quiet"], { allowFailure: true });
  const staged = await runGit(["diff", "--cached", "--quiet"], {
    allowFailure: true,
  });
  return worktree.code !== 0 || staged.code !== 0;
}

export async function currentBranchName(): Promise<string> {
  const result = await runGit(["symbolic-ref", "--quiet", "--short", "HEAD"], {
    allowFailure: true,
  });
  return result.code === 0 && result.stdout ? result.stdout : "HEAD";
}

export async function upstreamBranchName(): Promise<string | null> {
  const result = await runGit(
    ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"],
    { allowFailure: true }
  );
  return result.code === 0 && result.stdout ? result.stdout : null;
}

export async function mergeInProgress(): Promise<boolean> {
  const result = await runGit(["rev-parse", "-q", "--verify", "MERGE_HEAD"], {
    allowFailure: true,
  });
  return result.code === 0;
}

export async function abortMergeState(): Promise<void> {
  const abort = await runGit(["merge", "--abort"], { allowFailure: true });
  if (abort.code !== 0) {
    await runGit(["reset", "--merge"], { allowFailure: true });
  }
}

export async function conflictedFiles(): Promise<string[]> {
  const result = await runGit(["diff", "--name-only", "--diff-filter=U"]);
  if (!result.stdout) {
    return [];
  }
  return result.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export async function shortHeadHash(): Promise<string> {
  const hash = await runGitOrThrow(["rev-parse", "--short", "HEAD"]);
  return hash || "unknown";
}
