import { createCompletion } from "./ai.js";

const SYSTEM_PROMPT = [
  "You are a helpful assistant that generates concise, clear, and useful git commit messages.",
  "Your output is used directly as the commit message, so return only the final message.",
  "Keep it under 50 characters when possible.",
  "If changes are unrelated, combine short clauses separated by commas.",
  "Avoid vague blanket words like 'refactor'.",
].join(" ");

function truncatePrompt(prompt: string): string {
  const maxChars = 8000;
  if (prompt.length <= maxChars) {
    return prompt;
  }
  return prompt.slice(0, maxChars).trim();
}

export async function generateCommitMessage(
  diffSummary: string,
  diffChanges: string
): Promise<string> {
  const prompt = [
    "Create a concise git commit message for these staged changes.",
    "",
    "Summary:",
    diffSummary || "(no stat output)",
    "",
    "Patch:",
    diffChanges || "(no patch output)",
  ].join("\n");

  const message = await createCompletion({
    systemPrompt: SYSTEM_PROMPT,
    userPrompt: truncatePrompt(prompt),
    modelTier: "fast",
    maxTokens: 60,
    temperature: 0.9,
    stop: ["\n"],
  });

  return message.trim();
}
