#!/usr/bin/env bash
set -euo pipefail

REPO_URL="${GJ_REPO_URL:-https://github.com/north-brook/git-jazz.git}"
INSTALL_DIR="${GJ_INSTALL_DIR:-$HOME/.gitjazz}"

if ! command -v git >/dev/null 2>&1; then
  echo "Error: git is required." >&2
  exit 1
fi

if ! command -v bun >/dev/null 2>&1; then
  echo "Error: bun is required (https://bun.sh)." >&2
  exit 1
fi

if [ -d "$INSTALL_DIR/.git" ]; then
  git -C "$INSTALL_DIR" remote set-url origin "$REPO_URL"
  git -C "$INSTALL_DIR" pull --ff-only --quiet
else
  git clone --quiet "$REPO_URL" "$INSTALL_DIR"
fi

cd "$INSTALL_DIR"

bun install --silent

bun link --silent

if [ -t 0 ] && [ -t 1 ]; then
  GJ_PLAIN_PROMPTS=1 bun src/cli.ts setup
elif { exec 3<>/dev/tty; } 2>/dev/null; then
  GJ_PLAIN_PROMPTS=1 bun src/cli.ts setup <&3
  exec 3<&-
  exec 3>&-
else
  echo "No interactive terminal detected. Run 'gj setup' manually."
fi
