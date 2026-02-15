import { readFile, writeFile } from "node:fs/promises";
import { createCompletion } from "./ai.js";
import { CliError } from "./errors.js";

const SYSTEM_PROMPT = [
  "You resolve git merge conflicts in source files.",
  "Return only the exact replacement text for one conflict block.",
  "Do not include markdown or explanations.",
  "Preserve behavior and syntax.",
  "Keep both sides when both have valid, non-overlapping changes.",
].join(" ");

interface ConflictBlock {
  start: number;
  end: number;
  ours: string[];
  theirs: string[];
}

function linesWithTerminators(content: string): string[] {
  return content.match(/[^\n]*\n|[^\n]+$/g) ?? [];
}

function collectConflictBlocks(lines: string[]): ConflictBlock[] {
  const conflicts: ConflictBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    if (!lines[index]?.startsWith("<<<<<<< ")) {
      index += 1;
      continue;
    }

    const start = index;
    index += 1;
    const oursStart = index;

    while (index < lines.length && !lines[index]?.startsWith("=======")) {
      index += 1;
    }
    if (index >= lines.length) {
      throw new CliError("Malformed conflict block: missing ======= marker.");
    }
    const ours = lines.slice(oursStart, index);

    index += 1;
    const theirsStart = index;

    while (index < lines.length && !lines[index]?.startsWith(">>>>>>> ")) {
      index += 1;
    }
    if (index >= lines.length) {
      throw new CliError("Malformed conflict block: missing >>>>>>> marker.");
    }
    const theirs = lines.slice(theirsStart, index);
    const end = index;
    index += 1;

    conflicts.push({ start, end, ours, theirs });
  }

  return conflicts;
}

function stripCodeFences(content: string): string {
  const trimmed = content.trim();
  if (!(trimmed.startsWith("```") && trimmed.endsWith("```"))) {
    return content;
  }

  const lines = trimmed.split("\n");
  if (lines.length < 2 || lines.at(-1) !== "```") {
    return content;
  }

  return lines.slice(1, -1).join("\n");
}

function ensureTrailingNewline(
  resolution: string,
  ours: string[],
  theirs: string[]
): string {
  if (resolution.endsWith("\n")) {
    return resolution;
  }

  const oursEndsWithNewline = ours.at(-1)?.endsWith("\n") ?? false;
  const theirsEndsWithNewline = theirs.at(-1)?.endsWith("\n") ?? false;
  if (oursEndsWithNewline || theirsEndsWithNewline) {
    return `${resolution}\n`;
  }
  return resolution;
}

function buildPrompt(
  filePath: string,
  conflict: ConflictBlock,
  conflictIndex: number,
  totalConflicts: number,
  beforeContext: string,
  afterContext: string
): string {
  return [
    `File: ${filePath}`,
    `Conflict: ${conflictIndex}/${totalConflicts}`,
    "",
    "Context before conflict:",
    "<<CONTEXT_BEFORE>>",
    beforeContext,
    "<</CONTEXT_BEFORE>>",
    "",
    "Ours block:",
    "<<OURS>>",
    conflict.ours.join(""),
    "<</OURS>>",
    "",
    "Theirs block:",
    "<<THEIRS>>",
    conflict.theirs.join(""),
    "<</THEIRS>>",
    "",
    "Context after conflict:",
    "<<CONTEXT_AFTER>>",
    afterContext,
    "<</CONTEXT_AFTER>>",
    "",
    "Return only the merged replacement text for this conflict block.",
  ].join("\n");
}

async function resolveConflictBlock(
  filePath: string,
  conflict: ConflictBlock,
  conflictIndex: number,
  totalConflicts: number,
  beforeContext: string,
  afterContext: string
): Promise<string> {
  const prompt = buildPrompt(
    filePath,
    conflict,
    conflictIndex,
    totalConflicts,
    beforeContext,
    afterContext
  );

  const response = await createCompletion({
    systemPrompt: SYSTEM_PROMPT,
    userPrompt: prompt,
    modelTier: "smart",
    maxTokens: 2000,
    temperature: 0.1,
  });

  const cleaned = stripCodeFences(response);
  if (!cleaned.trim()) {
    throw new CliError(
      `Model returned empty resolution for conflict ${conflictIndex}/${totalConflicts}.`
    );
  }
  if (cleaned.includes("<<<<<<<") || cleaned.includes(">>>>>>>")) {
    throw new CliError(
      `Model returned unresolved markers for conflict ${conflictIndex}/${totalConflicts}.`
    );
  }

  return ensureTrailingNewline(cleaned, conflict.ours, conflict.theirs);
}

export async function resolveConflictsInFile(filePath: string): Promise<void> {
  const originalContent = await readFile(filePath, "utf8");
  const lines = linesWithTerminators(originalContent);
  const conflicts = collectConflictBlocks(lines);
  if (conflicts.length === 0) {
    throw new CliError(`No conflict markers found in '${filePath}'.`);
  }

  const resolvedSegments: string[] = [];
  let cursor = 0;

  for (const [zeroBasedIndex, conflict] of conflicts.entries()) {
    const conflictIndex = zeroBasedIndex + 1;
    const beforeContext = lines
      .slice(Math.max(0, conflict.start - 20), conflict.start)
      .join("");
    const afterContext = lines
      .slice(conflict.end + 1, Math.min(lines.length, conflict.end + 21))
      .join("");

    const resolution = await resolveConflictBlock(
      filePath,
      conflict,
      conflictIndex,
      conflicts.length,
      beforeContext,
      afterContext
    );

    resolvedSegments.push(lines.slice(cursor, conflict.start).join(""));
    resolvedSegments.push(resolution);
    cursor = conflict.end + 1;
  }

  resolvedSegments.push(lines.slice(cursor).join(""));
  await writeFile(filePath, resolvedSegments.join(""), "utf8");
}
