import { describe, expect, test } from "bun:test";
import { normalizeGeneratedCommitMessage } from "../src/lib/commit-message.js";

describe("normalizeGeneratedCommitMessage", () => {
  test("keeps a valid one-line message", () => {
    expect(normalizeGeneratedCommitMessage("feat: add pull summaries")).toBe(
      "feat: add pull summaries"
    );
  });

  test("unwraps quoted JSON string responses", () => {
    expect(
      normalizeGeneratedCommitMessage('"fix: trim ai commit output"')
    ).toBe("fix: trim ai commit output");
  });

  test("extracts from JSON objects", () => {
    expect(
      normalizeGeneratedCommitMessage(
        '{"message":"feat: handle malformed ai output"}'
      )
    ).toBe("feat: handle malformed ai output");
  });

  test("extracts from fenced JSON payloads", () => {
    expect(
      normalizeGeneratedCommitMessage(
        '```json\n{"message":"feat: parse wrapped commit text"}\n```'
      )
    ).toBe("feat: parse wrapped commit text");
  });

  test("returns empty for unusable fence headers", () => {
    expect(normalizeGeneratedCommitMessage('"```json"')).toBe("");
  });

  test("returns empty for bare JSON object fragments", () => {
    expect(normalizeGeneratedCommitMessage("{")).toBe("");
  });
});
