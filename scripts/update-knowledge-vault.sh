#!/usr/bin/env bash

set -euo pipefail

# Update the Graphify + Obsidian + AI knowledge environment for Instatic TalksX.
# - Refreshes the in-admin Graphify system map (code-only).
# - Exports the code graph as Obsidian notes into the app's 90_Graphify folder.
# - Generates the runtime/AI environment diagrams, AI entry notes, and graph stats.
# Graphify remains code-only: never point it at env files, secrets, or user data.

project_dir="$(cd "$(dirname "$0")/.." && pwd)"
cd "$project_dir"

# Vault app and Graphify output folders. Override these on another machine.
vault_app_dir="${KNOWLEDGE_VAULT_APP_DIR:-/Users/yoshito/Library/CloudStorage/Dropbox/web/アプリ知識/10_アプリ別/Instatic TalksX}"
vault_graphify_dir="${KNOWLEDGE_VAULT_GRAPHIFY_DIR:-$vault_app_dir/90_Graphify}"
export KNOWLEDGE_VAULT_APP_DIR="$vault_app_dir"
export KNOWLEDGE_VAULT_GRAPHIFY_DIR="$vault_graphify_dir"

if ! command -v graphify >/dev/null 2>&1; then
  echo "Graphify CLI is required. Install it before updating the knowledge vault." >&2
  exit 1
fi

echo "[knowledge] refreshing admin system map (code-only)..."
npm run graphify:system-map

echo "[knowledge] exporting Obsidian notes to vault..."
mkdir -p "$vault_graphify_dir"
graphify export obsidian --dir "$vault_graphify_dir"

echo "[knowledge] generating runtime and AI knowledge environment..."
node scripts/generate-knowledge-system.mjs

echo "[knowledge] validating Graphify, repository outputs, and Obsidian..."
node scripts/check-knowledge-system.mjs

echo "[knowledge] done"
echo "[knowledge] Graphify notes: $vault_graphify_dir"
echo "[knowledge] AI workspace: $vault_app_dir/70_AI作業環境"
