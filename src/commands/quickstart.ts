import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import {
  type AiProvider,
  configPath,
  defaultFastModelForProvider,
  defaultSmartModelForProvider,
  type JazzConfig,
  type ModelTier,
  readStoredConfig,
  writeStoredConfig,
} from "../lib/config.js";
import { CliError } from "../lib/errors.js";
import { discoverProviderModelCatalog } from "../lib/provider-models.js";
import {
  keyValue,
  promptMultiSelect,
  promptSelect,
  renderBanner,
  summaryBox,
  warn,
  withStep,
} from "../lib/ui.js";

const ALIAS_BLOCK_START = "# >>> GitJazz aliases >>>";
const ALIAS_BLOCK_END = "# <<< GitJazz aliases <<<";
const SUPPORTED_ALIAS_COMMANDS = ["push", "commit", "pull", "merge"] as const;
const CUSTOM_MODEL_VALUE = "__gj_custom_model__";
const DEFAULT_ALIAS_SET = [...SUPPORTED_ALIAS_COMMANDS];
const ALIAS_LINE_PATTERN = /^alias\s+([a-z]+)="gj\s+([a-z]+)"$/;

type SupportedAliasCommand = (typeof SUPPORTED_ALIAS_COMMANDS)[number];
type AliasMode = "install" | "none";

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

function modelTierLabel(tier: ModelTier): string {
  return tier === "smart" ? "smart" : "fast";
}

function modelTierHelperText(tier: ModelTier, provider: AiProvider): string {
  if (tier === "smart") {
    return `Used for merge conflict resolution (${provider}).`;
  }
  return `Used for commit message generation (${provider}).`;
}

function aliasCommandLine(alias: SupportedAliasCommand): string {
  return `alias ${alias}="gj ${alias}"`;
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

function normalizeString(value: string | undefined): string | undefined {
  const trimmed = (value || "").trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function maskApiKey(value: string): string {
  if (value.length <= 6) {
    return "*".repeat(value.length);
  }
  return `${"*".repeat(Math.max(4, value.length - 4))}${value.slice(-4)}`;
}

async function promptText(
  message: string,
  defaultValue?: string
): Promise<string> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    const suffix = defaultValue ? ` [${defaultValue}]` : "";
    const value = (await rl.question(`${message}${suffix}: `)).trim();
    return value || defaultValue || "";
  } finally {
    rl.close();
  }
}

async function promptApiKey(
  provider: AiProvider,
  existingApiKey: string | undefined
): Promise<string> {
  const label = existingApiKey
    ? `${provider} API key (press Enter to keep ${maskApiKey(existingApiKey)})`
    : `${provider} API key`;

  const entered = await promptText(label);
  const apiKey = normalizeString(entered) || existingApiKey;
  if (!apiKey) {
    throw new CliError("API key cannot be empty.");
  }
  return apiKey;
}

async function promptModelSelection(
  provider: AiProvider,
  tier: ModelTier,
  candidates: string[],
  defaultModel: string
): Promise<string> {
  const uniqueCandidates = unique([defaultModel, ...candidates]).filter(
    (candidate) => candidate.length > 0
  );
  const selected = await promptSelect({
    helperText: modelTierHelperText(tier, provider),
    message: `Pick ${modelTierLabel(tier)} model`,
    options: [
      ...uniqueCandidates.map((model, index) => ({
        label: model,
        value: model,
        ...(index === 0 ? { hint: "default" } : {}),
      })),
      {
        hint: "enter manually",
        label: "custom",
        value: CUSTOM_MODEL_VALUE,
      },
    ],
  });

  if (selected === CUSTOM_MODEL_VALUE) {
    const custom = await promptText(
      `Custom ${modelTierLabel(tier)} model`,
      defaultModel
    );
    if (!custom) {
      throw new CliError("Model cannot be empty.");
    }
    return custom;
  }

  return selected;
}

function defaultShellRcFile(): string {
  const shell = process.env.SHELL ?? "";
  if (shell.endsWith("zsh")) {
    return path.join(homedir(), ".zshrc");
  }
  if (shell.endsWith("bash")) {
    return path.join(homedir(), ".bashrc");
  }
  return path.join(homedir(), ".zshrc");
}

function renderAliasBlock(aliases: SupportedAliasCommand[]): string {
  const lines = aliases.map((command) => aliasCommandLine(command));
  return [ALIAS_BLOCK_START, ...lines, ALIAS_BLOCK_END].join("\n");
}

function parseAlias(value: string): SupportedAliasCommand | null {
  if (SUPPORTED_ALIAS_COMMANDS.includes(value as SupportedAliasCommand)) {
    return value as SupportedAliasCommand;
  }
  return null;
}

function parseAliasesFromManagedBlock(
  content: string
): SupportedAliasCommand[] {
  const blockMatch = content.match(
    new RegExp(`${ALIAS_BLOCK_START}\\n([\\s\\S]*?)\\n${ALIAS_BLOCK_END}`)
  );
  const managedBlock = blockMatch?.[1];
  if (!managedBlock) {
    return [];
  }

  const aliases: SupportedAliasCommand[] = [];
  for (const line of managedBlock.split("\n")) {
    const match = line.trim().match(ALIAS_LINE_PATTERN);
    const aliasFrom = match?.[1];
    const aliasTo = match?.[2];
    if (!(aliasFrom && aliasTo) || aliasFrom !== aliasTo) {
      continue;
    }
    const alias = parseAlias(aliasFrom);
    if (alias) {
      aliases.push(alias);
    }
  }
  return unique(aliases);
}

async function readConfiguredAliases(
  rcFilePath: string
): Promise<SupportedAliasCommand[]> {
  try {
    const content = await readFile(rcFilePath, "utf8");
    return parseAliasesFromManagedBlock(content);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    if (message.includes("ENOENT")) {
      return [];
    }
    throw new CliError(`Failed reading shell config ${rcFilePath}: ${message}`);
  }
}

function removeManagedAliasBlock(content: string): string {
  const pattern = new RegExp(
    `${ALIAS_BLOCK_START}[\\s\\S]*?${ALIAS_BLOCK_END}\\n?`,
    "g"
  );
  return content.replace(pattern, "").trimEnd();
}

async function updateAliases(
  rcFilePath: string,
  aliases: SupportedAliasCommand[]
): Promise<void> {
  await mkdir(path.dirname(rcFilePath), { recursive: true });

  let existingContent = "";
  try {
    existingContent = await readFile(rcFilePath, "utf8");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    if (!message.includes("ENOENT")) {
      throw new CliError(
        `Failed reading shell config ${rcFilePath}: ${message}`
      );
    }
  }

  const withoutManagedBlock = removeManagedAliasBlock(existingContent);
  if (aliases.length === 0) {
    await writeFile(
      rcFilePath,
      withoutManagedBlock ? `${withoutManagedBlock}\n` : "",
      "utf8"
    );
    return;
  }

  const block = renderAliasBlock(aliases);
  const nextContent = withoutManagedBlock
    ? `${withoutManagedBlock}\n\n${block}\n`
    : `${block}\n`;
  await writeFile(rcFilePath, nextContent, "utf8");
}

function promptProvider(initialProvider: AiProvider): Promise<AiProvider> {
  const options: AiProvider[] = ["openai", "anthropic", "google"];
  return promptSelect<AiProvider>({
    helperText: "Choose where ♪ GitJazz sends AI requests.",
    initialIndex: options.indexOf(initialProvider),
    message: "Pick provider",
    options: [
      {
        hint: "gpt models",
        label: "openai",
        value: "openai",
      },
      {
        hint: "claude models",
        label: "anthropic",
        value: "anthropic",
      },
      {
        hint: "gemini models",
        label: "google",
        value: "google",
      },
    ],
  });
}

function promptAliasMode(initialMode: AliasMode): Promise<AliasMode> {
  return promptSelect<AliasMode>({
    helperText: "Install optional shell shortcuts or keep `gj <command>`.",
    initialIndex: initialMode === "install" ? 0 : 1,
    message: "Pick alias mode",
    options: [
      {
        hint: "write aliases into rc file",
        label: "Install aliases",
        value: "install",
      },
      {
        hint: "no shell aliases",
        label: "No aliases",
        value: "none",
      },
    ],
  });
}

async function promptAliases(
  initialAliases: SupportedAliasCommand[]
): Promise<SupportedAliasCommand[]> {
  const selected = await promptMultiSelect<SupportedAliasCommand>({
    helperText:
      "Checked entries are written exactly as shown into your shell rc file.",
    initialValues: initialAliases,
    message: "Pick aliases",
    minimumSelections: 1,
    options: SUPPORTED_ALIAS_COMMANDS.map((alias) => ({
      hint: aliasCommandLine(alias),
      label: alias,
      value: alias,
    })),
  });

  if (selected.length === 0) {
    throw new CliError("Select at least one alias, or choose No aliases.");
  }

  return selected;
}

function storedModelForTier(
  stored: Awaited<ReturnType<typeof readStoredConfig>>,
  provider: AiProvider,
  tier: ModelTier
): string | undefined {
  if (!isProvider(stored.provider) || stored.provider !== provider) {
    return undefined;
  }

  const tierModel =
    tier === "smart"
      ? normalizeString(stored.smartModel)
      : normalizeString(stored.fastModel);
  return tierModel || normalizeString(stored.model);
}

function storedApiKeyForProvider(
  stored: Awaited<ReturnType<typeof readStoredConfig>>,
  provider: AiProvider
): string | undefined {
  const envApiKey = normalizeString(providerApiKeyFromEnv(provider));
  if (envApiKey) {
    return envApiKey;
  }
  if (!isProvider(stored.provider) || stored.provider !== provider) {
    return undefined;
  }
  return normalizeString(stored.apiKey);
}

function hasStoredConfig(
  stored: Awaited<ReturnType<typeof readStoredConfig>>
): boolean {
  return (
    isProvider(stored.provider) &&
    !!normalizeString(stored.smartModel || stored.fastModel || stored.model)
  );
}

export async function runSetupCommand(): Promise<void> {
  renderBanner("setup", "Update provider, models, API key, and aliases.");

  const stored = await readStoredConfig();
  const initialProvider = isProvider(stored.provider)
    ? stored.provider
    : "openai";
  const provider = await promptProvider(initialProvider);
  const apiKey = await promptApiKey(
    provider,
    storedApiKeyForProvider(stored, provider)
  );

  const modelCatalog = await withStep(
    "Fetching latest models from provider",
    async () => discoverProviderModelCatalog(provider, apiKey),
    (catalog) =>
      catalog.source === "live"
        ? `Found ${catalog.liveModelCount} live model(s)`
        : "Falling back to built-in model presets"
  );

  if (modelCatalog.source === "fallback" && modelCatalog.warning) {
    warn(`Live model discovery failed: ${modelCatalog.warning}`);
  }

  const storedSmart = storedModelForTier(stored, provider, "smart");
  const smartDefault =
    storedSmart ||
    modelCatalog.smart[0] ||
    defaultSmartModelForProvider(provider);
  const smartModel = await promptModelSelection(
    provider,
    "smart",
    modelCatalog.smart,
    smartDefault
  );

  const storedFast = storedModelForTier(stored, provider, "fast");
  const fastDefault =
    storedFast || modelCatalog.fast[0] || defaultFastModelForProvider(provider);
  const fastModel = await promptModelSelection(
    provider,
    "fast",
    modelCatalog.fast,
    fastDefault
  );

  const guessedRc = defaultShellRcFile();
  const rcInput = await promptText("Shell rc file", guessedRc);
  const rcFilePath = path.resolve(rcInput || guessedRc);
  const configuredAliases = await readConfiguredAliases(rcFilePath);
  let initialAliasMode: AliasMode = "install";
  if (configuredAliases.length > 0) {
    initialAliasMode = "install";
  } else if (hasStoredConfig(stored)) {
    initialAliasMode = "none";
  }
  const aliasMode = await promptAliasMode(initialAliasMode);
  const aliases =
    aliasMode === "install"
      ? await promptAliases(
          configuredAliases.length > 0 ? configuredAliases : DEFAULT_ALIAS_SET
        )
      : [];

  await withStep("Saving AI config", async () => {
    const config: JazzConfig = {
      provider,
      smartModel,
      fastModel,
      apiKey,
    };
    await writeStoredConfig(config);
  });

  await withStep("Updating shell aliases", async () => {
    await updateAliases(rcFilePath, aliases);
  });

  keyValue("Config", configPath());
  keyValue("Shell rc", rcFilePath);
  keyValue("Provider", provider);
  keyValue("Smart mdl", smartModel);
  keyValue("Fast mdl", fastModel);
  keyValue("Model src", modelCatalog.source);

  const aliasSummary =
    aliases.length > 0
      ? `Installed aliases: ${aliases.join(", ")}`
      : "No aliases installed. Use 'gj <command>'.";
  const aliasCommands =
    aliases.length > 0
      ? `Alias lines: ${aliases.map((alias) => aliasCommandLine(alias)).join(" | ")}`
      : "Alias lines: (none)";

  summaryBox("Setup Complete", [
    aliasSummary,
    aliasCommands,
    `Run: source ${rcFilePath}`,
  ]);
}

export const runQuickstartCommand = runSetupCommand;
