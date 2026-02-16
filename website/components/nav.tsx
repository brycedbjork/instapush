"use client";

import { Github, Star } from "lucide-react";
import { useEffect, useState } from "react";

export function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [stars, setStars] = useState<number | null>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 100);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    fetch("https://api.github.com/repos/north-brook/git-jazz", {
      headers: { Accept: "application/vnd.github.v3+json" },
    })
      .then((r) => r.json())
      .then((data) => {
        if (typeof data.stargazers_count === "number") {
          setStars(data.stargazers_count);
        }
      })
      .catch(() => {
        // Ignore transient GitHub API errors in the nav badge.
      });
  }, []);

  return (
    <nav
      className={`fixed top-0 right-0 left-0 z-50 border-b transition-all duration-300 ${
        scrolled
          ? "border-jazz-border bg-jazz-dark/80 backdrop-blur-md"
          : "border-transparent"
      }`}
    >
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
        <a className="font-bold text-lg tracking-tight" href="/">
          ♪ GitJazz
        </a>
        <div className="flex items-center gap-4">
          <a
            className="flex items-center gap-1.5 rounded-lg border border-jazz-border px-3 py-1.5 text-jazz-gray text-sm transition-colors hover:border-jazz-gray hover:text-white"
            href="https://github.com/north-brook/git-jazz"
            rel="noreferrer"
            target="_blank"
          >
            <Github size={16} />
            {stars !== null && (
              <>
                <Star className="fill-amber-400 text-amber-400" size={12} />
                <span className="tabular-nums">{stars}</span>
              </>
            )}
          </a>
        </div>
      </div>
    </nav>
  );
}
