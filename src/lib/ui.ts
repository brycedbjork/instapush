import boxen from "boxen";
import chalk from "chalk";
import ora from "ora";

const ACCENT = chalk.cyanBright;
const SUCCESS = chalk.greenBright;
const WARNING = chalk.yellowBright;
const DANGER = chalk.redBright;
const MUTED = chalk.gray;

export function renderBanner(commandName: string, subtitle: string): void {
  const heading = `${chalk.bold("git-jazz")} ${MUTED("•")} ${ACCENT(commandName)}`;
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

export function extractErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return "Unknown error.";
}
