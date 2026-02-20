import { currentBranchName, ensureGitRepository, runGit } from "../lib/git.js";
import { generatePullSummary } from "../lib/pull-summary.js";
import { createCommandChecklist, summaryBox } from "../lib/ui.js";

interface PullOptions {
  remote?: string;
}

interface IncomingPullSnapshot {
  commitMessages: string[];
  incomingPatch: string;
  incomingStat: string;
}

const SUMMARY_BULLET_PREFIX_PATTERN = /^[-*\u2022]\s*/;

function parseSummaryLines(summary: string): string[] {
  return summary
    .split("\n")
    .map((line) => line.trim())
    .map((line) => line.replace(SUMMARY_BULLET_PREFIX_PATTERN, ""))
    .filter((line) => line.length > 0)
    .slice(0, 7);
}

async function incomingPullSnapshot(
  remote: string,
  branch: string
): Promise<IncomingPullSnapshot> {
  const range = `HEAD..${remote}/${branch}`;
  const [messages, incomingStat, incomingPatch] = await Promise.all([
    runGit(["log", "--pretty=%s", range], {
      allowFailure: true,
    }),
    runGit(["diff", "--stat", range], {
      allowFailure: true,
    }),
    runGit(["diff", "--unified=0", range], {
      allowFailure: true,
    }),
  ]);

  const commitMessages =
    messages.code === 0 && messages.stdout
      ? messages.stdout
          .split("\n")
          .map((line) => line.trim())
          .filter((line) => line.length > 0)
      : [];

  return {
    commitMessages,
    incomingPatch: incomingPatch.code === 0 ? incomingPatch.stdout : "",
    incomingStat: incomingStat.code === 0 ? incomingStat.stdout : "",
  };
}

function fallbackPullSummary(commitMessages: string[]): string[] {
  const previewCount = 6;
  const visibleMessages = commitMessages.slice(0, previewCount);
  const summary = visibleMessages.map((message) => `"${message}"`);
  const remainingCount = commitMessages.length - visibleMessages.length;
  if (remainingCount > 0) {
    summary.push(`...and ${remainingCount} more commit(s)`);
  }
  summary.push("AI summary unavailable");
  return summary;
}

function formattedCommitCount(count: number): string {
  return `Pulled ${count} commit${count === 1 ? "" : "s"}`;
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

  const incomingSnapshot = await checklist.step(
    "Read incoming changes",
    async () => incomingPullSnapshot(remote, branch)
  );

  let pullSummary: string | null = null;
  if (incomingSnapshot.commitMessages.length > 0) {
    pullSummary = await checklist.step("Generate pull summary", async () => {
      try {
        return await generatePullSummary({
          branch,
          commitSubjects: incomingSnapshot.commitMessages,
          incomingPatch: incomingSnapshot.incomingPatch,
          incomingStat: incomingSnapshot.incomingStat,
          remote,
        });
      } catch {
        return null;
      }
    });
  }

  await checklist.step("Pull branch", async () => {
    await runGit(["pull", remote, branch]);
  });

  checklist.finish();
  const summaryLines = [`Pulled ${remote}/${branch}`];
  if (incomingSnapshot.commitMessages.length > 0) {
    summaryLines.push(
      formattedCommitCount(incomingSnapshot.commitMessages.length)
    );
    if (pullSummary) {
      summaryLines.push(...parseSummaryLines(pullSummary));
    } else {
      summaryLines.push(
        ...fallbackPullSummary(incomingSnapshot.commitMessages)
      );
    }
  } else {
    summaryLines.push("Already up to date");
  }
  summaryLines.push("No AI resolution needed");
  summaryBox("Pull", summaryLines);
}
