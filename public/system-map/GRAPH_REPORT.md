# Graph Report - .  (2026-10-04)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 376 nodes · 412 edges · 34 communities (27 shown, 7 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 1 edges (avg confidence: 0.5)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `05e11a41`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Community 0
- Community 1
- Community 2
- Community 3
- Community 4
- Community 5
- Community 6
- Community 7
- Community 8
- Community 9
- Community 10
- Community 11
- Community 12
- Community 13
- Community 14
- Community 15
- Community 16
- Community 17
- Community 18
- Community 19
- Community 20
- Community 21
- Community 22
- Community 23
- Community 24
- Community 25
- Community 26
- Community 27
- Community 28
- Community 30
- Community 32

## God Nodes (most connected - your core abstractions)
1. `compilerOptions` - 16 edges
2. `scripts` - 15 edges
3. `include` - 7 edges
4. `processJob()` - 7 edges
5. `SocialConsole()` - 7 edges
6. `createTimelinePlan()` - 6 edges
7. `MediaEditor()` - 6 edges
8. `AdminConsole()` - 6 edges
9. `public.social_workspaces` - 6 edges
10. `exclude` - 6 edges

## Surprising Connections (you probably didn't know these)
- None detected - all connections are within the same source files.

## Import Cycles
- None detected.

## Communities (34 total, 7 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.05
Nodes (30): ApiStatus, channelById, ChannelId, channels, clearAuthCallbackParams(), createDefaultIntegrations(), createIntegration(), DbPostRow (+22 more)

### Community 1 - "Community 1"
Cohesion: 0.08
Nodes (26): AccessState, actionLabels, AdminConsole(), AdminPager(), AdminUserRow, AdminView, adminViews, AuditRow (+18 more)

### Community 2 - "Community 2"
Cohesion: 0.06
Nodes (31): @cloudflare/vite-plugin, eslint, eslint-config-next, devDependencies, @cloudflare/vite-plugin, eslint, eslint-config-next, react-server-dom-webpack (+23 more)

### Community 3 - "Community 3"
Cohesion: 0.15
Nodes (17): clamp(), createCropPlan(), outputByAspect, compactOutputByAspect, createEncodingPlan(), apiHeaders(), encodeObjectPath(), probeVideo() (+9 more)

### Community 4 - "Community 4"
Cohesion: 0.10
Nodes (20): architectureHash, colors, docsDir, edgeColors, escapeHtml(), escapeXml(), generatedAt, graph (+12 more)

### Community 5 - "Community 5"
Cohesion: 0.09
Nodes (21): engines, node, name, private, scripts, backup:dropbox, build, build:github-pages (+13 more)

### Community 6 - "Community 6"
Cohesion: 0.11
Nodes (19): dom, dom.iterable, esnext, compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules (+11 more)

### Community 7 - "Community 7"
Cohesion: 0.15
Nodes (7): public.is_social_workspace_member(), public.social_integrations, public.social_post_channels, public.social_post_files, public.social_posts, public.social_workspace_members, public.social_workspaces

### Community 8 - "Community 8"
Cohesion: 0.21
Nodes (13): aspectOptions, clamp(), defaultMediaCrop, formatTime(), MediaAspect, MediaCropConfig, MediaCutRange, MediaEditor() (+5 more)

### Community 9 - "Community 9"
Cohesion: 0.13
Nodes (15): @heroui/react, @heroui/styles, lucide-react, next, dependencies, @heroui/react, @heroui/styles, lucide-react (+7 more)

### Community 10 - "Community 10"
Cohesion: 0.14
Nodes (13): dist, graphify-out, **/*.mts, .next/dev/types/**/*.ts, next-env.d.ts, .next/types/**/*.ts, node_modules, supabase/functions (+5 more)

### Community 11 - "Community 11"
Cohesion: 0.18
Nodes (10): args, includeGenerated, limit, limitArg, matchingExcerpt(), normalize(), query, results (+2 more)

### Community 12 - "Community 12"
Cohesion: 0.18
Nodes (8): DispatchPayload, encodeBase64Url(), getGoogleAccessToken(), GoogleServiceAccount, MediaJob, mediaJobsFunction, MediaJobStatus, privateKeyBytes()

### Community 13 - "Community 13"
Cohesion: 0.18
Nodes (10): backupDir, backupRoot, fileDir, headers, listStorageFiles(), manifest, supabaseFetch(), tableDir (+2 more)

### Community 14 - "Community 14"
Cohesion: 0.20
Nodes (9): collectFiles(), errors, exists(), gitStatus, manifestPath, projectDir, requiredRepoFiles, requiredVaultFiles (+1 more)

### Community 15 - "Community 15"
Cohesion: 0.25
Nodes (3): Env, ExecutionContext, worker

### Community 16 - "Community 16"
Cohesion: 0.29
Nodes (5): Action, ChannelId, channels, integrationSecretsFunction, secretFields

### Community 17 - "Community 17"
Cohesion: 0.33
Nodes (4): expression, normalizedBasePath, outputDirectory, prefixes

### Community 18 - "Community 18"
Cohesion: 0.33
Nodes (4): auth.users, public.gourmet_fixture, storage.buckets, storage.objects

### Community 19 - "Community 19"
Cohesion: 0.33
Nodes (5): name, private, scripts, test, type

### Community 20 - "Community 20"
Cohesion: 0.40
Nodes (3): geistMono, geistSans, metadata

### Community 21 - "Community 21"
Cohesion: 0.50
Nodes (3): KNOWLEDGE_VAULT_APP_DIR, KNOWLEDGE_VAULT_GRAPHIFY_DIR, update-knowledge-vault.sh script

### Community 22 - "Community 22"
Cohesion: 0.50
Nodes (3): imports, @supabase/functions-js, @supabase/server

### Community 23 - "Community 23"
Cohesion: 0.50
Nodes (3): imports, @supabase/functions-js, @supabase/server

## Knowledge Gaps
- **192 isolated node(s):** `config`, `refresh-system-map.sh script`, `geistSans`, `geistMono`, `metadata` (+187 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **7 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `devDependencies` connect `Community 2` to `Community 5`?**
  _High betweenness centrality (0.022) - this node is a cross-community bridge._
- **Why does `dependencies` connect `Community 9` to `Community 5`?**
  _High betweenness centrality (0.012) - this node is a cross-community bridge._
- **What connects `config`, `refresh-system-map.sh script`, `geistSans` to the rest of the system?**
  _192 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.05391120507399577 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.08172043010752689 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.06451612903225806 - nodes in this community are weakly interconnected._
- **Should `Community 3` be split into smaller, more focused modules?**
  _Cohesion score 0.14666666666666667 - nodes in this community are weakly interconnected._