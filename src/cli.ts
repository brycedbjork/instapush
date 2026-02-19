#!/usr/bin/env bun

import { Command } from "commander";
import { runCommitCommand } from "./commands/commit.js";
import { runMergeCommand } from "./commands/merge.js";
import { runPullCommand } from "./commands/pull.js";
import { runPushCommand } from "./commands/push.js";
import { runSetupCommand } from "./commands/quickstart.js";
import { runStatusCommand } from "./commands/status.js";
import { autoUpdateAndMaybeRelaunch } from "./lib/auto-update.js";
import { CommandError } from "./lib/process.js";
import { extractErrorMessage, fatal } from "./lib/ui.js";

const program = new Command();

program
  .name("♪ GitJazz")
  .description("Beautiful AI-powered git commit/push/pull/merge workflows.")
  .version("0.1.0");

program
  .command("commit")
  .description("Stage all files and create an AI commit.")
  .action(async () => {
    await runCommitCommand();
  });

program
  .command("push")
  .description("Stage, AI commit, and push.")
  .action(async () => {
    await runPushCommand();
  });

program
  .command("pull")
  .description("Pull latest changes from origin for the current branch.")
  .option("-r, --remote <name>", "Remote name", "origin")
  .action(async (options: { remote?: string }) => {
    await runPullCommand(options);
  });

program
  .command("merge")
  .description(
    "Merge a target into current branch and auto-resolve conflicts with AI."
  )
  .option(
    "-t, --target <ref>",
    "Merge target (default: origin/<current-branch>)"
  )
  .action(async (options: { target?: string }) => {
    await runMergeCommand(options);
  });

program
  .command("setup")
  .description(
    "Interactive setup/update for provider, models, key, and aliases."
  )
  .alias("quickstart")
  .action(async () => {
    await runSetupCommand();
  });

program
  .command("status")
  .description("Summarize current git tree changes with the fast AI model.")
  .action(async () => {
    await runStatusCommand();
  });

function reportError(error: unknown): never {
  if (error instanceof CommandError) {
    const detail = error.result.stderr || error.result.stdout;
    fatal(detail ? `${error.message}\n${detail}` : error.message);
    process.exit(1);
  }

  fatal(extractErrorMessage(error));
  process.exit(1);
}

autoUpdateAndMaybeRelaunch()
  .then(() => program.parseAsync(process.argv))
  .catch(reportError);
