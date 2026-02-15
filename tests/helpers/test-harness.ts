import { afterEach, beforeEach } from "bun:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { JazzConfig } from "../../src/lib/config.js";
import { writeStoredConfig } from "../../src/lib/config.js";
import { runCommand } from "../../src/lib/process.js";

export interface RepoPair {
  root: string;
  remote: string;
  local: string;
  peer: string;
}

export interface FetchCall {
  body: string;
  method: string;
  url: string;
}

const TRACKED_ENV_KEYS = [
  "ANTHROPIC_API_KEY",
  "GEMINI_API_KEY",
  "GJ_AI_MODEL",
  "GJ_AI_PROVIDER",
  "GJ_CONFIG_PATH",
  "GJ_FAST_MODEL",
  "GJ_SMART_MODEL",
  "GOOGLE_API_KEY",
  "OPENAI_API_KEY",
] as const;

type TrackedEnvKey = (typeof TRACKED_ENV_KEYS)[number];

export function setupIsolatedRuntime(): void {
  const envSnapshot: Partial<Record<TrackedEnvKey, string>> = {};
  let originalCwd = process.cwd();
  let originalFetch = globalThis.fetch;

  beforeEach(() => {
    originalCwd = process.cwd();
    originalFetch = globalThis.fetch;
    for (const key of TRACKED_ENV_KEYS) {
      envSnapshot[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    process.chdir(originalCwd);
    globalThis.fetch = originalFetch;
    for (const key of TRACKED_ENV_KEYS) {
      const previous = envSnapshot[key];
      if (previous === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previous;
      }
    }
  });
}

export async function withRepoCwd<T>(
  repoPath: string,
  task: () => Promise<T>
): Promise<T> {
  const previous = process.cwd();
  process.chdir(repoPath);
  try {
    return await task();
  } finally {
    process.chdir(previous);
  }
}

export function git(
  cwd: string,
  args: string[],
  allowFailure = false
): Promise<{ code: number; stdout: string; stderr: string }> {
  return runCommand("git", args, { allowFailure, cwd });
}

async function configureGitIdentity(repoPath: string): Promise<void> {
  await git(repoPath, ["config", "user.name", "Git Jazz Test"]);
  await git(repoPath, ["config", "user.email", "test@git-jazz.local"]);
}

export async function commitAll(
  repoPath: string,
  message: string
): Promise<void> {
  await git(repoPath, ["add", "."]);
  await git(repoPath, ["commit", "-m", message]);
}

export async function latestCommitMessage(
  repoPath: string,
  ref = "HEAD"
): Promise<string> {
  const result = await git(repoPath, ["log", ref, "-1", "--pretty=%s"]);
  return result.stdout.trim();
}

export async function latestCommitHash(repoPath: string): Promise<string> {
  const result = await git(repoPath, ["rev-parse", "HEAD"]);
  return result.stdout.trim();
}

export async function setupRepoPair(name: string): Promise<RepoPair> {
  const root = await mkdtemp(path.join(tmpdir(), `gj-${name}-`));
  const remote = path.join(root, "remote.git");
  const local = path.join(root, "local");
  const peer = path.join(root, "peer");

  await git(root, ["init", "--bare", remote]);
  await git(root, ["clone", remote, local]);
  await git(root, ["clone", remote, peer]);

  await configureGitIdentity(local);
  await configureGitIdentity(peer);

  await git(local, ["checkout", "-b", "main"]);
  await writeFile(path.join(local, "app.txt"), "base\n", "utf8");
  await commitAll(local, "base");
  await git(local, ["push", "-u", "origin", "main"]);

  await git(peer, ["fetch", "origin", "main"]);
  await git(peer, ["checkout", "-B", "main", "origin/main"]);
  await git(local, ["checkout", "main"]);

  return { local, peer, remote, root };
}

export async function writeTestConfig(
  rootPath: string,
  config: JazzConfig
): Promise<string> {
  const configFile = path.join(rootPath, "gj-config.json");
  process.env.GJ_CONFIG_PATH = configFile;
  await writeStoredConfig(config);
  return configFile;
}

export function requestBodyFromInput(
  input: Request | URL | string,
  init: RequestInit | undefined
): Promise<string> {
  if (typeof init?.body === "string") {
    return Promise.resolve(init.body);
  }
  if (input instanceof Request) {
    return input.text();
  }
  return Promise.resolve("");
}

export function mockFetchWithOpenAiText(text: string): FetchCall[] {
  const calls: FetchCall[] = [];
  globalThis.fetch = async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    const method =
      init?.method || (input instanceof Request ? input.method : "GET");
    const rawBody = await requestBodyFromInput(input, init);
    calls.push({ body: rawBody, method, url });

    return new Response(
      JSON.stringify({
        choices: [{ message: { content: text } }],
      }),
      {
        headers: { "content-type": "application/json" },
        status: 200,
      }
    );
  };
  return calls;
}
