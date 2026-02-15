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
import {
  info,
  keyValue,
  renderBanner,
  summaryBox,
  withStep,
} from "../lib/ui.js";

export async function runCommitCommand(): Promise<void> {
  renderBanner(
    "commit",
    "Stage everything and write a clean AI commit message."
  );

  await withStep("Checking repository", async () => {
    await ensureGitRepository();
  });

  const branch = await withStep(
    "Reading branch",
    async () => currentBranchName(),
    (value) => `Working on ${value}`
  );
  keyValue("Branch", branch);

  await withStep("Staging local changes", async () => {
    await stageAllChanges();
  });

  const stagedChangesExist = await withStep(
    "Inspecting staged diff",
    async () => hasStagedChanges(),
    (value) =>
      value ? "Staged changes detected" : "No staged changes detected"
  );

  if (!stagedChangesExist) {
    info("No changes to commit.");
    return;
  }

  const diffSummary = await withStep("Summarizing staged files", async () => {
    const result = await runGit(["diff", "--staged", "--stat"]);
    return result.stdout;
  });

  const diffChanges = await withStep("Collecting staged patch", async () => {
    const result = await runGit(["diff", "--staged", "--unified=0"]);
    return result.stdout;
  });

  const commitMessage = await withStep(
    "Composing commit message with AI",
    async () => generateCommitMessage(diffSummary, diffChanges),
    (message) => `Commit message ready: "${message}"`
  );

  if (!commitMessage) {
    throw new CliError("AI returned an empty commit message.");
  }

  await withStep("Creating commit", async () => {
    await runGit(["commit", "-m", commitMessage]);
  });

  const shortHash = await withStep(
    "Reading new commit hash",
    async () => shortHeadHash(),
    (hash) => `Created commit ${hash}`
  );

  summaryBox("Commit Complete", [
    `Branch ${branch}`,
    `Commit ${shortHash}`,
    `Message "${commitMessage}"`,
  ]);
}
