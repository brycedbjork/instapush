# ♪ GitJazz

AI-powered git flows with a curated terminal experience.

`♪ GitJazz` replaces noisy raw git logs with guided, styled steps so users always know:
- what is happening now
- what succeeded
- what failed and why

## Commands

- `gj commit`
Stages all local changes and creates one or more AI-planned commits.

- `gj push`
Stages all changes, creates one or more AI-planned commits when needed, then pushes.

- `gj pull`
Pulls latest changes from `origin` for the current branch.

- `gj merge`
Merges `origin/<current-branch>` (or a custom target) and auto-resolves conflicts with AI.

- `gj status`
Uses the fast AI model to summarize current git tree changes in human-readable language.

- `gj setup`
Interactive setup/update for:
  - arrow-key UI selection (`↑/↓`, `Enter`)
  - AI provider (`openai`, `anthropic`, `google`)
  - API key (press Enter to keep existing key)
  - smart model (merge conflict resolution), discovered live from provider APIs
  - fast model (commit message generation), discovered live from provider APIs
  - shell aliases (default: `push`, `commit`, `pull`, `merge`, `status`) or `gj`-only mode

## One-line install (recommended)

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/north-brook/git-jazz/main/scripts/install.sh)
```

This installs `gj` globally and auto-updates to latest `main` on launch.
Then run `gj setup` to start the interactive setup wizard.

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
alias status="gj status"
```

With aliases installed, use:

```bash
push
commit
pull
merge
status
```

Without aliases, use:

```bash
gj push
gj commit
gj pull
gj merge
gj status
```

## Dev Tooling

- TypeScript + Commander CLI architecture
- Biome via Ultracite ruleset (`biome.jsonc`)
- Husky pre-commit hook running `bun run check`

## Testing

- Run full suite: `bun run test`
- Run with coverage: `bun run test:coverage`

The suite includes unit tests for provider/model config and AI routing, plus integration tests for `commit`, `push`, `pull`, `merge`, and `status` against real temporary git repositories.
