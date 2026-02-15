import { type ModelTier, resolveAiConfig } from "./config.js";
import { CliError } from "./errors.js";

interface CompletionOptions {
  systemPrompt: string;
  userPrompt: string;
  modelTier?: ModelTier;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  stop?: string[];
}

function ensureJson(value: string, provider: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    throw new CliError(`${provider} returned invalid JSON.`);
  }
}

function extractOpenAiContent(parsed: unknown): string {
  const choices = (
    parsed as { choices?: Array<{ message?: { content?: string } }> }
  ).choices;
  return choices?.[0]?.message?.content?.trim() ?? "";
}

function extractAnthropicContent(parsed: unknown): string {
  const content = (
    parsed as { content?: Array<{ type?: string; text?: string }> }
  ).content;
  const textBlock = content?.find((entry) => entry.type === "text");
  return textBlock?.text?.trim() ?? "";
}

function extractGoogleContent(parsed: unknown): string {
  const candidates = (
    parsed as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    }
  ).candidates;
  return candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
}

async function requestOpenAi(
  apiKey: string,
  model: string,
  options: CompletionOptions
): Promise<string> {
  const payload = {
    model,
    messages: [
      { role: "system", content: options.systemPrompt },
      { role: "user", content: options.userPrompt },
    ],
    max_tokens: options.maxTokens,
    temperature: options.temperature,
    stop: options.stop,
  };

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new CliError(`OpenAI request failed (${response.status}): ${text}`);
  }

  const parsed = ensureJson(text, "OpenAI");
  const content = extractOpenAiContent(parsed);
  if (!content) {
    throw new CliError("OpenAI returned empty content.");
  }
  return content;
}

async function requestAnthropic(
  apiKey: string,
  model: string,
  options: CompletionOptions
): Promise<string> {
  const payload = {
    model,
    system: options.systemPrompt,
    messages: [{ role: "user", content: options.userPrompt }],
    max_tokens: options.maxTokens ?? 1024,
    temperature: options.temperature ?? 0.2,
  };

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(payload),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new CliError(
      `Anthropic request failed (${response.status}): ${text}`
    );
  }

  const parsed = ensureJson(text, "Anthropic");
  const content = extractAnthropicContent(parsed);
  if (!content) {
    throw new CliError("Anthropic returned empty content.");
  }
  return content;
}

async function requestGoogle(
  apiKey: string,
  model: string,
  options: CompletionOptions
): Promise<string> {
  const prompt = `${options.systemPrompt}\n\n${options.userPrompt}`;
  const payload = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      maxOutputTokens: options.maxTokens ?? 1024,
      temperature: options.temperature ?? 0.2,
      stopSequences: options.stop,
    },
  };

  const encodedModel = encodeURIComponent(model);
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodedModel}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new CliError(`Google request failed (${response.status}): ${text}`);
  }

  const parsed = ensureJson(text, "Google");
  const content = extractGoogleContent(parsed);
  if (!content) {
    throw new CliError("Google returned empty content.");
  }
  return content;
}

export async function createCompletion(
  options: CompletionOptions
): Promise<string> {
  const config = await resolveAiConfig();
  const selectedTier = options.modelTier ?? "smart";
  const selectedModel =
    options.model ??
    (selectedTier === "fast" ? config.fastModel : config.smartModel);

  if (config.provider === "openai") {
    return requestOpenAi(config.apiKey, selectedModel, options);
  }

  if (config.provider === "anthropic") {
    return requestAnthropic(config.apiKey, selectedModel, options);
  }

  return requestGoogle(config.apiKey, selectedModel, options);
}
