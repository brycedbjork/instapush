import { createCommitsFromStagedChanges } from "../lib/commit-flow.js";
import {
  currentBranchName,
  ensureGitRepository,
  hasStagedChanges,
  stageAllChanges,
} from "../lib/git.js";
import { createCommandChecklist, summaryBox } from "../lib/ui.js";

export async function runCommitCommand(): Promise<void> {
  const checklist = createCommandChecklist(
    "commit",
    "Create AI commit(s) from current changes."
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

  const createdCommits = await createCommitsFromStagedChanges(checklist.step);
  const latestCommit = createdCommits.at(-1);
  const summaryLines = [
    `Branch ${branch}`,
    `Commit ${latestCommit?.hash ?? "unknown"}`,
  ];

  if (createdCommits.length === 1) {
    summaryLines.push(`Message "${latestCommit?.message ?? "unknown"}"`);
  } else {
    summaryLines.push(`Created ${createdCommits.length} commits`);
    for (const commit of createdCommits) {
      summaryLines.push(`${commit.hash} "${commit.message}"`);
    }
  }

  checklist.finish();
  summaryBox("Commit", summaryLines);
}
