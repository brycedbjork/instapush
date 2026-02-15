const commands = [
  {
    name: "gj commit",
    description: "Stage all changes and generate an AI-written commit message.",
  },
  {
    name: "gj push",
    description: "Stage, commit with AI, and push — all in a single command.",
  },
  {
    name: "gj pull",
    description: "Fetch and pull with visual feedback and conflict detection.",
  },
  {
    name: "gj merge",
    description:
      "Merge branches with AI-powered conflict resolution, file by file.",
  },
];

export function Commands() {
  return (
    <section className="mx-auto max-w-5xl px-4 py-16 sm:px-6 lg:px-8">
      <h2 className="font-bold text-2xl sm:text-3xl">Commands</h2>
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {commands.map((cmd) => (
          <div
            className="rounded-lg border border-jazz-border bg-jazz-surface p-5"
            key={cmd.name}
          >
            <code className="font-mono text-jazz-cyan">{cmd.name}</code>
            <p className="mt-2 text-jazz-gray text-sm leading-relaxed">
              {cmd.description}
            </p>
          </div>
        ))}
      </div>
      <p className="mt-6 text-jazz-gray text-sm">
        Run <code className="font-mono text-jazz-cyan">gj setup</code> to
        configure your AI provider. Supports OpenAI, Anthropic, and Google.
      </p>
    </section>
  );
}
