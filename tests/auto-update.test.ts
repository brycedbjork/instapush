import { describe, expect, test } from "bun:test";
import { extractGithubRepoId } from "../src/lib/auto-update.js";

describe("user promise: auto-update tracks the canonical GitHub repo", () => {
  test("parses https GitHub remotes", () => {
    expect(
      extractGithubRepoId("https://github.com/north-brook/git-jazz.git")
    ).toBe("north-brook/git-jazz");
    expect(
      extractGithubRepoId("https://github.com/north-brook/git-jazz/")
    ).toBe("north-brook/git-jazz");
  });

  test("parses ssh GitHub remotes", () => {
    expect(extractGithubRepoId("git@github.com:north-brook/git-jazz.git")).toBe(
      "north-brook/git-jazz"
    );
    expect(
      extractGithubRepoId("ssh://git@github.com/north-brook/git-jazz.git")
    ).toBe("north-brook/git-jazz");
  });

  test("returns null for non-github remotes", () => {
    expect(
      extractGithubRepoId("https://gitlab.com/north-brook/git-jazz.git")
    ).toBe(null);
    expect(extractGithubRepoId("")).toBe(null);
  });
});
