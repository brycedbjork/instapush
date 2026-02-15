"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

const STEPS = [
  { label: "Validate repo", delay: 400 },
  { label: "Read branch", delay: 300 },
  { label: "Stage changes", delay: 350 },
  { label: "Check staged changes", delay: 300 },
  { label: "Read diff summary", delay: 400 },
  { label: "Read staged patch", delay: 450 },
  { label: "Generate commit message", delay: 1800 },
  { label: "Create commit", delay: 500 },
  { label: "Read commit hash", delay: 300 },
];

type StepStatus = "hidden" | "running" | "done";

interface StepState {
  label: string;
  status: StepStatus;
}

export function TerminalDemo() {
  const [phase, setPhase] = useState<
    "idle" | "typing" | "banner" | "steps" | "summary" | "done"
  >("idle");
  const [typedChars, setTypedChars] = useState(0);
  const [steps, setSteps] = useState<StepState[]>(
    STEPS.map((s) => ({ label: s.label, status: "hidden" }))
  );
  const [spinnerFrame, setSpinnerFrame] = useState(0);
  const [showSummary, setShowSummary] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const hasStarted = useRef(false);
  const command = "gj commit";

  const resetState = useCallback(() => {
    setPhase("idle");
    setTypedChars(0);
    setSteps(STEPS.map((s) => ({ label: s.label, status: "hidden" })));
    setSpinnerFrame(0);
    setShowSummary(false);
    hasStarted.current = false;
    // The element is already in view so the IntersectionObserver won't re-fire.
    // Kick off the animation directly after a brief delay for the reset to render.
    setTimeout(() => {
      hasStarted.current = true;
      setPhase("typing");
    }, 300);
  }, []);

  const runAnimation = useCallback(() => {
    if (hasStarted.current) {
      return;
    }
    hasStarted.current = true;
    setPhase("typing");
  }, []);

  // Intersection observer to start animation
  useEffect(() => {
    const el = containerRef.current;
    if (!el) {
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting && !hasStarted.current) {
          runAnimation();
        }
      },
      { threshold: 0.4 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [runAnimation]);

  // Typewriter effect
  useEffect(() => {
    if (phase !== "typing") {
      return;
    }
    if (typedChars >= command.length) {
      const timeout = setTimeout(() => setPhase("banner"), 400);
      return () => clearTimeout(timeout);
    }
    const timeout = setTimeout(
      () => setTypedChars((c) => c + 1),
      60 + Math.random() * 60
    );
    return () => clearTimeout(timeout);
  }, [phase, typedChars]);

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

    const runSteps = async () => {
      for (let i = 0; i < STEPS.length; i++) {
        const step = STEPS[i];
        if (!step) {
          continue;
        }
        setSteps((prev) =>
          prev.map((s, idx) => (idx === i ? { ...s, status: "running" } : s))
        );
        await new Promise((r) => setTimeout(r, step.delay));
        setSteps((prev) =>
          prev.map((s, idx) => (idx === i ? { ...s, status: "done" } : s))
        );
      }
      setPhase("summary");
    };

    runSteps();
  }, [phase]);

  // Show summary
  useEffect(() => {
    if (phase !== "summary") {
      return;
    }
    const timeout = setTimeout(() => {
      setShowSummary(true);
      setPhase("done");
    }, 400);
    return () => clearTimeout(timeout);
  }, [phase]);

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

  return (
    <section className="mx-auto max-w-5xl px-4 py-16 sm:px-6 lg:px-8">
      <div
        className="overflow-hidden rounded-xl border border-jazz-border bg-jazz-surface shadow-2xl"
        ref={containerRef}
      >
        {/* Window chrome */}
        <div className="flex items-center gap-2 border-jazz-border border-b px-4 py-3">
          <div className="h-3 w-3 rounded-full bg-[#ff5f57]" />
          <div className="h-3 w-3 rounded-full bg-[#febc2e]" />
          <div className="h-3 w-3 rounded-full bg-[#28c840]" />
          <span className="ml-2 font-mono text-jazz-gray text-xs">
            terminal
          </span>
        </div>

        {/* Terminal content */}
        <div className="p-4 font-mono text-sm leading-relaxed sm:p-6 sm:text-base">
          {/* Command line */}
          <div className="flex items-center">
            <span className="text-jazz-gray">$</span>
            <span className="ml-2">
              {phase === "idle" ? "" : command.slice(0, typedChars)}
              {phase === "typing" && (
                <span className="animate-pulse text-jazz-cyan">▋</span>
              )}
            </span>
          </div>

          {/* Banner */}
          {phase !== "idle" && phase !== "typing" && (
            <div className="mt-4 rounded border border-jazz-cyan/30 px-3 py-2">
              <span className="font-bold">git-jazz</span>
              <span className="mx-1 text-jazz-gray">•</span>
              <span className="text-jazz-cyan">commit</span>
              <div className="text-jazz-gray">
                Create an AI commit from current changes.
              </div>
            </div>
          )}

          {/* Steps */}
          {phase !== "idle" && phase !== "typing" && (
            <div className="mt-4 space-y-1">
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

          {/* Summary box */}
          {showSummary && (
            <div className="mt-4 rounded border border-jazz-green/30 px-3 py-2">
              <div className="font-bold">Commit</div>
              <div className="mt-1 space-y-0.5 text-jazz-gray">
                <div>
                  <span className="text-jazz-gray">•</span> Branch{" "}
                  <span className="text-white">main</span>
                </div>
                <div>
                  <span className="text-jazz-gray">•</span> Commit{" "}
                  <span className="text-white">a1b2c3d</span>
                </div>
                <div>
                  <span className="text-jazz-gray">•</span> Message{" "}
                  <span className="text-white">
                    &quot;Add user authentication flow&quot;
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Replay button */}
          {phase === "done" && (
            <button
              className="mt-4 cursor-pointer text-jazz-gray text-sm transition-colors hover:text-jazz-cyan"
              onClick={resetState}
              type="button"
            >
              ↻ Replay
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
