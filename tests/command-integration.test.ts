import { describe, expect, test } from "bun:test";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { runCommitCommand } from "../src/commands/commit.js";
import { runMergeCommand } from "../src/commands/merge.js";
import { runPullCommand } from "../src/commands/pull.js";
import { runPushCommand } from "../src/commands/push.js";
import {
  commitAll,
  git,
  latestCommitHash,
  latestCommitMessage,
  mockFetchWithOpenAiText,
  setupIsolatedRuntime,
  setupRepoPair,
  withRepoCwd,
  writeTestConfig,
} from "./helpers/test-harness.js";

setupIsolatedRuntime();

describe("user promise: command workflows are safe and predictable", () => {
  test("runCommitCommand creates commit with AI-generated message", async () => {
    const repos = await setupRepoPair("commit-command");
    await writeTestConfig(repos.root, {
      apiKey: "openai-test-key",
      fastModel: "commit-fast-model",
      provider: "openai",
      smartModel: "merge-smart-model",
    });
    mockFetchWithOpenAiText("ai commit message");

    await writeFile(
      path.join(repos.local, "app.txt"),
      "local-change\n",
      "utf8"
    );

    await withRepoCwd(repos.local, async () => {
      await runCommitCommand();
    });

    expect(await latestCommitMessage(repos.local)).toBe("ai commit message");
  });

  test("runCommitCommand skips commit when there are no changes", async () => {
    const repos = await setupRepoPair("commit-no-changes");
    const beforeHash = await latestCommitHash(repos.local);
    globalThis.fetch = () =>
      Promise.reject(
        new Error("AI should not be called when there are no changes.")
      );

    await withRepoCwd(repos.local, async () => {
      await runCommitCommand();
    });

    const afterHash = await latestCommitHash(repos.local);
    expect(afterHash).toBe(beforeHash);
  });

  test("runPushCommand commits and pushes to upstream", async () => {
    const repos = await setupRepoPair("push-command");
    await writeTestConfig(repos.root, {
      apiKey: "openai-test-key",
      fastModel: "push-fast-model",
      provider: "openai",
      smartModel: "merge-smart-model",
    });
    mockFetchWithOpenAiText("push commit message");

    await writeFile(path.join(repos.local, "app.txt"), "push-change\n", "utf8");

    await withRepoCwd(repos.local, async () => {
      await runPushCommand();
    });

    await git(repos.peer, ["fetch", "origin", "main"]);
    const remoteMessage = await latestCommitMessage(repos.peer, "origin/main");
    expect(remoteMessage).toBe("push commit message");
  });

  test("runPushCommand pushes existing commits when no staged changes exist", async () => {
    const repos = await setupRepoPair("push-no-stage");
    await writeFile(
      path.join(repos.local, "app.txt"),
      "manual-local-commit\n",
      "utf8"
    );
    await commitAll(repos.local, "manual local commit");
    globalThis.fetch = () =>
      Promise.reject(
        new Error("AI should not be called without staged changes.")
      );

    await withRepoCwd(repos.local, async () => {
      await runPushCommand();
    });

    await git(repos.peer, ["fetch", "origin", "main"]);
    const remoteMessage = await latestCommitMessage(repos.peer, "origin/main");
    expect(remoteMessage).toBe("manual local commit");
  });

  test("runPullCommand pulls latest changes from origin", async () => {
    const repos = await setupRepoPair("pull-command");

    await writeFile(path.join(repos.peer, "app.txt"), "peer-change\n", "utf8");
    await commitAll(repos.peer, "peer update");
    await git(repos.peer, ["push", "origin", "main"]);

    const logLines: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => {
      logLines.push(args.join(" "));
    };
    try {
      await withRepoCwd(repos.local, async () => {
        await runPullCommand({ remote: "origin" });
      });
    } finally {
      console.log = originalLog;
    }

    const localFile = await readFile(path.join(repos.local, "app.txt"), "utf8");
    expect(localFile).toBe("peer-change\n");
    expect(logLines.some((line) => line.includes("peer update"))).toBe(true);
  });

  test("runPullCommand supports custom remote names", async () => {
    const repos = await setupRepoPair("pull-custom-remote");
    await git(repos.local, ["remote", "add", "backup", repos.remote]);

    await writeFile(
      path.join(repos.peer, "app.txt"),
      "backup-change\n",
      "utf8"
    );
    await commitAll(repos.peer, "backup remote update");
    await git(repos.peer, ["push", "origin", "main"]);

    await withRepoCwd(repos.local, async () => {
      await runPullCommand({ remote: "backup" });
    });

    const localFile = await readFile(path.join(repos.local, "app.txt"), "utf8");
    expect(localFile).toBe("backup-change\n");
  });

  test("runMergeCommand rejects when working tree is dirty", async () => {
    const repos = await setupRepoPair("merge-dirty-worktree");
    await writeFile(
      path.join(repos.local, "app.txt"),
      "dirty-change\n",
      "utf8"
    );

    await expect(
      withRepoCwd(repos.local, async () => {
        await runMergeCommand({ target: "origin/main" });
      })
    ).rejects.toThrow("Working tree has uncommitted changes");
  });

  test("runMergeCommand surfaces non-conflict merge failures", async () => {
    const repos = await setupRepoPair("merge-missing-target");

    await expect(
      withRepoCwd(repos.local, async () => {
        await runMergeCommand({ target: "origin/branch-that-does-not-exist" });
      })
    ).rejects.toThrow("Merge failed before conflict resolution");
  });

  test("runMergeCommand resolves conflicts with AI and commits merge", async () => {
    const repos = await setupRepoPair("merge-smart");
    await writeTestConfig(repos.root, {
      apiKey: "openai-test-key",
      fastModel: "push-fast-model",
      provider: "openai",
      smartModel: "merge-smart-model",
    });
    const calls = mockFetchWithOpenAiText("local-change\npeer-change");

    await git(repos.peer, ["checkout", "-b", "topic"]);
    await writeFile(path.join(repos.peer, "app.txt"), "peer-change\n", "utf8");
    await commitAll(repos.peer, "topic change");
    await git(repos.peer, ["push", "-u", "origin", "topic"]);

    await git(repos.local, ["checkout", "main"]);
    await writeFile(
      path.join(repos.local, "app.txt"),
      "local-change\n",
      "utf8"
    );
    await commitAll(repos.local, "local main change");

    await withRepoCwd(repos.local, async () => {
      await runMergeCommand({ target: "origin/topic" });
    });

    const mergedFile = await readFile(
      path.join(repos.local, "app.txt"),
      "utf8"
    );
    expect(mergedFile).toContain("local-change");
    expect(mergedFile).toContain("peer-change");
    expect(mergedFile.includes("<<<<<<<")).toBe(false);

    const unresolved = await git(repos.local, [
      "diff",
      "--name-only",
      "--diff-filter=U",
    ]);
    expect(unresolved.stdout).toBe("");

    const parentLine = await git(repos.local, ["log", "-1", "--pretty=%P"]);
    expect(parentLine.stdout.trim().split(" ").length).toBeGreaterThanOrEqual(
      2
    );

    const payload = JSON.parse(calls[0]?.body ?? "{}");
    expect(payload.model).toBe("merge-smart-model");
  });

  test("runMergeCommand aborts merge state when AI output is invalid", async () => {
    const repos = await setupRepoPair("merge-abort");
    await writeTestConfig(repos.root, {
      apiKey: "openai-test-key",
      fastModel: "push-fast-model",
      provider: "openai",
      smartModel: "merge-smart-model",
    });
    mockFetchWithOpenAiText("<<<<<<< unresolved");

    await git(repos.peer, ["checkout", "-b", "topic"]);
    await writeFile(path.join(repos.peer, "app.txt"), "peer-side\n", "utf8");
    await commitAll(repos.peer, "topic change");
    await git(repos.peer, ["push", "-u", "origin", "topic"]);

    await git(repos.local, ["checkout", "main"]);
    await writeFile(path.join(repos.local, "app.txt"), "local-side\n", "utf8");
    await commitAll(repos.local, "local change");

    await expect(
      withRepoCwd(repos.local, async () => {
        await runMergeCommand({ target: "origin/topic" });
      })
    ).rejects.toThrow("unresolved markers");

    const mergeHead = await git(
      repos.local,
      ["rev-parse", "-q", "--verify", "MERGE_HEAD"],
      true
    );
    expect(mergeHead.code).not.toBe(0);

    const status = await git(repos.local, ["status", "--porcelain"]);
    expect(status.stdout).toBe("");
  });
});
