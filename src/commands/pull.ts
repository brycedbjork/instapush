import { currentBranchName, ensureGitRepository, runGit } from "../lib/git.js";
import { createCommandChecklist, summaryBox } from "../lib/ui.js";

interface PullOptions {
  remote?: string;
}

export async function runPullCommand(options: PullOptions): Promise<void> {
  const remote = options.remote ?? "origin";
  const checklist = createCommandChecklist(
    "pull",
    `Fetch and pull from ${remote}.`
  );

  await checklist.step("Validate repo", async () => {
    await ensureGitRepository();
  });

  const branch = await checklist.step("Read branch", async () =>
    currentBranchName()
  );

  await checklist.step("Fetch remote", async () => {
    await runGit(["fetch", remote, "--prune"]);
  });

  await checklist.step("Pull branch", async () => {
    await runGit(["pull", remote, branch]);
  });

  checklist.finish();
  summaryBox("Pull", [`Pulled ${remote}/${branch}`, "No AI resolution needed"]);
}
