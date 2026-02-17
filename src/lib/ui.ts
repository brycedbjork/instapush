import { emitKeypressEvents } from "node:readline";
import { createInterface as createPromptInterface } from "node:readline/promises";
import boxen from "boxen";
import chalk from "chalk";
import ora from "ora";
import { CliError } from "./errors.js";

const ACCENT = chalk.cyanBright;
const SUCCESS = chalk.greenBright;
const WARNING = chalk.yellowBright;
const DANGER = chalk.redBright;
const MUTED = chalk.gray;
const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const ONE_BASED_NUMBER_PATTERN = /^\d+$/;

interface ChecklistStepState {
  label: string;
  status: "pending" | "running" | "done" | "failed";
}

interface CommandChecklist {
  finish: () => void;
  step: <T>(label: string, task: () => Promise<T>) => Promise<T>;
}

interface Keypress {
  name?: string;
  ctrl?: boolean;
}

export interface SelectOption<T> {
  label: string;
  value: T;
  hint?: string;
}

interface SelectPromptOptions<T> {
  message: string;
  options: SelectOption<T>[];
  helperText?: string;
  initialIndex?: number;
  input?: NodeJS.ReadStream;
  output?: NodeJS.WriteStream;
}

interface MultiSelectPromptOptions<T> {
  message: string;
  options: SelectOption<T>[];
  helperText?: string;
  initialValues?: T[];
  minimumSelections?: number;
  input?: NodeJS.ReadStream;
  output?: NodeJS.WriteStream;
}

export function renderBanner(commandName: string, subtitle: string): void {
  const heading = `${chalk.bold("♪ GitJazz")} ${MUTED("•")} ${ACCENT(commandName)}`;
  const body = `${heading}\n${MUTED(subtitle)}`;
  console.log("");
  console.log(
    boxen(body, {
      padding: { left: 1, right: 1, top: 0, bottom: 0 },
      margin: { top: 0, bottom: 1, left: 0, right: 0 },
      borderColor: "cyan",
      borderStyle: "round",
    })
  );
}

export async function withStep<T>(
  label: string,
  task: () => Promise<T>,
  successMessage?: (result: T) => string
): Promise<T> {
  const spinner = ora({
    text: ACCENT(label),
    color: "cyan",
    spinner: "dots12",
  }).start();

  try {
    const result = await task();
    spinner.succeed(
      SUCCESS(successMessage ? successMessage(result) : `${label} complete`)
    );
    return result;
  } catch (error) {
    spinner.fail(DANGER(`${label} failed`));
    throw error;
  }
}

export function info(message: string): void {
  console.log(`${ACCENT("●")} ${message}`);
}

export function success(message: string): void {
  console.log(`${SUCCESS("✔")} ${message}`);
}

export function warn(message: string): void {
  console.log(`${WARNING("▲")} ${message}`);
}

export function fatal(message: string): void {
  console.error(`${DANGER("✖")} ${message}`);
}

export function keyValue(key: string, value: string): void {
  const padded = `${key}:`.padEnd(11);
  console.log(`${MUTED(padded)} ${value}`);
}

export function summaryBox(title: string, lines: string[]): void {
  const renderedLines = lines.map((line) => `${MUTED("•")} ${line}`).join("\n");
  console.log(
    boxen(`${chalk.bold(title)}\n${renderedLines}`, {
      padding: { left: 1, right: 1, top: 0, bottom: 0 },
      margin: { top: 1, bottom: 0, left: 0, right: 0 },
      borderColor: "green",
      borderStyle: "round",
    })
  );
}

function checklistHeaderLines(commandName: string, subtitle: string): string[] {
  const heading = `${chalk.bold("♪ GitJazz")} ${MUTED("•")} ${ACCENT(commandName)}`;
  const body = `${heading}\n${MUTED(subtitle)}`;
  const rendered = boxen(body, {
    borderColor: "cyan",
    borderStyle: "round",
    margin: 0,
    padding: { left: 1, right: 1, top: 0, bottom: 0 },
  });

  return ["", ...rendered.split("\n"), ""];
}

function checklistStepLine(
  step: ChecklistStepState,
  spinnerFrame: string
): string {
  if (step.status === "done") {
    return `${SUCCESS("✔")} ${step.label}`;
  }
  if (step.status === "failed") {
    return `${DANGER("✖")} ${step.label}`;
  }
  if (step.status === "running") {
    return `${ACCENT(spinnerFrame)} ${step.label}`;
  }
  return `${MUTED("○")} ${MUTED(step.label)}`;
}

export function createCommandChecklist(
  commandName: string,
  subtitle: string
): CommandChecklist {
  const output = process.stdout;
  const interactive = output.isTTY === true;
  const steps: ChecklistStepState[] = [];
  let renderedLineCount = 0;
  let spinnerFrameIndex = 0;
  let spinnerTimer: NodeJS.Timeout | null = null;

  const render = (): void => {
    if (!interactive) {
      return;
    }

    const frame = SPINNER_FRAMES[spinnerFrameIndex] || "•";
    const lines = [
      ...checklistHeaderLines(commandName, subtitle),
      ...steps.map((step) => checklistStepLine(step, frame)),
    ];
    clearPreviousRender(output, renderedLineCount);
    output.write(`${lines.join("\n")}\n`);
    renderedLineCount = lines.length;
  };

  const stopSpinner = (): void => {
    if (spinnerTimer) {
      clearInterval(spinnerTimer);
      spinnerTimer = null;
    }
  };

  const startSpinner = (): void => {
    if (!interactive || spinnerTimer) {
      return;
    }
    spinnerTimer = setInterval(() => {
      spinnerFrameIndex = (spinnerFrameIndex + 1) % SPINNER_FRAMES.length;
      render();
    }, 90);
  };

  render();

  return {
    finish: (): void => {
      stopSpinner();
      if (!interactive) {
        return;
      }
      clearPreviousRender(output, renderedLineCount);
      renderedLineCount = 0;
    },
    step: async <T>(label: string, task: () => Promise<T>): Promise<T> => {
      const current: ChecklistStepState = {
        label,
        status: "running",
      };
      steps.push(current);
      startSpinner();
      render();

      try {
        const result = await task();
        current.status = "done";
        const hasRunningSteps = steps.some((step) => step.status === "running");
        if (!hasRunningSteps) {
          stopSpinner();
        }
        render();
        return result;
      } catch (error) {
        current.status = "failed";
        stopSpinner();
        render();
        throw error;
      }
    },
  };
}

function clampIndex(index: number, max: number): number {
  if (max <= 0) {
    return 0;
  }
  if (index < 0) {
    return 0;
  }
  if (index >= max) {
    return max - 1;
  }
  return index;
}

function clearPreviousRender(
  output: NodeJS.WriteStream,
  lineCount: number
): void {
  if (lineCount > 0) {
    output.write(`\u001B[${lineCount}F`);
  }
  output.write("\u001B[0J");
}

function renderInteractiveBlock(
  output: NodeJS.WriteStream,
  previousLineCount: number,
  message: string,
  helperText: string | undefined,
  optionLines: string[],
  footer: string
): number {
  clearPreviousRender(output, previousLineCount);
  const lines = [chalk.bold(message)];
  if (helperText) {
    lines.push(MUTED(helperText));
  }
  lines.push(...optionLines, MUTED(footer));
  output.write(`${lines.join("\n")}\n`);
  return lines.length;
}

function normalizeInput(
  input: NodeJS.ReadStream | undefined
): NodeJS.ReadStream {
  return input ?? process.stdin;
}

function normalizeOutput(
  output: NodeJS.WriteStream | undefined
): NodeJS.WriteStream {
  return output ?? process.stdout;
}

function usePlainPrompts(): boolean {
  return process.env.GJ_PLAIN_PROMPTS === "1";
}

async function promptLine(
  input: NodeJS.ReadStream,
  output: NodeJS.WriteStream,
  message: string
): Promise<string> {
  const rl = createPromptInterface({ input, output });
  try {
    return (await rl.question(message)).trim();
  } finally {
    rl.close();
  }
}

function parseOneBasedIndex(value: string, max: number): number | null {
  if (!ONE_BASED_NUMBER_PATTERN.test(value)) {
    return null;
  }
  const parsed = Number.parseInt(value, 10);
  if (parsed < 1 || parsed > max) {
    return null;
  }
  return parsed - 1;
}

async function promptSelectLineMode<T>(
  options: SelectPromptOptions<T>,
  initialIndex: number,
  input: NodeJS.ReadStream,
  output: NodeJS.WriteStream
): Promise<T> {
  output.write(`${chalk.bold(options.message)}\n`);
  if (options.helperText) {
    output.write(`${MUTED(options.helperText)}\n`);
  }

  for (const [optionIndex, option] of options.options.entries()) {
    const marker = optionIndex === initialIndex ? "*" : " ";
    const hint = option.hint ? ` ${MUTED(option.hint)}` : "";
    output.write(`${marker} ${optionIndex + 1}. ${option.label}${hint}\n`);
  }

  while (true) {
    const answer = await promptLine(
      input,
      output,
      `Choose 1-${options.options.length} [${initialIndex + 1}]: `
    );
    if (answer.length === 0) {
      const fallback = options.options[initialIndex];
      if (!fallback) {
        throw new CliError("No selectable option available.");
      }
      return fallback.value;
    }

    const selectedIndex = parseOneBasedIndex(answer, options.options.length);
    if (selectedIndex === null) {
      output.write(
        `${WARNING("▲")} Enter a number from 1 to ${options.options.length}.\n`
      );
      continue;
    }

    const selected = options.options[selectedIndex];
    if (!selected) {
      throw new CliError("No option selected.");
    }
    return selected.value;
  }
}

function parseMultiSelectInput(value: string, max: number): Set<number> | null {
  const selectedIndexes = new Set<number>();
  for (const token of value.split(",")) {
    const trimmed = token.trim();
    if (trimmed.length === 0) {
      continue;
    }
    const parsedIndex = parseOneBasedIndex(trimmed, max);
    if (parsedIndex === null) {
      return null;
    }
    selectedIndexes.add(parsedIndex);
  }
  return selectedIndexes;
}

function selectedIndexesToInput(selectedIndexes: Set<number>): string {
  return [...selectedIndexes]
    .sort((left, right) => left - right)
    .map((index) => `${index + 1}`)
    .join(",");
}

async function promptMultiSelectLineMode<T>(
  options: MultiSelectPromptOptions<T>,
  selectedIndexes: Set<number>,
  minimumSelections: number,
  input: NodeJS.ReadStream,
  output: NodeJS.WriteStream
): Promise<T[]> {
  output.write(`${chalk.bold(options.message)}\n`);
  if (options.helperText) {
    output.write(`${MUTED(options.helperText)}\n`);
  }

  for (const [optionIndex, option] of options.options.entries()) {
    const checked = selectedIndexes.has(optionIndex) ? "[x]" : "[ ]";
    const hint = option.hint ? ` ${MUTED(option.hint)}` : "";
    output.write(`${checked} ${optionIndex + 1}. ${option.label}${hint}\n`);
  }

  const defaultInput = selectedIndexesToInput(selectedIndexes);
  while (true) {
    const answer = await promptLine(
      input,
      output,
      `Choose comma-separated numbers${defaultInput ? ` [${defaultInput}]` : ""}: `
    );
    const nextIndexes =
      answer.length === 0
        ? new Set<number>(selectedIndexes)
        : parseMultiSelectInput(answer, options.options.length);

    if (!nextIndexes) {
      output.write(
        `${WARNING("▲")} Enter comma-separated values from 1 to ${options.options.length}.\n`
      );
      continue;
    }

    if (nextIndexes.size < minimumSelections) {
      output.write(
        `${WARNING("▲")} Select at least ${minimumSelections} option(s).\n`
      );
      continue;
    }

    return collectSelectedValues(options.options, nextIndexes);
  }
}

function applyMove(index: number, size: number, keyName: string): number {
  if (keyName === "up" || keyName === "k") {
    return (index - 1 + size) % size;
  }
  if (keyName === "down" || keyName === "j") {
    return (index + 1) % size;
  }
  return index;
}

function isCancelKey(key: Keypress): boolean {
  return key.ctrl === true && key.name === "c";
}

function isConfirmKey(keyName: string): boolean {
  return keyName === "return" || keyName === "enter";
}

function isToggleKey(keyName: string, value: string): boolean {
  return keyName === "space" || value === " ";
}

function toggleSelectedIndex(
  selectedIndexes: Set<number>,
  targetIndex: number
): void {
  if (selectedIndexes.has(targetIndex)) {
    selectedIndexes.delete(targetIndex);
    return;
  }
  selectedIndexes.add(targetIndex);
}

function collectSelectedValues<T>(
  options: SelectOption<T>[],
  selectedIndexes: Set<number>
): T[] {
  return options
    .filter((_option, optionIndex) => selectedIndexes.has(optionIndex))
    .map((option) => option.value);
}

export function promptSelect<T>(options: SelectPromptOptions<T>): Promise<T> {
  if (options.options.length === 0) {
    throw new CliError("Selection prompt requires at least one option.");
  }

  const input = normalizeInput(options.input);
  const output = normalizeOutput(options.output);
  const initialIndex = clampIndex(
    options.initialIndex ?? 0,
    options.options.length
  );

  if (usePlainPrompts() && input.isTTY && output.isTTY) {
    return promptSelectLineMode(options, initialIndex, input, output);
  }

  if (!(input.isTTY && output.isTTY)) {
    const fallback = options.options[initialIndex];
    if (!fallback) {
      throw new CliError("No selectable option available.");
    }
    return Promise.resolve(fallback.value);
  }

  return new Promise((resolve, reject) => {
    let index = initialIndex;
    let renderedLineCount = 0;
    const wasRaw = input.isRaw ?? false;

    const render = (): void => {
      renderedLineCount = renderInteractiveBlock(
        output,
        renderedLineCount,
        options.message,
        options.helperText,
        options.options.map((option, optionIndex) => {
          const prefix = optionIndex === index ? ACCENT(">") : " ";
          const hint = option.hint ? ` ${MUTED(option.hint)}` : "";
          return `${prefix} ${option.label}${hint}`;
        }),
        "Use ↑/↓ (or j/k) to navigate, Enter to select."
      );
    };

    const cleanup = (): void => {
      input.off("keypress", onKeypress);
      if (!wasRaw) {
        input.setRawMode(false);
      }
      output.write("\u001B[?25h\n");
    };

    const onKeypress = (_input: string, key: Keypress): void => {
      if (isCancelKey(key)) {
        cleanup();
        reject(new CliError("Selection canceled."));
        return;
      }

      const keyName = key.name ?? "";
      if (isConfirmKey(keyName)) {
        const selected = options.options[index];
        cleanup();
        if (!selected) {
          reject(new CliError("No option selected."));
          return;
        }
        resolve(selected.value);
        return;
      }

      const nextIndex = applyMove(index, options.options.length, keyName);
      if (nextIndex !== index) {
        index = nextIndex;
        render();
      }
    };

    emitKeypressEvents(input);
    if (!wasRaw) {
      input.setRawMode(true);
    }
    input.resume();
    output.write("\u001B[?25l");
    render();
    input.on("keypress", onKeypress);
  });
}

export function promptMultiSelect<T>(
  options: MultiSelectPromptOptions<T>
): Promise<T[]> {
  if (options.options.length === 0) {
    throw new CliError("Multi-select prompt requires at least one option.");
  }

  const input = normalizeInput(options.input);
  const output = normalizeOutput(options.output);
  const selectedIndexes = new Set<number>();
  const minimumSelections = options.minimumSelections ?? 0;

  if (options.initialValues) {
    for (const [index, option] of options.options.entries()) {
      if (options.initialValues.includes(option.value)) {
        selectedIndexes.add(index);
      }
    }
  }

  if (usePlainPrompts() && input.isTTY && output.isTTY) {
    return promptMultiSelectLineMode(
      options,
      selectedIndexes,
      minimumSelections,
      input,
      output
    );
  }

  if (!(input.isTTY && output.isTTY)) {
    return Promise.resolve(
      collectSelectedValues(options.options, selectedIndexes)
    );
  }

  return new Promise((resolve, reject) => {
    let index = 0;
    let renderedLineCount = 0;
    const wasRaw = input.isRaw ?? false;

    const render = (): void => {
      renderedLineCount = renderInteractiveBlock(
        output,
        renderedLineCount,
        options.message,
        options.helperText,
        options.options.map((option, optionIndex) => {
          const prefix = optionIndex === index ? ACCENT(">") : " ";
          const checked = selectedIndexes.has(optionIndex) ? "[x]" : "[ ]";
          const hint = option.hint ? ` ${MUTED(option.hint)}` : "";
          return `${prefix} ${checked} ${option.label}${hint}`;
        }),
        "Use ↑/↓ (or j/k) to navigate, Space to toggle, Enter to confirm."
      );
    };

    const cleanup = (): void => {
      input.off("keypress", onKeypress);
      if (!wasRaw) {
        input.setRawMode(false);
      }
      output.write("\u001B[?25h\n");
    };

    const confirmSelection = (): void => {
      if (selectedIndexes.size < minimumSelections) {
        render();
        output.write(
          `${WARNING("▲")} Select at least ${minimumSelections} option(s).\n`
        );
        renderedLineCount += 1;
        return;
      }

      const selected = collectSelectedValues(options.options, selectedIndexes);
      cleanup();
      resolve(selected);
    };

    const onKeypress = (value: string, key: Keypress): void => {
      if (isCancelKey(key)) {
        cleanup();
        reject(new CliError("Selection canceled."));
        return;
      }

      const keyName = key.name ?? "";
      if (isConfirmKey(keyName)) {
        confirmSelection();
        return;
      }

      if (isToggleKey(keyName, value)) {
        toggleSelectedIndex(selectedIndexes, index);
        render();
        return;
      }

      const nextIndex = applyMove(index, options.options.length, keyName);
      if (nextIndex !== index) {
        index = nextIndex;
        render();
      }
    };

    emitKeypressEvents(input);
    if (!wasRaw) {
      input.setRawMode(true);
    }
    input.resume();
    output.write("\u001B[?25l");
    render();
    input.on("keypress", onKeypress);
  });
}

export function extractErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return "Unknown error.";
}
