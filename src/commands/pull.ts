import { currentBranchName, ensureGitRepository, runGit } from "../lib/git.js";
import { createCommandChecklist, summaryBox } from "../lib/ui.js";

interface PullOptions {
  remote?: string;
}

async function incomingCommitMessages(
  remote: string,
  branch: string
): Promise<string[]> {
  const result = await runGit(
    ["log", "--pretty=%s", `HEAD..${remote}/${branch}`],
    {
      allowFailure: true,
    }
  );
  if (result.code !== 0 || !result.stdout) {
    return [];
  }
  return result.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
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

  const pulledCommitMessages = await checklist.step(
    "Read incoming commits",
    async () => incomingCommitMessages(remote, branch)
  );

  await checklist.step("Pull branch", async () => {
    await runGit(["pull", remote, branch]);
  });

  checklist.finish();
  const summaryLines = [`Pulled ${remote}/${branch}`];
  if (pulledCommitMessages.length > 0) {
    summaryLines.push(
      `Pulled ${pulledCommitMessages.length} commit${pulledCommitMessages.length === 1 ? "" : "s"}`
    );
    for (const message of pulledCommitMessages) {
      summaryLines.push(`"${message}"`);
    }
  } else {
    summaryLines.push("Already up to date");
  }
  summaryLines.push("No AI resolution needed");
  summaryBox("Pull", summaryLines);
}
