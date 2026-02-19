import { planCommitGroups } from "./commit-plan.js";
import { CliError } from "./errors.js";
import { hasStagedChanges, runGit, shortHeadHash } from "./git.js";

export interface CreatedCommit {
  files: string[];
  hash: string;
  message: string;
}

type ChecklistStep = <T>(label: string, task: () => Promise<T>) => Promise<T>;

async function readStagedFiles(step: ChecklistStep): Promise<string[]> {
  const output = await step("Read staged files", async () => {
    const result = await runGit(["diff", "--staged", "--name-only"]);
    return result.stdout;
  });

  if (!output) {
    return [];
  }

  return output
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export async function createCommitsFromStagedChanges(
  step: ChecklistStep
): Promise<CreatedCommit[]> {
  const diffSummary = await step("Read diff summary", async () => {
    const result = await runGit(["diff", "--staged", "--stat"]);
    return result.stdout;
  });

  const diffChanges = await step("Read staged patch", async () => {
    const result = await runGit(["diff", "--staged", "--unified=0"]);
    return result.stdout;
  });

  const stagedFiles = await readStagedFiles(step);
  if (stagedFiles.length === 0) {
    return [];
  }

  const commitGroups = await step("Plan commit groups", async () =>
    planCommitGroups(stagedFiles, diffSummary, diffChanges)
  );

  await step("Prepare commit groups", async () => {
    await runGit(["reset"]);
  });

  const createdCommits: CreatedCommit[] = [];

  for (const [index, group] of commitGroups.entries()) {
    const sequenceLabel = `${index + 1}/${commitGroups.length}`;

    await step(`Stage commit ${sequenceLabel}`, async () => {
      await runGit(["add", "--", ...group.files]);
    });

    if (!(await hasStagedChanges())) {
      continue;
    }

    await step(`Create commit ${sequenceLabel}`, async () => {
      await runGit(["commit", "-m", group.message]);
    });

    const hash = await step(`Read hash ${sequenceLabel}`, async () =>
      shortHeadHash()
    );

    createdCommits.push({
      files: [...group.files],
      hash,
      message: group.message,
    });
  }

  if (createdCommits.length === 0) {
    throw new CliError("AI commit plan did not produce committable changes.");
  }

  return createdCommits;
}
