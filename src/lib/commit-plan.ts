import { NoObjectGeneratedError, NoOutputGeneratedError } from "ai";
import { z } from "zod";
import { createStructuredOutput } from "./ai.js";
import {
  generateCommitMessage,
  isUsableCommitMessage,
  normalizeGeneratedCommitMessage,
} from "./commit-message.js";

export interface CommitGroupPlan {
  files: string[];
  message: string;
}

const PLAN_SYSTEM_PROMPT = [
  "You split staged git changes into logical commit groups.",
  "Return strict JSON only.",
  'Schema: {"commits":[{"message":"...","files":["path"]}]}.',
  "Keep each message concise and single-line.",
  "Use each staged file exactly once.",
  "If changes are tightly related, return a single commit.",
].join(" ");
const COMMIT_PLAN_OUTPUT_SCHEMA = z.object({
  commits: z
    .array(
      z.object({
        files: z.array(z.string().min(1)).min(1),
        message: z.string().min(1),
      })
    )
    .min(1),
});

function truncatePrompt(prompt: string): string {
  const maxChars = 12_000;
  if (prompt.length <= maxChars) {
    return prompt;
  }
  return prompt.slice(0, maxChars).trim();
}

function sanitizeCommitMessage(raw: string): string {
  return normalizeGeneratedCommitMessage(raw);
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

function shouldFallbackToSingleCommit(error: unknown): boolean {
  if (
    NoObjectGeneratedError.isInstance(error) ||
    NoOutputGeneratedError.isInstance(error)
  ) {
    return true;
  }

  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return (
    message.includes("no output generated") ||
    message.includes("no object generated") ||
    message.includes("could not parse") ||
    message.includes("did not match schema")
  );
}

function toCommitGroupPlans(
  commits: Array<{ files: string[]; message: string }>
): CommitGroupPlan[] {
  const normalized: CommitGroupPlan[] = [];

  for (const commit of commits) {
    const files = dedupePreservingOrder(
      commit.files.map((file) => file.trim()).filter((file) => file.length > 0)
    );
    const message = sanitizeCommitMessage(commit.message);

    if (files.length > 0 && isUsableCommitMessage(message)) {
      normalized.push({ files, message });
    }
  }

  return normalized;
}

async function fallbackSingleCommit(
  stagedFiles: string[],
  diffSummary: string,
  diffChanges: string
): Promise<CommitGroupPlan[]> {
  const message = await generateCommitMessage(diffSummary, diffChanges);
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

  let plannedCommits: CommitGroupPlan[] = [];
  try {
    const response = await createStructuredOutput({
      schema: COMMIT_PLAN_OUTPUT_SCHEMA,
      schemaDescription:
        "A list of commit groups, each with a concise message and file paths.",
      schemaName: "commit_group_plan",
      systemPrompt: PLAN_SYSTEM_PROMPT,
      userPrompt: truncatePrompt(prompt),
      modelTier: "fast",
      maxTokens: 500,
      temperature: 0.2,
    });
    plannedCommits = toCommitGroupPlans(response.commits);
  } catch (error) {
    if (!shouldFallbackToSingleCommit(error)) {
      throw error;
    }
    return fallbackSingleCommit(stagedFiles, diffSummary, diffChanges);
  }

  const normalizedPlan = normalizePlan(plannedCommits, stagedFiles);
  if (normalizedPlan.length === 0) {
    return fallbackSingleCommit(stagedFiles, diffSummary, diffChanges);
  }

  return normalizedPlan;
}
