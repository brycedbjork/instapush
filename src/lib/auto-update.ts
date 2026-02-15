import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runCommand } from "./process.js";
import { info, warn } from "./ui.js";

const DEFAULT_REPO_URL = "https://github.com/north-brook/git-jazz.git";
const LEGACY_REPO_ID = "brycedbjork/git-jazz";
const AUTO_UPDATE_DISABLE_ENV = "GJ_DISABLE_AUTO_UPDATE";
const AUTO_UPDATE_SKIP_ENV = "GJ_SKIP_AUTO_UPDATE";
const TRAILING_SLASH_PATTERN = /\/+$/;
const GIT_SUFFIX_PATTERN = /\.git$/;

const INSTALL_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  ".."
);

function normalizeRemoteUrl(remoteUrl: string): string {
  return remoteUrl.trim().replace(TRAILING_SLASH_PATTERN, "");
}

export function extractGithubRepoId(remoteUrl: string): string | null {
  const normalized = normalizeRemoteUrl(remoteUrl).replace(
    GIT_SUFFIX_PATTERN,
    ""
  );

  if (normalized.startsWith("git@github.com:")) {
    const pathPart = normalized.slice("git@github.com:".length);
    return pathPart || null;
  }

  if (normalized.startsWith("https://github.com/")) {
    const pathPart = normalized.slice("https://github.com/".length);
    return pathPart || null;
  }

  if (normalized.startsWith("ssh://git@github.com/")) {
    const pathPart = normalized.slice("ssh://git@github.com/".length);
    return pathPart || null;
  }

  return null;
}

function configuredRepoUrl(): string {
  return process.env.GJ_REPO_URL || DEFAULT_REPO_URL;
}

async function readOriginUrl(repoRoot: string): Promise<string | null> {
  const result = await runCommand(
    "git",
    ["-C", repoRoot, "remote", "get-url", "origin"],
    { allowFailure: true }
  );
  if (result.code !== 0) {
    return null;
  }
  return result.stdout.trim() || null;
}

async function setOriginUrl(
  repoRoot: string,
  remoteUrl: string
): Promise<void> {
  const result = await runCommand(
    "git",
    ["-C", repoRoot, "remote", "set-url", "origin", remoteUrl],
    { allowFailure: true }
  );
  if (result.code !== 0) {
    warn("Auto-update: failed to retarget origin remote.");
  }
}

async function ensureOriginTarget(repoRoot: string): Promise<boolean> {
  const targetRepoUrl = configuredRepoUrl();
  const targetRepoId = extractGithubRepoId(targetRepoUrl);
  if (!targetRepoId) {
    return false;
  }

  const originUrl = await readOriginUrl(repoRoot);
  if (!originUrl) {
    return false;
  }

  const originRepoId = extractGithubRepoId(originUrl);
  if (!originRepoId) {
    warn("Auto-update: origin is not a GitHub remote. Skipping.");
    return false;
  }

  if (originRepoId === LEGACY_REPO_ID) {
    await setOriginUrl(repoRoot, targetRepoUrl);
    return true;
  }

  if (originRepoId !== targetRepoId) {
    warn(
      `Auto-update: origin ${originRepoId} is not ${targetRepoId}. Skipping.`
    );
    return false;
  }

  return true;
}

async function isGitWorkTree(repoRoot: string): Promise<boolean> {
  const result = await runCommand(
    "git",
    ["-C", repoRoot, "rev-parse", "--is-inside-work-tree"],
    { allowFailure: true }
  );
  return result.code === 0 && result.stdout.trim() === "true";
}

async function hasLocalChanges(repoRoot: string): Promise<boolean> {
  const result = await runCommand(
    "git",
    ["-C", repoRoot, "status", "--porcelain"],
    {
      allowFailure: true,
    }
  );
  return result.code !== 0 || result.stdout.length > 0;
}

async function fetchMain(repoRoot: string): Promise<boolean> {
  const result = await runCommand(
    "git",
    ["-C", repoRoot, "fetch", "origin", "main"],
    { allowFailure: true }
  );
  return result.code === 0;
}

async function revision(repoRoot: string, ref: string): Promise<string | null> {
  const result = await runCommand("git", ["-C", repoRoot, "rev-parse", ref], {
    allowFailure: true,
  });
  if (result.code !== 0) {
    return null;
  }
  return result.stdout.trim() || null;
}

async function pullLatest(repoRoot: string): Promise<boolean> {
  const result = await runCommand(
    "git",
    ["-C", repoRoot, "pull", "--ff-only", "origin", "main"],
    { allowFailure: true }
  );
  return result.code === 0;
}

async function installDependencies(repoRoot: string): Promise<void> {
  const installResult = await runCommand("bun", ["install"], {
    allowFailure: true,
    cwd: repoRoot,
  });
  if (installResult.code !== 0) {
    warn(
      "Auto-update: dependency install failed; continuing with current runtime."
    );
  }
}

export async function autoUpdateInstalledVersion(): Promise<boolean> {
  if (
    process.env[AUTO_UPDATE_DISABLE_ENV] === "1" ||
    process.env[AUTO_UPDATE_SKIP_ENV] === "1"
  ) {
    return false;
  }

  if (process.cwd() === INSTALL_ROOT) {
    return false;
  }

  if (!(await isGitWorkTree(INSTALL_ROOT))) {
    return false;
  }

  if (!(await ensureOriginTarget(INSTALL_ROOT))) {
    return false;
  }

  if (await hasLocalChanges(INSTALL_ROOT)) {
    warn("Auto-update: local changes detected in install; skipping.");
    return false;
  }

  if (!(await fetchMain(INSTALL_ROOT))) {
    warn("Auto-update: failed to fetch origin/main.");
    return false;
  }

  const localHead = await revision(INSTALL_ROOT, "HEAD");
  const remoteHead = await revision(INSTALL_ROOT, "FETCH_HEAD");
  if (!(localHead && remoteHead) || localHead === remoteHead) {
    return false;
  }

  info("Auto-update: installing latest git-jazz from origin/main...");
  if (!(await pullLatest(INSTALL_ROOT))) {
    warn("Auto-update: pull --ff-only failed.");
    return false;
  }

  await installDependencies(INSTALL_ROOT);
  return true;
}

async function relaunchCurrentProcess(): Promise<number | null> {
  const runner = process.argv[0];
  const script = process.argv[1];
  if (!(runner && script)) {
    return null;
  }

  const child = spawn(runner, [script, ...process.argv.slice(2)], {
    env: {
      ...process.env,
      [AUTO_UPDATE_SKIP_ENV]: "1",
    },
    stdio: "inherit",
  });

  return await new Promise<number | null>((resolve) => {
    child.once("error", () => resolve(null));
    child.once("close", (code) => resolve(code ?? 1));
  });
}

export async function autoUpdateAndMaybeRelaunch(): Promise<never | undefined> {
  const updated = await autoUpdateInstalledVersion();
  if (!updated) {
    return;
  }

  const nextCode = await relaunchCurrentProcess();
  if (nextCode === null) {
    warn(
      "Auto-update: failed to relaunch process; continuing current invocation."
    );
    return;
  }

  process.exit(nextCode);
}
