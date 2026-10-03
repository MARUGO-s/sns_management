# AI Knowledge Context

Generated from `knowledge/system-architecture.json` and the current Graphify graph.

## Project
- Name: Instatic TalksX
- Working directory: `/Users/yoshito/Documents/Codex/2026-10-04/new-chat/work/sns-management-migration`
- Repository: MARUGO-s/sns_management
- Production: https://marugo-s.github.io/sns_management/
- Graphify: 381 nodes / 422 relationships / 35 communities
- Generated: 2026-10-03T19:37:16.516Z

## Required workflow
1. Read `PROJECT_PROGRESS.md`, `AI_HANDOFF.md`, `docs/AI_KNOWLEDGE_SYSTEM.md`, and Obsidian `70_AI作業環境/00_AI_START_HERE.md`.
2. Search durable knowledge with `npm run knowledge:search -- "<task or topic>"`.
3. Run `npm run knowledge:check`.
4. Investigate with Graphify first: `graphify query`, `graphify path`, `graphify explain`.
5. Read only the required source ranges. Directly inspect SQL/RLS/triggers, CSS, config, and runtime service boundaries when relevant.
6. Implement and run build/static checks/tests plus real UI verification when applicable.
7. Write durable rationale/results to the relevant manual Obsidian note and `PROJECT_PROGRESS.md`.
8. After structural changes run `npm run knowledge:update`, then `npm run knowledge:check`.

## Source priority
| Rank | Source | Use | Warning |
|---:|---|---|---|
| 1 | 実行中の本番 / Supabase / GitHub Actions | 現在状態・デプロイ・DB・外部サービスの事実 | 変化するため毎回再確認 |
| 2 | Git作業コピー | 実装・テスト・migration・設定の正本 | 未commit差分を保護 |
| 3 | Graphify | コードの場所・関係・経路の索引 | SQL/RLS・CSS・外部サービス境界は直接確認 |
| 4 | Obsidian | 設計意図・意思決定・運用・障害・機能知識 | 事実が変化し得る項目は実環境で検証 |
| 5 | AIの会話コンテキスト | 現在の依頼と一時的な作業状態 | 永続記憶として扱わず、必要事項を書き戻す |

## Security boundary
Never place env files, private keys, service-role keys, SNS tokens, production personal data, post bodies, or uploaded files into Graphify, Obsidian, Git, screenshots, or chat.
