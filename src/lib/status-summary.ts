import { createCompletion } from "./ai.js";

export interface StatusSummaryInput {
  branch: string;
  upstream: string | null;
  aheadCount: number;
  behindCount: number;
  porcelainStatus: string;
  stagedStat: string;
  unstagedStat: string;
  stagedPatch: string;
  unstagedPatch: string;
}

function truncateSection(value: string, maxChars: number): string {
  if (value.length <= maxChars) {
    return value;
  }
  return `${value.slice(0, maxChars).trim()}\n...[truncated]`;
}

function renderSyncStatus(aheadCount: number, behindCount: number): string {
  if (aheadCount > 0 && behindCount > 0) {
    return `${aheadCount} ahead, ${behindCount} behind`;
  }
  if (aheadCount > 0) {
    return `${aheadCount} ahead`;
  }
  if (behindCount > 0) {
    return `${behindCount} behind`;
  }
  return "up to date";
}

const SYSTEM_PROMPT = [
  "You are a senior engineer summarizing git working tree changes for a human.",
  "Return plain text only, no markdown and no code fences.",
  "Use 4 to 7 short lines.",
  "Focus on what changed, where risk is, and what to do next.",
  "Mention staged, unstaged, untracked, and conflicts when present.",
].join(" ");

export async function generateStatusSummary(
  input: StatusSummaryInput
): Promise<string> {
  const prompt = [
    "Summarize the current git tree state for a CLI status command.",
    "Keep it practical and human-readable.",
    "",
    `Branch: ${input.branch}`,
    `Upstream: ${input.upstream ?? "(none)"}`,
    `Remote sync: ${renderSyncStatus(input.aheadCount, input.behindCount)}`,
    "",
    "Porcelain status:",
    truncateSection(input.porcelainStatus || "(clean)", 5000),
    "",
    "Staged diff stat:",
    truncateSection(input.stagedStat || "(none)", 2500),
    "",
    "Unstaged diff stat:",
    truncateSection(input.unstagedStat || "(none)", 2500),
    "",
    "Staged patch sample:",
    truncateSection(input.stagedPatch || "(none)", 6000),
    "",
    "Unstaged patch sample:",
    truncateSection(input.unstagedPatch || "(none)", 6000),
  ].join("\n");

  const summary = await createCompletion({
    systemPrompt: SYSTEM_PROMPT,
    userPrompt: prompt,
    modelTier: "fast",
    maxTokens: 260,
    temperature: 0.4,
  });

  return summary.trim();
}
