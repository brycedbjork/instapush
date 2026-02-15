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
import { createCommandChecklist, summaryBox } from "../lib/ui.js";

interface MergeOptions {
  target?: string;
}

async function abortAndThrow(message: string): Promise<never> {
  await abortMergeState();
  throw new CliError(message);
}

export async function runMergeCommand(options: MergeOptions): Promise<void> {
  const checklist = createCommandChecklist(
    "merge",
    "Merge target branch with AI conflict handling."
  );

  await checklist.step("Validate repo", async () => {
    await ensureGitRepository();
  });

  const branch = await checklist.step("Read branch", async () =>
    currentBranchName()
  );

  const target = options.target ?? `origin/${branch}`;

  const dirtyWorktree = await checklist.step("Check worktree", async () =>
    hasUncommittedChanges()
  );
  if (dirtyWorktree) {
    throw new CliError(
      "Working tree has uncommitted changes. Commit or stash before merge."
    );
  }

  await checklist.step("Fetch origin", async () => {
    await runGit(["fetch", "origin", "--prune"]);
  });

  let mergeFailure: CommandError | null = null;
  try {
    await checklist.step("Merge target", async () => {
      await runGit(["merge", "--no-edit", target]);
    });
    checklist.finish();
    summaryBox("Merge", [`Merged ${target} into ${branch}`, "No conflicts"]);
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

  const filesToResolve = await checklist.step(
    "Find conflicted files",
    async () => conflictedFiles()
  );

  if (filesToResolve.length === 0) {
    await abortAndThrow("Merge failed, but no conflicted files were detected.");
  }

  for (const filePath of filesToResolve) {
    try {
      await checklist.step(`Resolve ${filePath}`, async () => {
        await resolveConflictsInFile(filePath);
      });

      await checklist.step(`Stage ${filePath}`, async () => {
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

  await checklist.step("Create merge commit", async () => {
    await runGit(["commit", "--no-edit"]);
  });

  checklist.finish();
  summaryBox("Merge", [
    `Merged ${target} into ${branch}`,
    `Resolved ${filesToResolve.length} file(s) with AI`,
  ]);
}
