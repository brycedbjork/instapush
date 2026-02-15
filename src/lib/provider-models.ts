import {
  type AiProvider,
  type ModelTier,
  suggestedModelsForProvider,
} from "./config.js";
import { CliError } from "./errors.js";

const MAX_MODELS_PER_TIER = 12;
const FAST_HINTS = ["nano", "mini", "haiku", "flash-lite", "flash"];
const SMART_HINTS = [
  "opus",
  "sonnet",
  "pro",
  "ultra",
  "gpt-5",
  "gpt-4",
  "o3",
  "o1",
];

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

const PREFERRED_PATTERNS: Record<AiProvider, Record<ModelTier, RegExp[]>> = {
  openai: {
    smart: [
      /^gpt-5$/,
      /^gpt-5-/,
      /^o3$/,
      /^o3-/,
      /^gpt-4\.1$/,
      /^gpt-4\.1-/,
      /^gpt-4o$/,
      /^gpt-4o-/,
      /^o1$/,
      /^o1-/,
    ],
    fast: [
      /^gpt-5-nano$/,
      /^gpt-5-mini$/,
      /^gpt-4\.1-nano$/,
      /^gpt-4\.1-mini$/,
      /^gpt-4o-mini$/,
      /^o4-mini$/,
      /^o3-mini$/,
    ],
  },
  anthropic: {
    smart: [/^claude-.*opus/, /^claude-.*sonnet/],
    fast: [/^claude-.*haiku/, /^claude-.*sonnet/],
  },
  google: {
    smart: [/^gemini-.*pro/, /^gemini-.*ultra/, /^gemini-.*flash/],
    fast: [/^gemini-.*flash-lite/, /^gemini-.*flash/],
  },
};

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

function normalizeModelName(model: string): string {
  return model.trim();
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
  return unique(
    (parsed.data ?? [])
      .map((entry) => normalizeModelName(entry.id ?? ""))
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
  return unique(
    (parsed.data ?? [])
      .map((entry) => normalizeModelName(entry.id ?? ""))
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
  return unique(
    (parsed.models ?? [])
      .filter((model) =>
        (model.supportedGenerationMethods ?? []).includes("generateContent")
      )
      .map((model) =>
        normalizeModelName(
          (model.name ?? "").replace(GOOGLE_MODEL_PREFIX_PATTERN, "")
        )
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

function scoreModel(
  provider: AiProvider,
  tier: ModelTier,
  model: string
): number {
  const lower = model.toLowerCase();
  let score = 0;
  const patterns = PREFERRED_PATTERNS[provider][tier];
  const preferredIndex = patterns.findIndex((pattern) => pattern.test(lower));
  if (preferredIndex >= 0) {
    score += 1000 - preferredIndex * 25;
  }

  if (FAST_HINTS.some((token) => lower.includes(token))) {
    score += tier === "fast" ? 120 : -20;
  }
  if (SMART_HINTS.some((token) => lower.includes(token))) {
    score += tier === "smart" ? 80 : -10;
  }
  if (lower.includes("latest")) {
    score += 6;
  }
  if (lower.includes("preview")) {
    score -= 4;
  }
  if (lower.includes("beta")) {
    score -= 3;
  }
  return score;
}

function rankModels(
  provider: AiProvider,
  tier: ModelTier,
  models: string[]
): string[] {
  return [...models]
    .sort((left, right) => {
      const scoreDelta =
        scoreModel(provider, tier, right) - scoreModel(provider, tier, left);
      if (scoreDelta !== 0) {
        return scoreDelta;
      }
      return left.localeCompare(right);
    })
    .slice(0, MAX_MODELS_PER_TIER);
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
  return {
    fast: suggestedModelsForProvider(provider, "fast"),
    liveModelCount: 0,
    smart: suggestedModelsForProvider(provider, "smart"),
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
      fast: rankModels(provider, "fast", modelIds),
      liveModelCount: modelIds.length,
      smart: rankModels(provider, "smart", modelIds),
      source: "live",
    };
  } catch (error) {
    return fallbackModelCatalog(provider, errorMessage(error));
  }
}
