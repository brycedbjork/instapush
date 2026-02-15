import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { CliError } from "./errors.js";

export type AiProvider = "openai" | "anthropic" | "google";
export type ModelTier = "smart" | "fast";

export interface JazzConfig {
  provider: AiProvider;
  smartModel: string;
  fastModel: string;
  apiKey: string;
}

type StoredJazzConfig = Partial<JazzConfig> & {
  model?: string;
};

const MODEL_PRESETS: Record<AiProvider, { smart: string[]; fast: string[] }> = {
  openai: {
    smart: ["gpt-4.1", "gpt-4.1-mini", "gpt-4o"],
    fast: ["gpt-4.1-nano", "gpt-4.1-mini", "gpt-4o-mini"],
  },
  anthropic: {
    smart: ["claude-3-5-sonnet-latest", "claude-3-opus-latest"],
    fast: ["claude-3-5-haiku-latest", "claude-3-5-sonnet-latest"],
  },
  google: {
    smart: ["gemini-2.0-flash", "gemini-1.5-pro"],
    fast: ["gemini-2.0-flash-lite", "gemini-2.0-flash"],
  },
};

const CONFIG_DIR = path.join(homedir(), ".config", "git-jazz");

function currentConfigPath(): string {
  return process.env.GJ_CONFIG_PATH
    ? path.resolve(process.env.GJ_CONFIG_PATH)
    : path.join(CONFIG_DIR, "config.json");
}

function isProvider(value: string | undefined): value is AiProvider {
  return value === "openai" || value === "anthropic" || value === "google";
}

function providerApiKeyFromEnv(provider: AiProvider): string | undefined {
  if (provider === "openai") {
    return process.env.OPENAI_API_KEY;
  }
  if (provider === "anthropic") {
    return process.env.ANTHROPIC_API_KEY;
  }
  return process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
}

function parseStoredConfig(raw: string): StoredJazzConfig {
  const parsed = JSON.parse(raw) as StoredJazzConfig;
  if (!parsed || typeof parsed !== "object") {
    return {};
  }
  return parsed;
}

function unique(items: string[]): string[] {
  return [...new Set(items)];
}

function firstModelOrThrow(models: string[], label: string): string {
  const firstModel = models[0];
  if (!firstModel) {
    throw new CliError(`No default model configured for ${label}.`);
  }
  return firstModel;
}

export function defaultSmartModelForProvider(provider: AiProvider): string {
  return firstModelOrThrow(MODEL_PRESETS[provider].smart, `${provider} smart`);
}

export function defaultFastModelForProvider(provider: AiProvider): string {
  return firstModelOrThrow(MODEL_PRESETS[provider].fast, `${provider} fast`);
}

export function suggestedModelsForProvider(
  provider: AiProvider,
  tier: ModelTier
): string[] {
  const defaults = [
    tier === "smart"
      ? defaultSmartModelForProvider(provider)
      : defaultFastModelForProvider(provider),
  ];
  return unique([...defaults, ...MODEL_PRESETS[provider][tier]]);
}

export function configPath(): string {
  return currentConfigPath();
}

export async function readStoredConfig(): Promise<StoredJazzConfig> {
  const resolvedPath = currentConfigPath();
  try {
    const raw = await readFile(resolvedPath, "utf8");
    return parseStoredConfig(raw);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown config read error";
    if (message.includes("ENOENT")) {
      return {};
    }
    throw new CliError(`Failed to read config at ${resolvedPath}: ${message}`);
  }
}

export async function writeStoredConfig(config: JazzConfig): Promise<void> {
  const resolvedPath = currentConfigPath();
  await mkdir(path.dirname(resolvedPath), { recursive: true });
  await writeFile(resolvedPath, `${JSON.stringify(config, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
}

export async function resolveAiConfig(): Promise<JazzConfig> {
  const stored = await readStoredConfig();

  const requestedProvider = process.env.GJ_AI_PROVIDER;
  let provider: AiProvider = "openai";
  if (isProvider(requestedProvider)) {
    provider = requestedProvider;
  } else if (isProvider(stored.provider)) {
    provider = stored.provider;
  }

  const legacyModelOverride = process.env.GJ_AI_MODEL || stored.model;
  const smartModel =
    process.env.GJ_SMART_MODEL ||
    stored.smartModel ||
    legacyModelOverride ||
    defaultSmartModelForProvider(provider);
  const fastModel =
    process.env.GJ_FAST_MODEL ||
    stored.fastModel ||
    legacyModelOverride ||
    defaultFastModelForProvider(provider);

  const envApiKey = providerApiKeyFromEnv(provider);
  const apiKey =
    envApiKey ||
    (stored.provider === provider && typeof stored.apiKey === "string"
      ? stored.apiKey
      : undefined);

  if (!apiKey) {
    throw new CliError(
      `Missing API key for ${provider}. Run 'gj quickstart' or set the provider key env var.`
    );
  }

  return { provider, smartModel, fastModel, apiKey };
}
