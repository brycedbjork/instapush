import { generateCommitMessage } from "../lib/commit-message.js";
import { CliError } from "../lib/errors.js";
import {
  currentBranchName,
  ensureGitRepository,
  hasStagedChanges,
  runGit,
  shortHeadHash,
  stageAllChanges,
} from "../lib/git.js";
import { createCommandChecklist, summaryBox } from "../lib/ui.js";

export async function runCommitCommand(): Promise<void> {
  const checklist = createCommandChecklist(
    "commit",
    "Create an AI commit from current changes."
  );

  await checklist.step("Validate repo", async () => {
    await ensureGitRepository();
  });

  const branch = await checklist.step("Read branch", async () =>
    currentBranchName()
  );

  await checklist.step("Stage changes", async () => {
    await stageAllChanges();
  });

  const stagedChangesExist = await checklist.step(
    "Check staged changes",
    async () => hasStagedChanges()
  );

  if (!stagedChangesExist) {
    checklist.finish();
    summaryBox("Commit", [`Branch ${branch}`, "No changes to commit"]);
    return;
  }

  const diffSummary = await checklist.step("Read diff summary", async () => {
    const result = await runGit(["diff", "--staged", "--stat"]);
    return result.stdout;
  });

  const diffChanges = await checklist.step("Read staged patch", async () => {
    const result = await runGit(["diff", "--staged", "--unified=0"]);
    return result.stdout;
  });

  const commitMessage = await checklist.step(
    "Generate commit message",
    async () => generateCommitMessage(diffSummary, diffChanges)
  );

  if (!commitMessage) {
    throw new CliError("AI returned an empty commit message.");
  }

  await checklist.step("Create commit", async () => {
    await runGit(["commit", "-m", commitMessage]);
  });

  const shortHash = await checklist.step("Read commit hash", async () =>
    shortHeadHash()
  );

  checklist.finish();
  summaryBox("Commit", [
    `Branch ${branch}`,
    `Commit ${shortHash}`,
    `Message "${commitMessage}"`,
  ]);
}
