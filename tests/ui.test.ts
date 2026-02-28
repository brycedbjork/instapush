import { describe, expect, test } from "bun:test";
import {
  createCommandChecklist,
  extractErrorMessage,
  fatal,
  success,
  warn,
} from "../src/lib/ui.js";

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

  test("checklist redraw uses cursor-up sequence for clear", async () => {
    const writes: string[] = [];
    const stdout = process.stdout;
    const originalWrite = stdout.write;
    const originalIsTTY = stdout.isTTY;

    (stdout as { isTTY?: boolean }).isTTY = true;
    (stdout as { write: typeof stdout.write }).write = ((
      chunk: string | Uint8Array
    ) => {
      writes.push(
        typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8")
      );
      return true;
    }) as typeof stdout.write;

    try {
      const checklist = createCommandChecklist(
        "commit",
        "Create AI commit(s) from current changes."
      );
      await checklist.step("Validate repo", async () => undefined);
      checklist.finish();
    } finally {
      (stdout as { write: typeof stdout.write }).write = originalWrite;
      (stdout as { isTTY?: boolean }).isTTY = originalIsTTY;
    }

    const rendered = writes.join("");
    const cursorUpChunks = writes.filter(
      (chunk) =>
        chunk.includes("\u001B[") &&
        chunk.includes("A\r") &&
        !chunk.includes("F")
    );
    expect(cursorUpChunks.length).toBeGreaterThan(0);
    expect(rendered.includes("\u001B[6F")).toBe(false);
  });
});
