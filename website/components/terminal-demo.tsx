"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const HOLD_AFTER_DONE_MS = 2000;
const PROGRESS_TICK_MS = 50;

interface CommandConfig {
  name: string;
  command: string;
  subtitle: string;
  steps: { label: string; delay: number }[];
  summary: { title: string; lines: string[] };
}

const COMMANDS: CommandConfig[] = [
  {
    name: "commit",
    command: "commit",
    subtitle: "Create an AI commit from current changes.",
    steps: [
      { label: "Validate repo", delay: 400 },
      { label: "Read branch", delay: 300 },
      { label: "Stage changes", delay: 350 },
      { label: "Check staged changes", delay: 300 },
      { label: "Read diff summary", delay: 400 },
      { label: "Read staged patch", delay: 450 },
      { label: "Generate commit message", delay: 1800 },
      { label: "Create commit", delay: 500 },
      { label: "Read commit hash", delay: 300 },
    ],
    summary: {
      title: "Commit",
      lines: [
        "Branch main",
        "Commit a1b2c3d",
        'Message "Add user authentication flow"',
      ],
    },
  },
  {
    name: "push",
    command: "push",
    subtitle: "Push current branch with an AI commit when needed.",
    steps: [
      { label: "Validate repo", delay: 400 },
      { label: "Read branch", delay: 300 },
      { label: "Read upstream", delay: 350 },
      { label: "Stage changes", delay: 300 },
      { label: "Check staged changes", delay: 300 },
      { label: "Read diff summary", delay: 400 },
      { label: "Read staged patch", delay: 450 },
      { label: "Generate commit message", delay: 1800 },
      { label: "Create commit", delay: 500 },
      { label: "Push branch", delay: 600 },
      { label: "Read commit hash", delay: 300 },
    ],
    summary: {
      title: "Push",
      lines: [
        "Branch main",
        "Commit a1b2c3d",
        'Created "Add user authentication flow"',
        "Pushed to origin/main",
      ],
    },
  },
  {
    name: "pull",
    command: "pull",
    subtitle: "Fetch and pull from origin.",
    steps: [
      { label: "Validate repo", delay: 400 },
      { label: "Read branch", delay: 300 },
      { label: "Fetch remote", delay: 800 },
      { label: "Pull branch", delay: 600 },
    ],
    summary: {
      title: "Pull",
      lines: ["Pulled origin/main", "No AI resolution needed"],
    },
  },
  {
    name: "status",
    command: "status",
    subtitle: "Summarize current git tree changes with AI.",
    steps: [
      { label: "Validate repo", delay: 400 },
      { label: "Read branch", delay: 300 },
      { label: "Read upstream", delay: 300 },
      { label: "Read sync state", delay: 350 },
      { label: "Read git tree", delay: 700 },
      { label: "Generate AI summary", delay: 1500 },
    ],
    summary: {
      title: "Status",
      lines: [
        "Branch main",
        "Upstream origin/main (2 ahead)",
        "You have staged changes in src/cli.ts and docs updates in README.md",
        "No merge conflicts detected",
      ],
    },
  },
  {
    name: "merge",
    command: "merge feature/auth",
    subtitle: "Merge target branch with AI conflict handling.",
    steps: [
      { label: "Validate repo", delay: 400 },
      { label: "Read branch", delay: 300 },
      { label: "Check worktree", delay: 350 },
      { label: "Fetch origin", delay: 700 },
      { label: "Merge target", delay: 500 },
      { label: "Find conflicted files", delay: 400 },
      { label: "Resolve src/lib/auth.ts", delay: 1600 },
      { label: "Stage src/lib/auth.ts", delay: 300 },
      { label: "Resolve src/middleware.ts", delay: 1400 },
      { label: "Stage src/middleware.ts", delay: 300 },
      { label: "Create merge commit", delay: 500 },
    ],
    summary: {
      title: "Merge",
      lines: ["Merged feature/auth into main", "Resolved 2 file(s) with AI"],
    },
  },
];

// Pre-compute total animation duration per command (typing + banner pause + steps + summary pause + hold)
function getTotalDuration(cfg: CommandConfig): number {
  const typingMs = cfg.command.length * 90; // ~90ms avg per char
  const bannerPause = 400 + 600; // after typing + banner→steps
  const stepsMs = cfg.steps.reduce((sum, s) => sum + s.delay, 0);
  const summaryPause = 600;
  return typingMs + bannerPause + stepsMs + summaryPause + HOLD_AFTER_DONE_MS;
}

type StepStatus = "hidden" | "running" | "done";

interface StepState {
  label: string;
  status: StepStatus;
}

type Phase = "idle" | "typing" | "banner" | "steps" | "summary" | "done";

function getCommand(index: number): CommandConfig {
  const cmd = COMMANDS[index];
  if (!cmd) {
    return COMMANDS[0] as CommandConfig;
  }
  return cmd;
}

export function TerminalDemo() {
  const [activeTab, setActiveTab] = useState(0);
  const [phase, setPhase] = useState<Phase>("idle");
  const [typedChars, setTypedChars] = useState(0);
  const [steps, setSteps] = useState<StepState[]>([]);
  const [spinnerFrame, setSpinnerFrame] = useState(0);
  const [showSummary, setShowSummary] = useState(false);
  const [stepsComplete, setStepsComplete] = useState(false);
  const [progress, setProgress] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const hasStarted = useRef(false);
  const abortRef = useRef(false);
  const progressStart = useRef(0);
  const isAutoPlaying = useRef(true);

  const config = getCommand(activeTab);

  const startAnimation = useCallback((index: number) => {
    const cfg = getCommand(index);
    abortRef.current = true;
    // Allow microtask to flush before restarting
    setTimeout(() => {
      setActiveTab(index);
      setPhase("idle");
      setTypedChars(0);
      setSteps(cfg.steps.map((s) => ({ label: s.label, status: "hidden" })));
      setSpinnerFrame(0);
      setShowSummary(false);
      setStepsComplete(false);
      setProgress(0);
      abortRef.current = false;
      hasStarted.current = true;
      progressStart.current = Date.now();
      setTimeout(() => {
        setPhase("typing");
      }, 100);
    }, 10);
  }, []);

  const advanceToNext = useCallback(() => {
    const next = (activeTab + 1) % COMMANDS.length;
    startAnimation(next);
  }, [activeTab, startAnimation]);

  // Intersection observer to start initial animation
  useEffect(() => {
    const el = containerRef.current;
    if (!el) {
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting && !hasStarted.current) {
          startAnimation(0);
        }
      },
      { threshold: 0.4 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [startAnimation]);

  // Progress bar ticker
  useEffect(() => {
    if (phase === "idle") {
      return;
    }
    const totalDuration = getTotalDuration(config);
    const interval = setInterval(() => {
      const elapsed = Date.now() - progressStart.current;
      const pct = Math.min(elapsed / totalDuration, 1);
      setProgress(pct);
    }, PROGRESS_TICK_MS);
    return () => clearInterval(interval);
  }, [phase, config]);

  // Typewriter effect
  useEffect(() => {
    if (phase !== "typing") {
      return;
    }
    if (typedChars >= config.command.length) {
      const timeout = setTimeout(() => setPhase("banner"), 400);
      return () => clearTimeout(timeout);
    }
    const timeout = setTimeout(
      () => setTypedChars((c) => c + 1),
      60 + Math.random() * 60
    );
    return () => clearTimeout(timeout);
  }, [phase, typedChars, config.command.length]);

  // Banner → steps transition
  useEffect(() => {
    if (phase !== "banner") {
      return;
    }
    const timeout = setTimeout(() => setPhase("steps"), 600);
    return () => clearTimeout(timeout);
  }, [phase]);

  // Step progression
  useEffect(() => {
    if (phase !== "steps") {
      return;
    }

    const currentSteps = config.steps;

    const runSteps = async () => {
      for (let i = 0; i < currentSteps.length; i++) {
        if (abortRef.current) {
          return;
        }
        const step = currentSteps[i];
        if (!step) {
          continue;
        }
        setSteps((prev) =>
          prev.map((s, idx) => (idx === i ? { ...s, status: "running" } : s))
        );
        await new Promise((r) => setTimeout(r, step.delay));
        if (abortRef.current) {
          return;
        }
        setSteps((prev) =>
          prev.map((s, idx) => (idx === i ? { ...s, status: "done" } : s))
        );
      }
      if (!abortRef.current) {
        setPhase("summary");
      }
    };

    runSteps();
  }, [phase, config.steps]);

  // Show summary – fade out steps, then fade in summary
  useEffect(() => {
    if (phase !== "summary") {
      return;
    }
    // Immediately start fading out the steps
    setStepsComplete(true);
    // After the fade-out completes, swap to the summary
    const timeout = setTimeout(() => {
      setShowSummary(true);
      setPhase("done");
    }, 600);
    return () => clearTimeout(timeout);
  }, [phase]);

  // Auto-advance after done
  useEffect(() => {
    if (phase !== "done") {
      return;
    }
    if (!isAutoPlaying.current) {
      return;
    }
    const timeout = setTimeout(() => {
      advanceToNext();
    }, HOLD_AFTER_DONE_MS);
    return () => clearTimeout(timeout);
  }, [phase, advanceToNext]);

  // Spinner animation
  useEffect(() => {
    const hasRunning = steps.some((s) => s.status === "running");
    if (!hasRunning) {
      return;
    }
    const interval = setInterval(() => {
      setSpinnerFrame((f) => (f + 1) % SPINNER_FRAMES.length);
    }, 90);
    return () => clearInterval(interval);
  }, [steps]);

  const handleTabClick = (index: number) => {
    isAutoPlaying.current = true;
    startAnimation(index);
  };

  return (
    <section className="mx-auto max-w-5xl px-4 py-16 sm:px-6 lg:px-8">
      <div
        className="overflow-hidden rounded-xl border border-jazz-border bg-jazz-surface shadow-2xl"
        ref={containerRef}
      >
        {/* Window chrome with tabs */}
        <div className="flex items-center border-jazz-border border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded-full bg-[#ff5f57]" />
            <div className="h-3 w-3 rounded-full bg-[#febc2e]" />
            <div className="h-3 w-3 rounded-full bg-[#28c840]" />
          </div>
          <div className="ml-4 flex gap-1">
            {COMMANDS.map((cmd, i) => (
              <button
                className={`relative cursor-pointer px-3 pt-1 pb-2 font-mono text-xs transition-colors ${
                  i === activeTab
                    ? "text-jazz-cyan"
                    : "text-jazz-gray hover:text-white"
                }`}
                key={cmd.name}
                onClick={() => handleTabClick(i)}
                type="button"
              >
                {cmd.name}
                {/* Progress indicator bar */}
                <span
                  className="absolute right-0 bottom-0 left-0 h-0.5 origin-left"
                  style={{
                    backgroundColor:
                      i === activeTab
                        ? "var(--color-jazz-cyan)"
                        : "transparent",
                    transform: `scaleX(${i === activeTab ? progress : 0})`,
                  }}
                />
              </button>
            ))}
          </div>
        </div>

        {/* Terminal content — fixed height to prevent layout shift */}
        <div className="h-[480px] overflow-y-auto p-4 font-mono text-sm leading-relaxed sm:h-[520px] sm:p-6 sm:text-base">
          {/* Command line */}
          <div className="flex items-center">
            <span className="text-jazz-gray">$</span>
            <span className="ml-2">
              {phase === "idle" ? "" : config.command.slice(0, typedChars)}
              {phase === "typing" && (
                <span className="animate-pulse text-jazz-cyan">▋</span>
              )}
            </span>
          </div>

          {/* Banner */}
          {phase !== "idle" && phase !== "typing" && (
            <div className="mt-4 rounded border border-jazz-cyan/30 px-3 py-2">
              <span className="font-bold">♪ GitJazz</span>
              <span className="mx-1 text-jazz-gray">•</span>
              <span className="text-jazz-cyan">{config.name}</span>
              <div className="text-jazz-gray">{config.subtitle}</div>
            </div>
          )}

          {/* Steps – fade out when complete */}
          {phase !== "idle" && phase !== "typing" && !showSummary && (
            <div
              className="mt-4 space-y-1"
              style={{
                opacity: stepsComplete ? 0 : 1,
                transition: "opacity 500ms ease-in-out",
              }}
            >
              {steps.map(
                (step) =>
                  step.status !== "hidden" && (
                    <div className="flex items-center gap-2" key={step.label}>
                      {step.status === "running" && (
                        <span className="text-jazz-cyan">
                          {SPINNER_FRAMES[spinnerFrame]}
                        </span>
                      )}
                      {step.status === "done" && (
                        <span className="text-jazz-green">✔</span>
                      )}
                      <span
                        className={
                          step.status === "done"
                            ? "text-white"
                            : "text-jazz-cyan"
                        }
                      >
                        {step.status === "done"
                          ? `${step.label} complete`
                          : step.label}
                      </span>
                    </div>
                  )
              )}
            </div>
          )}

          {/* Summary box – fade in */}
          {showSummary && (
            <div
              className="mt-4 rounded border border-jazz-green/30 px-3 py-2"
              style={{ animation: "fadeIn 500ms ease-in-out" }}
            >
              <div className="font-bold">{config.summary.title}</div>
              <div className="mt-1 space-y-0.5 text-jazz-gray">
                {config.summary.lines.map((line) => (
                  <div key={line}>
                    <span className="text-jazz-gray">•</span>{" "}
                    <span className="text-white">{line}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
