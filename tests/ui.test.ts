import { describe, expect, test } from "bun:test";
import { extractErrorMessage, fatal, success, warn } from "../src/lib/ui.js";

describe("user promise: terminal UX communicates state clearly", () => {
  test("extractErrorMessage handles known and unknown errors", () => {
    expect(extractErrorMessage(new Error("known"))).toBe("known");
    expect(extractErrorMessage("not-an-error")).toBe("Unknown error.");
  });

  test("success/warn/fatal emit expected text", () => {
    const logLines: string[] = [];
    const errorLines: string[] = [];
    const originalLog = console.log;
    const originalError = console.error;
    console.log = (...args: unknown[]) => {
      logLines.push(args.join(" "));
    };
    console.error = (...args: unknown[]) => {
      errorLines.push(args.join(" "));
    };

    try {
      success("ok");
      warn("watch");
      fatal("bad");
    } finally {
      console.log = originalLog;
      console.error = originalError;
    }

    expect(logLines.some((line) => line.includes("ok"))).toBe(true);
    expect(logLines.some((line) => line.includes("watch"))).toBe(true);
    expect(errorLines.some((line) => line.includes("bad"))).toBe(true);
  });
});
