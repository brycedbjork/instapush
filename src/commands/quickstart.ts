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

const ALIAS_BLOCK_START = "# >>> git-jazz aliases >>>";
const ALIAS_BLOCK_END = "# <<< git-jazz aliases <<<";
const SUPPORTED_ALIAS_COMMANDS = ["push", "commit", "pull", "merge"] as const;
const CUSTOM_MODEL_VALUE = "__gj_custom_model__";
const DEFAULT_ALIAS_SET = [...SUPPORTED_ALIAS_COMMANDS];

type SupportedAliasCommand = (typeof SUPPORTED_ALIAS_COMMANDS)[number];
type AliasMode = "install" | "none";

function modelTierLabel(tier: ModelTier): string {
  return tier === "smart"
    ? "smart (merge resolution)"
    : "fast (commit messages)";
}

function aliasCommandLine(alias: SupportedAliasCommand): string {
  return `alias ${alias}="gj ${alias}"`;
}

function unique(items: string[]): string[] {
  return [...new Set(items)];
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
    helperText: `Provider: ${provider}. Pick a ${modelTierLabel(tier)} model.`,
    message: `Select ${modelTierLabel(tier)} model`,
    options: [
      ...uniqueCandidates.map((model, index) => ({
        label: model,
        value: model,
        ...(index === 0 ? { hint: "recommended" } : {}),
      })),
      {
        hint: "enter a model id manually",
        label: "custom",
        value: CUSTOM_MODEL_VALUE,
      },
    ],
  });

  if (selected === CUSTOM_MODEL_VALUE) {
    const custom = await promptText(
      `Enter custom ${modelTierLabel(tier)} model`,
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

function promptProvider(): Promise<AiProvider> {
  return promptSelect<AiProvider>({
    helperText: "Your provider determines API key and available models.",
    message: "Select AI provider",
    options: [
      {
        hint: "widest ecosystem",
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

function promptAliasMode(): Promise<AliasMode> {
  return promptSelect<AliasMode>({
    helperText: "Aliases let old muscle memory commands call git-jazz.",
    message: "Choose alias mode",
    options: [
      {
        hint: "recommended",
        label: "Install shell aliases",
        value: "install",
      },
      {
        hint: "type `gj <command>` directly",
        label: "No aliases",
        value: "none",
      },
    ],
  });
}

async function promptAliases(): Promise<SupportedAliasCommand[]> {
  const selected = await promptMultiSelect<SupportedAliasCommand>({
    helperText:
      "Each checked alias writes the exact command shown to your shell rc file.",
    initialValues: DEFAULT_ALIAS_SET,
    message: "Select aliases to install",
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

export async function runQuickstartCommand(): Promise<void> {
  renderBanner(
    "quickstart",
    "Configure AI provider, key, live models, and aliases."
  );

  const provider = await promptProvider();
  const apiKey = await promptText(`${provider} API key`);
  if (!apiKey) {
    throw new CliError("API key cannot be empty.");
  }

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

  const smartDefault =
    modelCatalog.smart[0] ?? defaultSmartModelForProvider(provider);
  const smartModel = await promptModelSelection(
    provider,
    "smart",
    modelCatalog.smart,
    smartDefault
  );

  const fastDefault =
    modelCatalog.fast[0] ?? defaultFastModelForProvider(provider);
  const fastModel = await promptModelSelection(
    provider,
    "fast",
    modelCatalog.fast,
    fastDefault
  );

  const aliasMode = await promptAliasMode();
  const aliases = aliasMode === "install" ? await promptAliases() : [];

  const guessedRc = defaultShellRcFile();
  const rcInput = await promptText("Shell rc file", guessedRc);
  const rcFilePath = path.resolve(rcInput || guessedRc);

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
  keyValue("Models", modelCatalog.source);

  const aliasSummary =
    aliases.length > 0
      ? `Installed aliases: ${aliases.join(", ")}`
      : "No aliases installed. Use 'gj <command>'.";
  const aliasCommands =
    aliases.length > 0
      ? `Alias lines: ${aliases.map((alias) => aliasCommandLine(alias)).join(" | ")}`
      : "Alias lines: (none)";

  summaryBox("Quickstart Complete", [
    aliasSummary,
    aliasCommands,
    `Run: source ${rcFilePath}`,
  ]);
}
