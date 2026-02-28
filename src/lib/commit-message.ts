import { NoObjectGeneratedError, NoOutputGeneratedError } from "ai";
import { z } from "zod";
import { createCompletion, createStructuredOutput } from "./ai.js";
import { CliError } from "./errors.js";

const SYSTEM_PROMPT = [
  "You are a helpful assistant that generates concise, clear, and useful git commit messages.",
  "Your output is used directly as the commit message, so return only the final message.",
  "Return plain text only: no JSON, no markdown, no code fences, no quotes.",
  "Return exactly one line.",
  "Keep it under 50 characters when possible.",
  "If changes are unrelated, combine short clauses separated by commas.",
  "Avoid vague blanket words like 'refactor'.",
].join(" ");
const CODE_FENCE_BLOCK_PATTERN = /^```[a-zA-Z0-9_-]*\s*([\s\S]*?)\s*```$/;
const NEWLINE_PATTERN = /\r?\n/;
const JSON_START_CHARS = new Set(["{", "[", '"']);
const HAS_ALPHANUMERIC_PATTERN = /[a-z0-9]/i;
const BARE_FENCE_PATTERN = /^```(?:json)?$/i;
const COMMIT_MESSAGE_OUTPUT_SCHEMA = z.object({
  message: z.string().min(1),
});

function truncatePrompt(prompt: string): string {
  const maxChars = 8000;
  if (prompt.length <= maxChars) {
    return prompt;
  }
  return prompt.slice(0, maxChars).trim();
}

function stripWrappingQuotes(value: string): string {
  let normalized = value.trim();
  while (normalized.length >= 2) {
    const first = normalized[0];
    const last = normalized.at(-1);
    const isWrapped =
      (first === '"' && last === '"') ||
      (first === "'" && last === "'") ||
      (first === "`" && last === "`");
    if (!isWrapped) {
      break;
    }
    normalized = normalized.slice(1, -1).trim();
  }
  return normalized;
}

function stripCodeFences(value: string): string {
  const normalized = value.trim();
  const fencedBlock = normalized.match(CODE_FENCE_BLOCK_PATTERN);
  if (fencedBlock?.[1]) {
    return fencedBlock[1].trim();
  }

  if (!normalized.startsWith("```")) {
    return normalized;
  }

  const lines = normalized.split(NEWLINE_PATTERN);
  if (lines.length <= 1) {
    return "";
  }

  const bodyLines = lines.slice(1);
  const closingFenceIndex = bodyLines.findIndex(
    (line) => line.trim() === "```"
  );
  const contentLines =
    closingFenceIndex >= 0 ? bodyLines.slice(0, closingFenceIndex) : bodyLines;
  return contentLines.join("\n").trim();
}

function parseJsonCommitMessage(value: string): string | null {
  const normalized = value.trim();
  if (!JSON_START_CHARS.has(normalized[0] ?? "")) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(normalized);
  } catch {
    return null;
  }

  if (typeof parsed === "string") {
    return parsed.trim();
  }

  if (Array.isArray(parsed)) {
    const firstString = parsed.find(
      (item): item is string =>
        typeof item === "string" && item.trim().length > 0
    );
    return firstString?.trim() ?? null;
  }

  if (!parsed || typeof parsed !== "object") {
    return null;
  }

  const candidateKeys = [
    "message",
    "commit_message",
    "commitMessage",
    "title",
    "summary",
    "subject",
  ] as const;

  for (const key of candidateKeys) {
    const candidate = (parsed as Record<string, unknown>)[key];
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }

  return null;
}

export function isUsableCommitMessage(value: string): boolean {
  const normalized = value.trim();
  if (!normalized) {
    return false;
  }

  if (!HAS_ALPHANUMERIC_PATTERN.test(normalized)) {
    return false;
  }

  if (normalized.startsWith("{")) {
    return false;
  }

  if (BARE_FENCE_PATTERN.test(normalized)) {
    return false;
  }

  return true;
}

export function normalizeGeneratedCommitMessage(rawMessage: string): string {
  let normalized = rawMessage.trim();

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const previous = normalized;
    const parsedJsonMessage = parseJsonCommitMessage(normalized);
    if (parsedJsonMessage) {
      normalized = parsedJsonMessage;
    }

    normalized = stripCodeFences(normalized);
    normalized = stripWrappingQuotes(normalized);

    const firstLine = normalized
      .split(NEWLINE_PATTERN)
      .map((line) => line.trim())
      .find((line) => line.length > 0);
    normalized = firstLine ?? "";
    normalized = normalized.replace(/\s+/g, " ").trim();

    if (normalized === previous.trim()) {
      break;
    }
  }

  if (!isUsableCommitMessage(normalized)) {
    return "";
  }

  return normalized;
}

function shouldFallbackToTextCompletion(error: unknown): boolean {
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
    message.includes("could not parse")
  );
}

export async function generateCommitMessage(
  diffSummary: string,
  diffChanges: string
): Promise<string> {
  const details = [
    "Summary:",
    diffSummary || "(no stat output)",
    "",
    "Patch:",
    diffChanges || "(no patch output)",
  ].join("\n");

  const structuredPrompt = [
    "Create a concise git commit message for these staged changes.",
    "Return JSON with a single string field named message.",
    "",
    details,
  ].join("\n");

  const fallbackPrompt = [
    "Create a concise git commit message for these staged changes.",
    "Return plain text only: one line, no JSON, no markdown, no quotes.",
    "",
    details,
  ].join("\n");

  let rawMessage = "";

  try {
    const response = await createStructuredOutput({
      schema: COMMIT_MESSAGE_OUTPUT_SCHEMA,
      schemaDescription:
        "A one-line git commit subject describing the staged changes.",
      schemaName: "commit_message",
      systemPrompt: SYSTEM_PROMPT,
      userPrompt: truncatePrompt(structuredPrompt),
      modelTier: "fast",
      maxTokens: 60,
      temperature: 0.3,
    });
    rawMessage = response.message;
  } catch (error) {
    if (!shouldFallbackToTextCompletion(error)) {
      throw error;
    }

    rawMessage = await createCompletion({
      systemPrompt: SYSTEM_PROMPT,
      userPrompt: truncatePrompt(fallbackPrompt),
      modelTier: "fast",
      maxTokens: 60,
      temperature: 0.3,
      stop: ["\n"],
    });
  }

  const normalized = normalizeGeneratedCommitMessage(rawMessage);
  if (!isUsableCommitMessage(normalized)) {
    throw new CliError("AI returned an empty commit message.");
  }

  return normalized;
}
