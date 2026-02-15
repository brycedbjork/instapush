import { CopyButton } from "./copy-button";

const installCommand = "curl -fsSL https://gitjazz.com/install | bash";

export function Footer() {
  return (
    <footer className="mx-auto max-w-5xl border-jazz-border border-t px-4 py-16 sm:px-6 lg:px-8">
      <p className="text-jazz-gray text-sm">
        git-jazz is open source.{" "}
        <a
          className="text-jazz-cyan underline underline-offset-4 transition-colors hover:text-white"
          href="https://github.com/north-brook/git-jazz"
          rel="noopener noreferrer"
          target="_blank"
        >
          View on GitHub
        </a>
      </p>
      <div className="mt-4 inline-flex items-center gap-2 rounded-lg border border-jazz-border bg-jazz-surface px-4 py-2">
        <code className="font-mono text-jazz-green text-sm">
          {installCommand}
        </code>
        <CopyButton text={installCommand} />
      </div>
      <p className="mt-4 text-jazz-gray text-xs">MIT License</p>
    </footer>
  );
}
