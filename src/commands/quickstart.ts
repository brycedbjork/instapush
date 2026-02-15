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
  suggestedModelsForProvider,
  writeStoredConfig,
} from "../lib/config.js";
import { CliError } from "../lib/errors.js";
import { keyValue, renderBanner, summaryBox, withStep } from "../lib/ui.js";

const ALIAS_BLOCK_START = "# >>> git-jazz aliases >>>";
const ALIAS_BLOCK_END = "# <<< git-jazz aliases <<<";
const SUPPORTED_ALIAS_COMMANDS = ["push", "commit", "pull", "merge"] as const;

type SupportedAliasCommand = (typeof SUPPORTED_ALIAS_COMMANDS)[number];

function parseProvider(value: string): AiProvider | null {
  if (value === "1" || value.toLowerCase() === "openai") {
    return "openai";
  }
  if (value === "2" || value.toLowerCase() === "anthropic") {
    return "anthropic";
  }
  if (value === "3" || value.toLowerCase() === "google") {
    return "google";
  }
  return null;
}

function modelTierLabel(tier: ModelTier): string {
  return tier === "smart"
    ? "smart model for merge conflict resolution"
    : "fast model for commit message generation";
}

async function promptModelSelection(
  rl: ReturnType<typeof createInterface>,
  provider: AiProvider,
  tier: ModelTier,
  defaultModel: string
): Promise<string> {
  const candidates = suggestedModelsForProvider(provider, tier);
  const promptLines = [
    `Select ${modelTierLabel(tier)}:`,
    ...candidates.map((model, index) =>
      index === 0
        ? `  ${index + 1}) ${model} (recommended)`
        : `  ${index + 1}) ${model}`
    ),
    `  ${candidates.length + 1}) custom`,
    "Choice [1]: ",
  ];

  const selection = (await rl.question(promptLines.join("\n"))).trim() || "1";
  const parsedChoice = Number.parseInt(selection, 10);

  if (Number.isInteger(parsedChoice)) {
    if (parsedChoice >= 1 && parsedChoice <= candidates.length) {
      const selected = candidates[parsedChoice - 1];
      if (!selected) {
        throw new CliError("Invalid model selection.");
      }
      return selected;
    }
    if (parsedChoice === candidates.length + 1) {
      const custom = (
        await rl.question(
          `Enter custom ${modelTierLabel(tier)} [${defaultModel}]: `
        )
      ).trim();
      return custom || defaultModel;
    }
    throw new CliError("Invalid model selection.");
  }

  return selection;
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

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

function parseAliases(input: string): SupportedAliasCommand[] {
  const requested = unique(
    input
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0)
  );

  const selected: SupportedAliasCommand[] = [];
  for (const value of requested) {
    if (SUPPORTED_ALIAS_COMMANDS.includes(value as SupportedAliasCommand)) {
      selected.push(value as SupportedAliasCommand);
    }
  }
  return selected;
}

function renderAliasBlock(aliases: SupportedAliasCommand[]): string {
  const lines = aliases.map((command) => `alias ${command}="gj ${command}"`);
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

export async function runQuickstartCommand(): Promise<void> {
  renderBanner(
    "quickstart",
    "Configure AI provider, key, smart/fast models, and aliases."
  );

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    const providerPrompt = [
      "Select AI provider:",
      "  1) openai",
      "  2) anthropic",
      "  3) google",
      "Choice [1]: ",
    ].join("\n");

    const providerInput = (await rl.question(providerPrompt)).trim();
    const provider = parseProvider(providerInput || "1");
    if (!provider) {
      throw new CliError("Invalid provider selection.");
    }

    const apiKey = (await rl.question(`${provider} API key: `)).trim();
    if (!apiKey) {
      throw new CliError("API key cannot be empty.");
    }

    const defaultSmartModel = defaultSmartModelForProvider(provider);
    const smartModel = await promptModelSelection(
      rl,
      provider,
      "smart",
      defaultSmartModel
    );

    const defaultFastModel = defaultFastModelForProvider(provider);
    const fastModel = await promptModelSelection(
      rl,
      provider,
      "fast",
      defaultFastModel
    );

    const aliasModeInput = (
      await rl.question(
        [
          "Alias mode:",
          "  1) Install shell aliases (recommended)",
          "  2) No aliases, use 'gj <command>' directly",
          "Choice [1]: ",
        ].join("\n")
      )
    ).trim();
    const aliasMode = aliasModeInput || "1";
    if (aliasMode !== "1" && aliasMode !== "2") {
      throw new CliError("Invalid alias mode selection.");
    }

    let aliases: SupportedAliasCommand[] = [];
    if (aliasMode === "1") {
      const defaultAliasList = SUPPORTED_ALIAS_COMMANDS.join(",");
      const aliasInput = await rl.question(
        `Aliases to install [${defaultAliasList}]: `
      );
      aliases = parseAliases(aliasInput.trim() || defaultAliasList);
      if (aliases.length === 0) {
        throw new CliError(
          "No valid aliases selected. Allowed: push, commit, pull, merge."
        );
      }
    }

    const guessedRc = defaultShellRcFile();
    const rcInput = await rl.question(`Shell rc file [${guessedRc}]: `);
    const rcFilePath = path.resolve(rcInput.trim() || guessedRc);

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

    summaryBox("Quickstart Complete", [
      aliases.length > 0
        ? `Installed aliases: ${aliases.join(", ")}`
        : "No aliases installed. Use 'gj <command>'.",
      `Run: source ${rcFilePath}`,
    ]);
  } finally {
    rl.close();
  }
}
