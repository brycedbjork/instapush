import { type AiProvider, suggestedModelsForProvider } from "./config.js";
import { CliError } from "./errors.js";

const OPENAI_EXCLUDED_TOKENS = [
  "audio",
  "embedding",
  "image",
  "moderation",
  "realtime",
  "search",
  "transcribe",
  "tts",
  "vision",
  "whisper",
];
const OPENAI_REASONING_MODEL_PATTERN = /^o\d/;
const GOOGLE_MODEL_PREFIX_PATTERN = /^models\//;
const CHECKPOINT_DATE_SUFFIX_PATTERN = /-\d{8}$/;

interface OpenAiModelListResponse {
  data?: Array<{ id?: string }>;
}

interface AnthropicModelListResponse {
  data?: Array<{ id?: string }>;
}

interface GoogleModelListResponse {
  models?: Array<{
    name?: string;
    supportedGenerationMethods?: string[];
  }>;
}

export interface ProviderModelCatalog {
  source: "live" | "fallback";
  smart: string[];
  fast: string[];
  liveModelCount: number;
  warning?: string;
}

function unique(items: string[]): string[] {
  return [...new Set(items)];
}

function normalizeModelName(model: string): string | undefined {
  const trimmed = model.trim();
  if (!trimmed) {
    return undefined;
  }
  return trimmed.replace(CHECKPOINT_DATE_SUFFIX_PATTERN, "");
}

function sortModels(models: string[]): string[] {
  return [...models].sort((left, right) =>
    left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" })
  );
}

function parseJson(text: string, providerLabel: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new CliError(
      `${providerLabel} model endpoint returned invalid JSON.`
    );
  }
}

function finalizeDiscoveredModels(models: string[]): string[] {
  return sortModels(
    unique(
      models
        .map((model) => normalizeModelName(model))
        .filter((model): model is string => !!model)
    )
  );
}

async function fetchOpenAiModelIds(apiKey: string): Promise<string[]> {
  const response = await fetch("https://api.openai.com/v1/models", {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    method: "GET",
  });
  const text = await response.text();
  if (!response.ok) {
    throw new CliError(
      `OpenAI model listing failed (${response.status}): ${text}`
    );
  }

  const parsed = parseJson(text, "OpenAI") as OpenAiModelListResponse;
  return finalizeDiscoveredModels(
    (parsed.data ?? [])
      .map((entry) => entry.id ?? "")
      .filter((entry) => {
        if (!entry) {
          return false;
        }
        const lower = entry.toLowerCase();
        const likelyChatModel =
          lower.startsWith("gpt-") ||
          lower.startsWith("chatgpt-") ||
          OPENAI_REASONING_MODEL_PATTERN.test(lower);
        if (!likelyChatModel) {
          return false;
        }
        return !OPENAI_EXCLUDED_TOKENS.some((token) => lower.includes(token));
      })
  );
}

async function fetchAnthropicModelIds(apiKey: string): Promise<string[]> {
  const response = await fetch("https://api.anthropic.com/v1/models", {
    headers: {
      "anthropic-version": "2023-06-01",
      "x-api-key": apiKey,
    },
    method: "GET",
  });
  const text = await response.text();
  if (!response.ok) {
    throw new CliError(
      `Anthropic model listing failed (${response.status}): ${text}`
    );
  }

  const parsed = parseJson(text, "Anthropic") as AnthropicModelListResponse;
  return finalizeDiscoveredModels(
    (parsed.data ?? [])
      .map((entry) => entry.id ?? "")
      .filter((entry) => entry.toLowerCase().startsWith("claude-"))
  );
}

async function fetchGoogleModelIds(apiKey: string): Promise<string[]> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`,
    {
      method: "GET",
    }
  );
  const text = await response.text();
  if (!response.ok) {
    throw new CliError(
      `Google model listing failed (${response.status}): ${text}`
    );
  }

  const parsed = parseJson(text, "Google") as GoogleModelListResponse;
  return finalizeDiscoveredModels(
    (parsed.models ?? [])
      .filter((model) =>
        (model.supportedGenerationMethods ?? []).includes("generateContent")
      )
      .map((model) =>
        (model.name ?? "").replace(GOOGLE_MODEL_PREFIX_PATTERN, "")
      )
      .filter((entry) => entry.toLowerCase().startsWith("gemini-"))
  );
}

function fetchLiveModelIds(
  provider: AiProvider,
  apiKey: string
): Promise<string[]> {
  if (provider === "openai") {
    return fetchOpenAiModelIds(apiKey);
  }
  if (provider === "anthropic") {
    return fetchAnthropicModelIds(apiKey);
  }
  return fetchGoogleModelIds(apiKey);
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return "Unknown error";
}

function fallbackModelCatalog(
  provider: AiProvider,
  warning: string
): ProviderModelCatalog {
  const fallbackModels = sortModels(
    unique([
      ...suggestedModelsForProvider(provider, "smart"),
      ...suggestedModelsForProvider(provider, "fast"),
    ])
  );

  return {
    fast: fallbackModels,
    liveModelCount: 0,
    smart: fallbackModels,
    source: "fallback",
    warning,
  };
}

export async function discoverProviderModelCatalog(
  provider: AiProvider,
  apiKey: string
): Promise<ProviderModelCatalog> {
  try {
    const modelIds = await fetchLiveModelIds(provider, apiKey);
    if (modelIds.length === 0) {
      return fallbackModelCatalog(
        provider,
        `${provider} returned no usable chat models.`
      );
    }

    return {
      fast: modelIds,
      liveModelCount: modelIds.length,
      smart: modelIds,
      source: "live",
    };
  } catch (error) {
    return fallbackModelCatalog(provider, errorMessage(error));
  }
}
