#!/usr/bin/env bash
set -euo pipefail

REPO_URL="${GJ_REPO_URL:-https://github.com/north-brook/git-jazz.git}"
INSTALL_DIR="${GJ_INSTALL_DIR:-$HOME/.git-jazz}"

if ! command -v git >/dev/null 2>&1; then
  echo "Error: git is required." >&2
  exit 1
fi

if ! command -v bun >/dev/null 2>&1; then
  echo "Error: bun is required (https://bun.sh)." >&2
  exit 1
fi

if [ -d "$INSTALL_DIR/.git" ]; then
  echo "Updating existing install at $INSTALL_DIR"
  git -C "$INSTALL_DIR" remote set-url origin "$REPO_URL"
  git -C "$INSTALL_DIR" pull --ff-only
else
  echo "Cloning git-jazz into $INSTALL_DIR"
  git clone "$REPO_URL" "$INSTALL_DIR"
fi

cd "$INSTALL_DIR"

echo "Installing dependencies..."
bun install

echo "Building CLI..."
bun run build

echo "Linking CLI..."
bun link

echo "Launching setup..."
bun run setup
