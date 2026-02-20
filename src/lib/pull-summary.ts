import { createCompletion } from "./ai.js";

export interface PullSummaryInput {
  branch: string;
  remote: string;
  commitSubjects: string[];
  incomingStat: string;
  incomingPatch: string;
}

function truncateSection(value: string, maxChars: number): string {
  if (value.length <= maxChars) {
    return value;
  }
  return `${value.slice(0, maxChars).trim()}\n...[truncated]`;
}

function renderCommitSubjects(commitSubjects: string[]): string {
  if (commitSubjects.length === 0) {
    return "(none)";
  }

  return commitSubjects
    .slice(0, 30)
    .map((subject) => `- ${subject}`)
    .join("\n");
}

const SYSTEM_PROMPT = [
  "You are a senior engineer summarizing incoming git pull changes for a human.",
  "Return plain text only, no markdown and no code fences.",
  "Use 4 to 7 short lines.",
  "Focus on what is landing, likely risk, and quick checks after pulling.",
].join(" ");

export async function generatePullSummary(
  input: PullSummaryInput
): Promise<string> {
  const prompt = [
    "Summarize what is about to be pulled into the current branch.",
    "Keep it practical and human-readable.",
    "",
    `Target: ${input.remote}/${input.branch}`,
    `Incoming commits: ${input.commitSubjects.length}`,
    "",
    "Incoming commit subjects:",
    truncateSection(renderCommitSubjects(input.commitSubjects), 4000),
    "",
    "Incoming diff stat:",
    truncateSection(input.incomingStat || "(none)", 2500),
    "",
    "Incoming patch sample:",
    truncateSection(input.incomingPatch || "(none)", 6000),
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
