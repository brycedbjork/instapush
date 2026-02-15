# git-jazz

AI-powered git flows with a curated terminal experience.

`git-jazz` replaces noisy raw git logs with guided, styled steps so users always know:
- what is happening now
- what succeeded
- what failed and why

## Commands

- `gj commit`
Stages all local changes and creates an AI-generated commit message.

- `gj push`
Stages all changes, creates an AI commit when needed, then pushes.

- `gj pull`
Pulls latest changes from `origin` for the current branch.

- `gj merge`
Merges `origin/<current-branch>` (or a custom target) and auto-resolves conflicts with AI.

- `gj setup`
Interactive setup/update for:
  - arrow-key UI selection (`↑/↓`, `Enter`)
  - AI provider (`openai`, `anthropic`, `google`)
  - API key (press Enter to keep existing key)
  - smart model (merge conflict resolution), discovered live from provider APIs
  - fast model (commit message generation), discovered live from provider APIs
  - shell aliases (default: `push`, `commit`, `pull`, `merge`) or `gj`-only mode

## One-line install (recommended)

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/north-brook/git-jazz/main/scripts/install.sh)
```

This installs `gj` globally, auto-updates to latest `main` on launch, then runs setup.

## Install

1. Install dependencies:
```bash
bun install
```

2. Link globally:
```bash
bun link
```

3. Run setup:
```bash
gj setup
```

## Recommended aliases

Setup can install these by default:

```bash
alias push="gj push"
alias commit="gj commit"
alias pull="gj pull"
alias merge="gj merge"
```

With aliases installed, use:

```bash
push
commit
pull
merge
```

Without aliases, use:

```bash
gj push
gj commit
gj pull
gj merge
```

## Dev Tooling

- TypeScript + Commander CLI architecture
- Biome via Ultracite ruleset (`biome.jsonc`)
- Husky pre-commit hook running `bun run check`

## Testing

- Run full suite: `bun run test`
- Run with coverage: `bun run test:coverage`

The suite includes unit tests for provider/model config and AI routing, plus integration tests for `commit`, `push`, `pull`, and `merge` against real temporary git repositories.
