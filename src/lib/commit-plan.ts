import { createCompletion } from "./ai.js";
import { generateCommitMessage } from "./commit-message.js";

export interface CommitGroupPlan {
  files: string[];
  message: string;
}

interface RawPlanEntry {
  files?: unknown;
  message?: unknown;
}

const PLAN_SYSTEM_PROMPT = [
  "You split staged git changes into logical commit groups.",
  "Return strict JSON only.",
  'Schema: {"commits":[{"message":"...","files":["path"]}]}.',
  "Keep each message concise and single-line.",
  "Use each staged file exactly once.",
  "If changes are tightly related, return a single commit.",
].join(" ");
const CARRIAGE_RETURN_PATTERN = /\r/g;
const QUOTED_MESSAGE_PATTERN = /^"(.*)"$/;
const CODE_FENCE_START_PATTERN = /^```(?:json)?\s*/i;
const CODE_FENCE_END_PATTERN = /\s*```$/;

function truncatePrompt(prompt: string): string {
  const maxChars = 12_000;
  if (prompt.length <= maxChars) {
    return prompt;
  }
  return prompt.slice(0, maxChars).trim();
}

function sanitizeCommitMessage(raw: string): string {
  const firstLine =
    raw.replace(CARRIAGE_RETURN_PATTERN, "").split("\n")[0] ?? "";
  const trimmed = firstLine.trim();
  const unquoted = trimmed.replace(QUOTED_MESSAGE_PATTERN, "$1");
  return unquoted.trim();
}

function stripCodeFences(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("```")) {
    return trimmed;
  }

  return trimmed
    .replace(CODE_FENCE_START_PATTERN, "")
    .replace(CODE_FENCE_END_PATTERN, "")
    .trim();
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const items: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string") {
      continue;
    }

    const file = entry.trim();
    if (file) {
      items.push(file);
    }
  }
  return items;
}

interface ParsePlanResult {
  commits: CommitGroupPlan[];
  parsedJson: boolean;
}

function parsePlan(raw: string): ParsePlanResult {
  const sanitized = stripCodeFences(raw);

  let parsed: unknown;
  try {
    parsed = JSON.parse(sanitized);
  } catch {
    return {
      commits: [],
      parsedJson: false,
    };
  }

  let candidateEntries: unknown = null;
  if (Array.isArray(parsed)) {
    candidateEntries = parsed;
  } else if (typeof parsed === "object" && parsed !== null) {
    candidateEntries = (parsed as { commits?: unknown }).commits;
  }

  if (!Array.isArray(candidateEntries)) {
    return {
      commits: [],
      parsedJson: true,
    };
  }

  const commits: CommitGroupPlan[] = [];
  for (const entry of candidateEntries) {
    if (typeof entry !== "object" || entry === null) {
      continue;
    }

    const typedEntry = entry as RawPlanEntry;
    const files = toStringArray(typedEntry.files);
    const message =
      typeof typedEntry.message === "string"
        ? sanitizeCommitMessage(typedEntry.message)
        : "";

    if (files.length > 0 && message) {
      commits.push({ files, message });
    }
  }

  return {
    commits,
    parsedJson: true,
  };
}

function dedupePreservingOrder(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    if (seen.has(value)) {
      continue;
    }
    seen.add(value);
    result.push(value);
  }

  return result;
}

function normalizePlan(
  plannedCommits: CommitGroupPlan[],
  stagedFiles: string[]
): CommitGroupPlan[] {
  const stagedSet = new Set(stagedFiles);
  const claimedFiles = new Set<string>();
  const normalized: CommitGroupPlan[] = [];

  for (const plannedCommit of plannedCommits) {
    const files = dedupePreservingOrder(plannedCommit.files).filter((file) => {
      if (!stagedSet.has(file) || claimedFiles.has(file)) {
        return false;
      }
      claimedFiles.add(file);
      return true;
    });

    if (files.length > 0 && plannedCommit.message) {
      normalized.push({
        files,
        message: plannedCommit.message,
      });
    }
  }

  if (normalized.length === 0) {
    return [];
  }

  const leftovers = stagedFiles.filter((file) => !claimedFiles.has(file));
  if (leftovers.length > 0) {
    normalized.at(-1)?.files.push(...leftovers);
  }

  return normalized;
}

async function fallbackSingleCommit(
  stagedFiles: string[],
  diffSummary: string,
  diffChanges: string,
  rawResponse: string,
  preferRawMessage: boolean
): Promise<CommitGroupPlan[]> {
  const fallbackFromRaw = preferRawMessage
    ? sanitizeCommitMessage(rawResponse)
    : "";
  const message =
    fallbackFromRaw || (await generateCommitMessage(diffSummary, diffChanges));

  return [{ files: [...stagedFiles], message }];
}

export async function planCommitGroups(
  stagedFiles: string[],
  diffSummary: string,
  diffChanges: string
): Promise<CommitGroupPlan[]> {
  if (stagedFiles.length === 0) {
    return [];
  }

  const prompt = [
    "Group these staged git changes into natural commits by functionality.",
    "Return strict JSON only.",
    'Schema: {"commits":[{"message":"...","files":["path"]}]}.',
    "Rules:",
    "- Use each staged file exactly once.",
    "- Keep commit messages short and specific.",
    "- If all changes belong together, return one commit.",
    "",
    "Staged files:",
    ...stagedFiles.map((file) => `- ${file}`),
    "",
    "Diff summary:",
    diffSummary || "(no stat output)",
    "",
    "Patch:",
    diffChanges || "(no patch output)",
  ].join("\n");

  const rawResponse = await createCompletion({
    systemPrompt: PLAN_SYSTEM_PROMPT,
    userPrompt: truncatePrompt(prompt),
    modelTier: "fast",
    maxTokens: 500,
    temperature: 0.2,
  });

  const parsedPlan = parsePlan(rawResponse);
  if (!parsedPlan.parsedJson) {
    return fallbackSingleCommit(
      stagedFiles,
      diffSummary,
      diffChanges,
      rawResponse,
      true
    );
  }

  const normalizedPlan = normalizePlan(parsedPlan.commits, stagedFiles);
  if (normalizedPlan.length === 0) {
    return fallbackSingleCommit(
      stagedFiles,
      diffSummary,
      diffChanges,
      rawResponse,
      false
    );
  }

  return normalizedPlan;
}
