# GitJazz

AI-powered git workflows CLI (`gj`) with a marketing website.

## Architecture

- **Root:** Bun + TypeScript CLI (Commander). Binary: `gj` / `gitjazz`.
- **website/:** Next.js 15 + Tailwind v4 + Lucide icons. Marketing site at gitjazz.com.
- **Monorepo-lite:** Root is the CLI package, `website/` is a separate Next.js app.

## Commands

- `gj commit` — Stage all + AI commit message
- `gj push` — Stage + AI commit + push
- `gj pull` — Pull latest from origin
- `gj merge` — Merge + AI conflict resolution
- `gj setup` — Interactive provider/model/alias config

## Stack

- Runtime: Bun
- Package manager: bun
- Linting: Ultracite (Biome) + Husky pre-commit
- Testing: `bun test` (unit + integration)
- CI: GitHub Actions (lint, typecheck, test)

## Conventions

- Co-author on all commits: `Co-authored-by: Bryce Bjork <brycedbjork@gmail.com>`
- Skills in `.agents/skills/` (symlinked to `.claude/skills`)
