import {
  currentBranchName,
  ensureGitRepository,
  runGit,
  upstreamBranchName,
} from "../lib/git.js";
import { generateStatusSummary } from "../lib/status-summary.js";
import { createCommandChecklist, summaryBox } from "../lib/ui.js";

const SUMMARY_BULLET_PREFIX_PATTERN = /^[-*\u2022]\s*/;
const WHITESPACE_SPLIT_PATTERN = /\s+/;

interface GitTreeSnapshot {
  porcelainStatus: string;
  stagedStat: string;
  stagedPatch: string;
  unstagedStat: string;
  unstagedPatch: string;
}

interface AheadBehind {
  aheadCount: number;
  behindCount: number;
}

function parseSummaryLines(summary: string): string[] {
  return summary
    .split("\n")
    .map((line) => line.trim())
    .map((line) => line.replace(SUMMARY_BULLET_PREFIX_PATTERN, ""))
    .filter((line) => line.length > 0)
    .slice(0, 7);
}

function formatUpstreamLine(
  upstream: string | null,
  aheadBehind: AheadBehind
): string {
  if (!upstream) {
    return "Upstream (none)";
  }

  const { aheadCount, behindCount } = aheadBehind;
  if (aheadCount > 0 && behindCount > 0) {
    return `Upstream ${upstream} (${aheadCount} ahead, ${behindCount} behind)`;
  }
  if (aheadCount > 0) {
    return `Upstream ${upstream} (${aheadCount} ahead)`;
  }
  if (behindCount > 0) {
    return `Upstream ${upstream} (${behindCount} behind)`;
  }

  return `Upstream ${upstream} (up to date)`;
}

async function readGitTreeSnapshot(): Promise<GitTreeSnapshot> {
  const [
    porcelainStatus,
    stagedStat,
    stagedPatch,
    unstagedStat,
    unstagedPatch,
  ] = await Promise.all([
    runGit(["status", "--porcelain=v2", "--branch"]),
    runGit(["diff", "--staged", "--stat"]),
    runGit(["diff", "--staged", "--unified=0"]),
    runGit(["diff", "--stat"]),
    runGit(["diff", "--unified=0"]),
  ]);

  return {
    porcelainStatus: porcelainStatus.stdout,
    stagedPatch: stagedPatch.stdout,
    stagedStat: stagedStat.stdout,
    unstagedPatch: unstagedPatch.stdout,
    unstagedStat: unstagedStat.stdout,
  };
}

function hasTreeChanges(porcelainStatus: string): boolean {
  return porcelainStatus
    .split("\n")
    .map((line) => line.trim())
    .some((line) => line.length > 0 && !line.startsWith("#"));
}

async function readAheadBehind(upstream: string | null): Promise<AheadBehind> {
  if (!upstream) {
    return { aheadCount: 0, behindCount: 0 };
  }

  const result = await runGit(
    ["rev-list", "--left-right", "--count", `HEAD...${upstream}`],
    { allowFailure: true }
  );

  if (result.code !== 0 || !result.stdout) {
    return { aheadCount: 0, behindCount: 0 };
  }

  const [aheadRaw, behindRaw] = result.stdout.split(WHITESPACE_SPLIT_PATTERN);
  const aheadCount = Number.parseInt(aheadRaw || "0", 10);
  const behindCount = Number.parseInt(behindRaw || "0", 10);

  return {
    aheadCount: Number.isFinite(aheadCount) ? aheadCount : 0,
    behindCount: Number.isFinite(behindCount) ? behindCount : 0,
  };
}

export async function runStatusCommand(): Promise<void> {
  const checklist = createCommandChecklist(
    "status",
    "Summarize current git tree changes with AI."
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

  const aheadBehind = await checklist.step("Read sync state", async () =>
    readAheadBehind(upstream)
  );

  const snapshot = await checklist.step("Read git tree", async () =>
    readGitTreeSnapshot()
  );

  if (!hasTreeChanges(snapshot.porcelainStatus)) {
    checklist.finish();
    summaryBox("Status", [
      `Branch ${branch}`,
      formatUpstreamLine(upstream, aheadBehind),
      "Working tree clean",
    ]);
    return;
  }

  const aiSummary = await checklist.step("Generate AI summary", async () =>
    generateStatusSummary({
      aheadCount: aheadBehind.aheadCount,
      behindCount: aheadBehind.behindCount,
      branch,
      porcelainStatus: snapshot.porcelainStatus,
      stagedPatch: snapshot.stagedPatch,
      stagedStat: snapshot.stagedStat,
      unstagedPatch: snapshot.unstagedPatch,
      unstagedStat: snapshot.unstagedStat,
      upstream,
    })
  );

  checklist.finish();
  summaryBox("Status", [
    `Branch ${branch}`,
    formatUpstreamLine(upstream, aheadBehind),
    ...parseSummaryLines(aiSummary),
  ]);
}
