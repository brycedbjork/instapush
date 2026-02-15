import { resolveConflictsInFile } from "../lib/conflict-resolution.js";
import { CliError } from "../lib/errors.js";
import {
  abortMergeState,
  conflictedFiles,
  currentBranchName,
  ensureGitRepository,
  hasUncommittedChanges,
  mergeInProgress,
  runGit,
} from "../lib/git.js";
import { CommandError } from "../lib/process.js";
import {
  info,
  keyValue,
  renderBanner,
  summaryBox,
  withStep,
} from "../lib/ui.js";

interface MergeOptions {
  target?: string;
}

async function abortAndThrow(message: string): Promise<never> {
  await abortMergeState();
  throw new CliError(message);
}

export async function runMergeCommand(options: MergeOptions): Promise<void> {
  renderBanner("merge", "Merge with AI conflict resolution.");

  await withStep("Checking repository", async () => {
    await ensureGitRepository();
  });

  const branch = await withStep(
    "Reading branch",
    async () => currentBranchName(),
    (value) => `Working on ${value}`
  );

  const target = options.target ?? `origin/${branch}`;
  keyValue("Branch", branch);
  keyValue("Target", target);

  const dirtyWorktree = await withStep(
    "Checking worktree cleanliness",
    async () => hasUncommittedChanges(),
    (value) => (value ? "Uncommitted changes found" : "Working tree is clean")
  );
  if (dirtyWorktree) {
    throw new CliError(
      "Working tree has uncommitted changes. Commit or stash before merge."
    );
  }

  await withStep("Fetching origin", async () => {
    await runGit(["fetch", "origin", "--prune"]);
  });

  let mergeFailure: CommandError | null = null;
  try {
    await withStep("Merging target branch", async () => {
      await runGit(["merge", "--no-edit", target]);
    });
    summaryBox("Merge Complete", [
      `Merged ${target} into ${branch}`,
      "No conflicts detected",
    ]);
    return;
  } catch (error) {
    if (error instanceof CommandError) {
      mergeFailure = error;
    } else {
      throw error;
    }
  }

  const inMergeState = await mergeInProgress();
  if (!inMergeState) {
    const detail =
      mergeFailure?.result.stderr ||
      mergeFailure?.result.stdout ||
      "Unknown merge error.";
    throw new CliError(`Merge failed before conflict resolution: ${detail}`);
  }

  info("Conflicts detected. Starting AI resolution pass...");

  const filesToResolve = await withStep(
    "Collecting conflicted files",
    async () => conflictedFiles(),
    (files) => `Found ${files.length} conflicted file(s)`
  );

  if (filesToResolve.length === 0) {
    await abortAndThrow("Merge failed, but no conflicted files were detected.");
  }

  for (const filePath of filesToResolve) {
    try {
      await withStep(`Resolving ${filePath}`, async () => {
        await resolveConflictsInFile(filePath);
      });

      await withStep(`Staging ${filePath}`, async () => {
        await runGit(["add", filePath]);
      });
    } catch (error) {
      await abortMergeState();
      throw error;
    }
  }

  const unresolved = await conflictedFiles();
  if (unresolved.length > 0) {
    await abortAndThrow(
      `AI left unresolved conflicts in: ${unresolved.join(", ")}.`
    );
  }

  await withStep("Creating merge commit", async () => {
    await runGit(["commit", "--no-edit"]);
  });

  summaryBox("Merge Complete", [
    `Merged ${target} into ${branch}`,
    `Resolved ${filesToResolve.length} file(s) with AI`,
  ]);
}
