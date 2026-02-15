import { generateCommitMessage } from "../lib/commit-message.js";
import { CliError } from "../lib/errors.js";
import {
  currentBranchName,
  ensureGitRepository,
  hasStagedChanges,
  runGit,
  shortHeadHash,
  stageAllChanges,
  upstreamBranchName,
} from "../lib/git.js";
import {
  info,
  keyValue,
  renderBanner,
  summaryBox,
  withStep,
} from "../lib/ui.js";

async function createCommitFromStagedChanges(): Promise<string> {
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

  return commitMessage;
}

export async function runPushCommand(): Promise<void> {
  renderBanner(
    "push",
    "Stage, commit with AI, and push upstream in one clean flow."
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

  const upstream = await withStep(
    "Checking upstream",
    async () => upstreamBranchName(),
    (value) => (value ? `Upstream ${value}` : "No upstream configured")
  );
  keyValue("Upstream", upstream ?? "none");

  await withStep("Staging local changes", async () => {
    await stageAllChanges();
  });

  const stagedChangesExist = await withStep(
    "Inspecting staged diff",
    async () => hasStagedChanges(),
    (value) =>
      value ? "Staged changes detected" : "No staged changes detected"
  );

  let commitMessage: string | null = null;

  if (stagedChangesExist) {
    commitMessage = await createCommitFromStagedChanges();
  } else {
    info("No new changes to commit. Will push any existing local commits.");
  }

  await withStep("Pushing branch", async () => {
    await runGit(["push"]);
  });

  const hash = await withStep(
    "Reading latest local commit",
    async () => shortHeadHash(),
    (value) => `Latest commit ${value}`
  );

  const summaryLines = [`Branch ${branch}`, `Latest commit ${hash}`];
  if (commitMessage) {
    summaryLines.push(`Created "${commitMessage}"`);
  }
  summaryLines.push(`Pushed to ${upstream ?? "configured remote"}`);

  summaryBox("Push Complete", summaryLines);
}
