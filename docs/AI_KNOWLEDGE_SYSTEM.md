# Graphify × Obsidian × AI Knowledge System

This repository uses one structured architecture model to keep the public environment diagram, Obsidian knowledge vault, and AI startup context aligned.

## Canonical files
- `knowledge/system-architecture.json`: runtime and knowledge-flow architecture model.
- `scripts/generate-knowledge-system.mjs`: generates all environment views.
- `AGENTS.md`: repository-level AI operating rules.
- `PROJECT_PROGRESS.md` and `AI_HANDOFF.md`: current state and handoff history.

## Generated outputs
- `public/system-map/environment.html`: interactive runtime and AI knowledge environment diagram.
- `public/system-map/graph-stats.json`: Graphify statistics consumed by the admin UI.
- `docs/AI_CONTEXT.md`: concise machine-readable startup context.
- Obsidian `70_AI作業環境/`: startup note, diagrams, rules, checklist, and Canvas files.
- Obsidian `90_Graphify/`: Graphify node and relationship notes.

## Development loop
1. Read rules and relevant Obsidian notes.
2. Search durable knowledge with `npm run knowledge:search -- "<topic>"`.
3. Check freshness with `npm run knowledge:check`.
4. Query Graphify before broad source reading.
5. Verify exact behavior in source and live services.
6. Implement, test, and deploy.
7. Write durable knowledge back to manual Obsidian notes.
8. Run `npm run knowledge:update` after structural changes.

## Why both are required
- Graphify answers **where and how code is connected now**.
- Obsidian answers **why it exists, how it is operated, and what happened before**.
- Neither replaces source verification, tests, or live-environment checks.

## Update and verification
```bash
npm run knowledge:update
npm run knowledge:check
```
