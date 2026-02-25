import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { generateCommitMessage } from "../src/lib/commit-message.js";
import { resolveConflictsInFile } from "../src/lib/conflict-resolution.js";
import {
  mockFetchWithOpenAiText,
  setupIsolatedRuntime,
  writeTestConfig,
} from "./helpers/test-harness.js";

setupIsolatedRuntime();

describe("user promise: AI writes clear commits and resolves conflicts safely", () => {
  test("generateCommitMessage uses fast model tier", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "gj-fast-tier-"));
    await writeTestConfig(root, {
      apiKey: "openai-test-key",
      fastModel: "commit-fast-model",
      provider: "openai",
      smartModel: "merge-smart-model",
    });

    const calls = mockFetchWithOpenAiText('{"message":" commit summary "}');
    const message = await generateCommitMessage("summary", "patch");

    expect(message).toBe("commit summary");
    const payload = JSON.parse(calls[0]?.body ?? "{}");
    expect(payload.model).toBe("commit-fast-model");
  });

  test("resolveConflictsInFile uses smart model tier and rewrites file", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "gj-smart-tier-"));
    const filePath = path.join(root, "conflicted.txt");
    await writeFile(
      filePath,
      [
        "line-a",
        "<<<<<<< HEAD",
        "ours-value",
        "=======",
        "theirs-value",
        ">>>>>>> origin/topic",
        "line-b",
        "",
      ].join("\n"),
      "utf8"
    );

    await writeTestConfig(root, {
      apiKey: "openai-test-key",
      fastModel: "commit-fast-model",
      provider: "openai",
      smartModel: "merge-smart-model",
    });

    const calls = mockFetchWithOpenAiText('{"resolution":"merged-value"}');
    await resolveConflictsInFile(filePath);

    const content = await readFile(filePath, "utf8");
    expect(content.includes("<<<<<<<")).toBe(false);
    expect(content.includes(">>>>>>>")).toBe(false);
    expect(content.includes("merged-value")).toBe(true);

    const payload = JSON.parse(calls[0]?.body ?? "{}");
    expect(payload.model).toBe("merge-smart-model");
  });

  test("resolveConflictsInFile rejects unresolved AI output", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "gj-conflict-bad-ai-"));
    const filePath = path.join(root, "conflicted.txt");
    await writeFile(
      filePath,
      [
        "<<<<<<< HEAD",
        "ours-value",
        "=======",
        "theirs-value",
        ">>>>>>> origin/topic",
        "",
      ].join("\n"),
      "utf8"
    );

    await writeTestConfig(root, {
      apiKey: "openai-test-key",
      fastModel: "commit-fast-model",
      provider: "openai",
      smartModel: "merge-smart-model",
    });

    mockFetchWithOpenAiText('{"resolution":"<<<<<<< still broken"}');
    await expect(resolveConflictsInFile(filePath)).rejects.toThrow(
      "Model returned unresolved markers"
    );
  });

  test("resolveConflictsInFile rejects files without conflict markers", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "gj-conflict-no-markers-"));
    const filePath = path.join(root, "plain.txt");
    await writeFile(filePath, "no conflicts here\n", "utf8");

    await expect(resolveConflictsInFile(filePath)).rejects.toThrow(
      "No conflict markers found"
    );
  });

  test("resolveConflictsInFile rejects malformed conflict markers", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "gj-conflict-malformed-"));
    const filePath = path.join(root, "broken.txt");
    await writeFile(
      filePath,
      ["<<<<<<< HEAD", "ours-value", "=======", "theirs-value", ""].join("\n"),
      "utf8"
    );

    await expect(resolveConflictsInFile(filePath)).rejects.toThrow(
      "missing >>>>>>> marker"
    );
  });

  test("resolveConflictsInFile strips fences and keeps newline semantics", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "gj-conflict-fenced-"));
    const filePath = path.join(root, "conflicted.txt");
    await writeFile(
      filePath,
      [
        "start",
        "<<<<<<< HEAD",
        "ours-value",
        "=======",
        "theirs-value",
        ">>>>>>> origin/topic",
        "end",
        "",
      ].join("\n"),
      "utf8"
    );

    await writeTestConfig(root, {
      apiKey: "openai-test-key",
      fastModel: "commit-fast-model",
      provider: "openai",
      smartModel: "merge-smart-model",
    });

    mockFetchWithOpenAiText('{"resolution":"```txt\\nmerged-value\\n```"}');
    await resolveConflictsInFile(filePath);

    const resolved = await readFile(filePath, "utf8");
    expect(resolved).toContain("merged-value\nend");
    expect(resolved.includes("```")).toBe(false);
  });
});
