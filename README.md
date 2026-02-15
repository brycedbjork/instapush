# git-jazz

AI-powered git flows with a curated terminal experience.

`git-jazz` replaces noisy raw git logs with guided, styled steps so users always know:
- what is happening now
- what succeeded
- what failed and why

## Commands

- `git-jazz commit`
Stages all local changes and creates an AI-generated commit message.

- `git-jazz push`
Stages all changes, creates an AI commit when needed, then pushes.

- `git-jazz pull`
Pulls latest changes from `origin` for the current branch.

- `git-jazz merge`
Merges `origin/<current-branch>` (or a custom target) and auto-resolves conflicts with AI.

- `git-jazz quickstart`
Interactive setup for:
  - arrow-key UI selection (`↑/↓`, `Enter`)
  - AI provider (`openai`, `anthropic`, `google`)
  - API key
  - smart model (merge conflict resolution), discovered live from provider APIs
  - fast model (commit message generation), discovered live from provider APIs
  - shell aliases (default: `push`, `commit`, `pull`, `merge`) or `gj`-only mode

## One-line install (recommended)

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/brycedbjork/git-jazz/main/scripts/install.sh)
```

This installs `gj` globally, then launches quickstart.

## Install

1. Install dependencies:
```bash
bun install
```

2. Build:
```bash
bun run build
```

3. Link globally:
```bash
bun link
```

4. Run quickstart:
```bash
gj quickstart
```

## Optional aliases

If you want old muscle-memory commands:

```bash
alias push="gj push"
alias commit="gj commit"
alias pull="gj pull"
alias merge="gj merge"
```

Or use short commands directly:

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
