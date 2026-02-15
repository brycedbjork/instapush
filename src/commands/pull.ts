import { currentBranchName, ensureGitRepository, runGit } from "../lib/git.js";
import { keyValue, renderBanner, summaryBox, withStep } from "../lib/ui.js";

interface PullOptions {
  remote?: string;
}

export async function runPullCommand(options: PullOptions): Promise<void> {
  const remote = options.remote ?? "origin";
  renderBanner(
    "pull",
    `Pull the latest changes from ${remote} for this branch.`
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
  keyValue("Remote", remote);

  await withStep("Fetching remote changes", async () => {
    await runGit(["fetch", remote, "--prune"]);
  });

  await withStep("Pulling latest changes", async () => {
    await runGit(["pull", remote, branch]);
  });

  summaryBox("Pull Complete", [
    `Pulled ${remote}/${branch}`,
    "No AI conflict resolution applied",
  ]);
}
