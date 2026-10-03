# Instatic TalksX AI operating rules

These instructions apply to every AI or automated coding agent working in this repository.

## Required startup sequence

1. Read `PROJECT_PROGRESS.md`, `AI_HANDOFF.md`, and `docs/AI_KNOWLEDGE_SYSTEM.md`.
2. Read the Obsidian entry note:
   `/Users/yoshito/Library/CloudStorage/Dropbox/web/アプリ知識/10_アプリ別/Instatic TalksX/70_AI作業環境/00_AI_START_HERE.md`.
   If the vault is mounted elsewhere, use `KNOWLEDGE_VAULT_APP_DIR`.
3. Check `git status --short`, branch, and HEAD. Never overwrite unrelated uncommitted work.
4. Search durable Obsidian knowledge with `npm run knowledge:search -- "<task or topic>"`.
5. Check Graphify freshness with `npm run knowledge:check`.

## Graphify-first investigation (absolute rule)

- Start code investigation with `graphify query`, `graphify path`, or `graphify explain`.
- Use `knowledge:search` for rationale/operations/incidents and Graphify for current code structure; use both for non-trivial tasks.
- Use Graphify to identify files and relationships, then read only the required source ranges.
- Do not start with blind repository-wide `grep`/`read` loops.
- Graphify is an index, not proof of exact behavior. Directly inspect SQL/RLS/triggers, CSS, Docker/config files, and runtime boundaries across Supabase/HTTP/Cloud Run.

## Source-of-truth order

1. Live production/Supabase/GitHub Actions for current external state.
2. Git working copy for implementation and tests.
3. Graphify for structural discovery.
4. Obsidian for durable design rationale, operations, incidents, and feature knowledge.
5. Conversation context only for the current request; write durable facts back.

## Required closure sequence

1. Run the relevant build, static checks, tests, and real UI verification when applicable.
   For media-worker changes, run `npm run worker:docker:check` when Docker is available; do not disturb unrelated running containers.
2. Update `PROJECT_PROGRESS.md` and the relevant manual Obsidian note.
3. After structural code changes, run `npm run knowledge:update`.
4. Run `npm run knowledge:check` and `git diff --check`.
5. Commit and push according to the project policy.
6. Sync the Git-managed tree to the Dropbox source mirror without `.git` or `.env*`.

## Security boundary

Never put `.env`, private keys, service-role keys, SNS tokens, production personal data, post bodies, or uploaded files into Graphify, Obsidian, Git, screenshots, or chat.
