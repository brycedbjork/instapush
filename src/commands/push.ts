import {
  type CreatedCommit,
  createCommitsFromStagedChanges,
} from "../lib/commit-flow.js";
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

export async function runPushCommand(): Promise<void> {
  const checklist = createCommandChecklist(
    "push",
    "Push current branch with AI commit groups when needed."
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

  let createdCommits: CreatedCommit[] = [];

  if (stagedChangesExist) {
    createdCommits = await createCommitsFromStagedChanges(checklist.step);
  }

  await checklist.step("Push branch", async () => {
    await runGit(["push"]);
  });

  const hash = await checklist.step("Read commit hash", async () =>
    shortHeadHash()
  );

  checklist.finish();

  const summaryLines = [`Branch ${branch}`, `Commit ${hash}`];
  if (createdCommits.length === 0) {
    summaryLines.push("No new commit created");
  } else if (createdCommits.length === 1) {
    summaryLines.push(`Created "${createdCommits[0]?.message ?? "unknown"}"`);
  } else {
    summaryLines.push(`Created ${createdCommits.length} commits`);
    for (const commit of createdCommits) {
      summaryLines.push(`${commit.hash} "${commit.message}"`);
    }
  }
  summaryLines.push(`Pushed to ${upstream ?? "upstream"}`);

  summaryBox("Push", summaryLines);
}
