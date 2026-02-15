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
import { createCommandChecklist, summaryBox } from "../lib/ui.js";

async function createCommitFromStagedChanges(
  step: <T>(label: string, task: () => Promise<T>) => Promise<T>
): Promise<string> {
  const diffSummary = await step("Read diff summary", async () => {
    const result = await runGit(["diff", "--staged", "--stat"]);
    return result.stdout;
  });

  const diffChanges = await step("Read staged patch", async () => {
    const result = await runGit(["diff", "--staged", "--unified=0"]);
    return result.stdout;
  });

  const commitMessage = await step("Generate commit message", async () =>
    generateCommitMessage(diffSummary, diffChanges)
  );

  if (!commitMessage) {
    throw new CliError("AI returned an empty commit message.");
  }

  await step("Create commit", async () => {
    await runGit(["commit", "-m", commitMessage]);
  });

  return commitMessage;
}

export async function runPushCommand(): Promise<void> {
  const checklist = createCommandChecklist(
    "push",
    "Push current branch with an AI commit when needed."
  );

  await checklist.step("Validate repo", async () => {
    await ensureGitRepository();
  });

  const branch = await checklist.step("Read branch", async () =>
    currentBranchName()
  );

  const upstream = await checklist.step("Read upstream", async () =>
    upstreamBranchName()
  );

  await checklist.step("Stage changes", async () => {
    await stageAllChanges();
  });

  const stagedChangesExist = await checklist.step(
    "Check staged changes",
    async () => hasStagedChanges()
  );

  let commitMessage: string | null = null;

  if (stagedChangesExist) {
    commitMessage = await createCommitFromStagedChanges(checklist.step);
  }

  await checklist.step("Push branch", async () => {
    await runGit(["push"]);
  });

  const hash = await checklist.step("Read commit hash", async () =>
    shortHeadHash()
  );

  checklist.finish();

  const summaryLines = [`Branch ${branch}`, `Commit ${hash}`];
  if (commitMessage) {
    summaryLines.push(`Created "${commitMessage}"`);
  } else {
    summaryLines.push("No new commit created");
  }
  summaryLines.push(`Pushed to ${upstream ?? "upstream"}`);

  summaryBox("Push", summaryLines);
}
