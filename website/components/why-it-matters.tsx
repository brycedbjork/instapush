const pairs = [
  {
    pain: '"fix: update thing" commit messages on autopilot.',
    solution:
      "AI reads your diff and writes a message that actually describes the change.",
  },
  {
    pain: "Merge conflicts break flow and eat 20 minutes.",
    solution:
      "AI resolves conflicts file by file so you stay in your workflow.",
  },
  {
    pain: 'git add . && git commit -m "..." && git push — every single time.',
    solution: (
      <>
        One command. <code className="font-mono text-jazz-cyan">gj push</code>.
        Done.
      </>
    ),
  },
];

export function WhyItMatters() {
  return (
    <section className="mx-auto max-w-5xl px-4 py-16 sm:px-6 lg:px-8">
      <h2 className="font-bold text-2xl sm:text-3xl">Why it matters</h2>
      <div className="mt-8 space-y-8">
        {pairs.map((pair) => (
          <div key={typeof pair.pain === "string" ? pair.pain : ""}>
            <p className="text-jazz-red">
              <span className="mr-2 font-bold">Pain:</span>
              {pair.pain}
            </p>
            <p className="mt-2 text-jazz-green">
              <span className="mr-2 font-bold">Solution:</span>
              {pair.solution}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
