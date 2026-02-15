import { CopyButton } from "./copy-button";

const installCommand = "curl -fsSL https://gitjazz.com/install | bash";

export function Hero() {
  return (
    <section className="mx-auto max-w-5xl px-4 pt-24 pb-16 sm:px-6 sm:pt-32 sm:pb-20 lg:px-8">
      <h1 className="font-bold text-4xl tracking-tight sm:text-5xl lg:text-6xl">
        <span className="text-jazz-cyan">git</span>-jazz
      </h1>
      <p className="mt-4 max-w-2xl text-jazz-gray text-lg sm:text-xl">
        AI-powered git workflows. Beautiful terminal output.
      </p>
      <div className="mt-8 inline-flex max-w-full items-center gap-2 rounded-lg border border-jazz-border bg-jazz-surface px-4 py-3">
        <code className="overflow-x-auto whitespace-nowrap font-mono text-jazz-green text-sm sm:text-base">
          {installCommand}
        </code>
        <CopyButton text={installCommand} />
      </div>
      <p className="mt-3 text-jazz-gray text-sm">
        Requires Bun and Git. Works on macOS and Linux.
      </p>
    </section>
  );
}
