import { describe, expect, test } from "bun:test";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { runCommitCommand } from "../src/commands/commit.js";
import { runMergeCommand } from "../src/commands/merge.js";
import { runPullCommand } from "../src/commands/pull.js";
import { runPushCommand } from "../src/commands/push.js";
import { runStatusCommand } from "../src/commands/status.js";
import {
  commitAll,
  git,
  latestCommitHash,
  latestCommitMessage,
  mockFetchWithOpenAiText,
  mockFetchWithOpenAiTexts,
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
    mockFetchWithOpenAiText('{"message":"ai commit message"}');

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

  test("runCommitCommand normalizes fenced JSON into a commit subject", async () => {
    const repos = await setupRepoPair("commit-json-wrapper");
    await writeTestConfig(repos.root, {
      apiKey: "openai-test-key",
      fastModel: "commit-fast-model",
      provider: "openai",
      smartModel: "merge-smart-model",
    });
    mockFetchWithOpenAiText(
      '{"message":"```json\\n{\\"message\\":\\"fix: sanitize wrapped ai output\\"}\\n```"}'
    );

    await writeFile(
      path.join(repos.local, "app.txt"),
      "json-wrapper-change\n",
      "utf8"
    );
    await withRepoCwd(repos.local, async () => {
      await runCommitCommand();
    });

    expect(await latestCommitMessage(repos.local)).toBe(
      "fix: sanitize wrapped ai output"
    );
  });

  test("runCommitCommand rejects unusable wrapper output", async () => {
    const repos = await setupRepoPair("commit-invalid-wrapper");
    const beforeHash = await latestCommitHash(repos.local);
    await writeTestConfig(repos.root, {
      apiKey: "openai-test-key",
      fastModel: "commit-fast-model",
      provider: "openai",
      smartModel: "merge-smart-model",
    });
    mockFetchWithOpenAiText('{"message":"```json"}');

    await writeFile(
      path.join(repos.local, "app.txt"),
      "invalid-wrapper-change\n",
      "utf8"
    );

    await expect(
      withRepoCwd(repos.local, async () => {
        await runCommitCommand();
      })
    ).rejects.toThrow("AI returned an empty commit message.");

    const afterHash = await latestCommitHash(repos.local);
    expect(afterHash).toBe(beforeHash);
  });

  test("runCommitCommand rejects plain fence headers in plan fallback", async () => {
    const repos = await setupRepoPair("commit-invalid-plan-fallback");
    const beforeHash = await latestCommitHash(repos.local);
    await writeTestConfig(repos.root, {
      apiKey: "openai-test-key",
      fastModel: "commit-fast-model",
      provider: "openai",
      smartModel: "merge-smart-model",
    });
    mockFetchWithOpenAiText("```json");

    await writeFile(
      path.join(repos.local, "app.txt"),
      "invalid-plan-fallback\n",
      "utf8"
    );

    await expect(
      withRepoCwd(repos.local, async () => {
        await runCommitCommand();
      })
    ).rejects.toThrow("AI returned an empty commit message.");

    const afterHash = await latestCommitHash(repos.local);
    expect(afterHash).toBe(beforeHash);
  });

  test("runCommitCommand recovers from bare JSON token in plan fallback", async () => {
    const repos = await setupRepoPair("commit-plan-bare-json-token");
    await writeTestConfig(repos.root, {
      apiKey: "openai-test-key",
      fastModel: "commit-fast-model",
      provider: "openai",
      smartModel: "merge-smart-model",
    });
    mockFetchWithOpenAiTexts([
      "{",
      '{"message":"fix: recover from malformed ai output"}',
    ]);

    await writeFile(
      path.join(repos.local, "app.txt"),
      "plan-bare-json-token\n",
      "utf8"
    );

    await withRepoCwd(repos.local, async () => {
      await runCommitCommand();
    });

    expect(await latestCommitMessage(repos.local)).toBe(
      "fix: recover from malformed ai output"
    );
  });

  test("runCommitCommand recovers when plan has no structured output", async () => {
    const repos = await setupRepoPair("commit-plan-no-structured-output");
    await writeTestConfig(repos.root, {
      apiKey: "openai-test-key",
      fastModel: "commit-fast-model",
      provider: "openai",
      smartModel: "merge-smart-model",
    });

    let callCount = 0;
    globalThis.fetch = () => {
      callCount += 1;
      const content =
        callCount === 1
          ? null
          : '{"message":"fix: recover when plan has no output"}';

      return new Response(
        JSON.stringify({
          id: "chatcmpl-test",
          choices: [
            {
              finish_reason: "stop",
              index: 0,
              message: { content, role: "assistant" },
            },
          ],
          created: 0,
          model: "mock-model",
        }),
        {
          headers: { "content-type": "application/json" },
          status: 200,
        }
      );
    };

    await writeFile(
      path.join(repos.local, "app.txt"),
      "plan-no-structured-output\n",
      "utf8"
    );

    await withRepoCwd(repos.local, async () => {
      await runCommitCommand();
    });

    expect(await latestCommitMessage(repos.local)).toBe(
      "fix: recover when plan has no output"
    );
  });

  test("runCommitCommand segments unrelated changes into multiple commits", async () => {
    const repos = await setupRepoPair("commit-segmented");
    await writeTestConfig(repos.root, {
      apiKey: "openai-test-key",
      fastModel: "commit-fast-model",
      provider: "openai",
      smartModel: "merge-smart-model",
    });
    const calls = mockFetchWithOpenAiText(
      JSON.stringify({
        commits: [
          {
            files: ["feature.txt"],
            message: "feat: add feature file",
          },
          {
            files: ["README.md"],
            message: "docs: add readme notes",
          },
        ],
      })
    );

    await writeFile(path.join(repos.local, "feature.txt"), "feature\n", "utf8");
    await writeFile(path.join(repos.local, "README.md"), "notes\n", "utf8");

    await withRepoCwd(repos.local, async () => {
      await runCommitCommand();
    });

    const log = await git(repos.local, ["log", "-2", "--pretty=%s"]);
    expect(log.stdout.trim().split("\n")).toEqual([
      "docs: add readme notes",
      "feat: add feature file",
    ]);
    expect(calls.length).toBe(1);
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
    mockFetchWithOpenAiText('{"message":"push commit message"}');

    await writeFile(path.join(repos.local, "app.txt"), "push-change\n", "utf8");

    await withRepoCwd(repos.local, async () => {
      await runPushCommand();
    });

    await git(repos.peer, ["fetch", "origin", "main"]);
    const remoteMessage = await latestCommitMessage(repos.peer, "origin/main");
    expect(remoteMessage).toBe("push commit message");
  });

  test("runPushCommand segments and pushes multiple commits", async () => {
    const repos = await setupRepoPair("push-segmented");
    await writeTestConfig(repos.root, {
      apiKey: "openai-test-key",
      fastModel: "push-fast-model",
      provider: "openai",
      smartModel: "merge-smart-model",
    });
    const calls = mockFetchWithOpenAiText(
      JSON.stringify({
        commits: [
          {
            files: ["app.txt"],
            message: "feat: update app content",
          },
          {
            files: ["CHANGELOG.md"],
            message: "docs: add changelog",
          },
        ],
      })
    );

    await writeFile(path.join(repos.local, "app.txt"), "push-change\n", "utf8");
    await writeFile(
      path.join(repos.local, "CHANGELOG.md"),
      "initial changelog\n",
      "utf8"
    );

    await withRepoCwd(repos.local, async () => {
      await runPushCommand();
    });

    await git(repos.peer, ["fetch", "origin", "main"]);
    const remoteLog = await git(repos.peer, [
      "log",
      "origin/main",
      "-2",
      "--pretty=%s",
    ]);
    expect(remoteLog.stdout.trim().split("\n")).toEqual([
      "docs: add changelog",
      "feat: update app content",
    ]);
    expect(calls.length).toBe(1);
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
    globalThis.fetch = () => Promise.reject(new Error("offline test fallback"));

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
    globalThis.fetch = () => Promise.reject(new Error("offline test fallback"));
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

  test("runPullCommand summarizes incoming changes with fast model", async () => {
    const repos = await setupRepoPair("pull-ai-summary");
    await writeTestConfig(repos.root, {
      apiKey: "openai-test-key",
      fastModel: "pull-fast-model",
      provider: "openai",
      smartModel: "merge-smart-model",
    });
    const calls = mockFetchWithOpenAiText(
      [
        "Payment and auth updates are landing from origin/main.",
        "Most churn is in app.txt with small surface area.",
        "Risk looks low; verify login and billing paths after pull.",
      ].join("\n")
    );

    await writeFile(path.join(repos.peer, "app.txt"), "peer-change\n", "utf8");
    await commitAll(repos.peer, "peer update for summary");
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

    const payload = JSON.parse(calls[0]?.body ?? "{}");
    expect(payload.model).toBe("pull-fast-model");
    expect(
      logLines.some((line) => line.includes("Payment and auth updates"))
    ).toBe(true);
  });

  test("runPullCommand skips AI summary when there are no incoming commits", async () => {
    const repos = await setupRepoPair("pull-up-to-date");
    let fetchCalls = 0;
    globalThis.fetch = () => {
      fetchCalls += 1;
      return Promise.reject(new Error("AI should not be called."));
    };

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

    expect(fetchCalls).toBe(0);
    expect(logLines.some((line) => line.includes("Already up to date"))).toBe(
      true
    );
  });

  test("runPullCommand falls back when AI summary request fails", async () => {
    const repos = await setupRepoPair("pull-ai-fallback");
    await writeTestConfig(repos.root, {
      apiKey: "openai-test-key",
      fastModel: "pull-fast-model",
      provider: "openai",
      smartModel: "merge-smart-model",
    });
    globalThis.fetch = () => Promise.reject(new Error("network down"));

    await writeFile(path.join(repos.peer, "app.txt"), "peer-change\n", "utf8");
    await commitAll(repos.peer, "peer update for fallback");
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
    expect(
      logLines.some((line) => line.includes("peer update for fallback"))
    ).toBe(true);
    expect(
      logLines.some((line) => line.includes("AI summary unavailable"))
    ).toBe(true);
  });

  test("runStatusCommand summarizes changed tree with fast model", async () => {
    const repos = await setupRepoPair("status-command");
    await writeTestConfig(repos.root, {
      apiKey: "openai-test-key",
      fastModel: "status-fast-model",
      provider: "openai",
      smartModel: "merge-smart-model",
    });
    const calls = mockFetchWithOpenAiText(
      [
        "You have tracked updates plus an untracked file.",
        "app.txt has local edits not yet staged.",
        "notes.txt is new and still untracked.",
        "Stage app.txt and notes.txt together if they belong in one commit.",
      ].join("\n")
    );

    await writeFile(
      path.join(repos.local, "app.txt"),
      "local-change\n",
      "utf8"
    );
    await writeFile(path.join(repos.local, "notes.txt"), "draft\n", "utf8");

    const logLines: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => {
      logLines.push(args.join(" "));
    };

    try {
      await withRepoCwd(repos.local, async () => {
        await runStatusCommand();
      });
    } finally {
      console.log = originalLog;
    }

    const payload = JSON.parse(calls[0]?.body ?? "{}");
    expect(payload.model).toBe("status-fast-model");
    expect(logLines.some((line) => line.includes("untracked file"))).toBe(true);
    expect(logLines.some((line) => line.includes("notes.txt"))).toBe(true);
  });

  test("runStatusCommand shows clean state without AI call", async () => {
    const repos = await setupRepoPair("status-clean");
    globalThis.fetch = () =>
      Promise.reject(
        new Error("AI should not be called when working tree is clean.")
      );

    const logLines: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => {
      logLines.push(args.join(" "));
    };

    try {
      await withRepoCwd(repos.local, async () => {
        await runStatusCommand();
      });
    } finally {
      console.log = originalLog;
    }

    expect(logLines.some((line) => line.includes("Working tree clean"))).toBe(
      true
    );
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
    const calls = mockFetchWithOpenAiText(
      '{"resolution":"local-change\\npeer-change"}'
    );

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
    mockFetchWithOpenAiText('{"resolution":"<<<<<<< unresolved"}');

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
