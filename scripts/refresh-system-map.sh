#!/usr/bin/env bash

set -euo pipefail

project_dir="$(cd "$(dirname "$0")/.." && pwd)"
cd "$project_dir"

if ! command -v graphify >/dev/null 2>&1; then
  echo "Graphify CLI is required. Install it before refreshing the system map." >&2
  exit 1
fi

# Code-only extraction prevents user files, environment files, and documentation
# from becoming part of the administrator-facing architecture map.
graphify extract . --code-only --out .
graphify cluster-only . --no-label

mkdir -p public/system-map
cp graphify-out/graph.html public/system-map/graph.html
cp graphify-out/GRAPH_REPORT.md public/system-map/GRAPH_REPORT.md
