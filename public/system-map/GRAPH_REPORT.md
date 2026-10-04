# Graph Report - .  (2026-10-04)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 494 nodes · 638 edges · 46 communities (37 shown, 9 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 1 edges (avg confidence: 0.5)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `02117d43`
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
- Community 29
- Community 30
- Community 31
- Community 33
- Community 34
- Community 35
- Community 36
- Community 37
- Community 39
- Community 41

## God Nodes (most connected - your core abstractions)
1. `scripts` - 18 edges
2. `compilerOptions` - 16 edges
3. `SocialConsole()` - 14 edges
4. `processJob()` - 11 edges
5. `handleOAuthCallback()` - 9 edges
6. `exchangeToken()` - 8 edges
7. `AdminConsole()` - 7 edges
8. `include` - 7 edges
9. `createTimelinePlan()` - 7 edges
10. `appPath()` - 6 edges

## Surprising Connections (you probably didn't know these)
- `SocialConsole()` --calls--> `xOAuthCallbackMessage()`  [EXTRACTED]
  app/social-console.tsx → app/lib/x-oauth.ts
- `SocialConsole()` --calls--> `xOAuthFailureMessage()`  [EXTRACTED]
  app/social-console.tsx → app/lib/x-oauth.ts
- `SocialConsole()` --calls--> `getXOAuthCallbackUrl()`  [EXTRACTED]
  app/social-console.tsx → app/lib/x-oauth.ts
- `AdminConsole()` --calls--> `appPath()`  [EXTRACTED]
  app/admin/admin-console.tsx → app/lib/public-path.ts
- `ChannelLogo()` --calls--> `appPath()`  [EXTRACTED]
  app/channel-logo.tsx → app/lib/public-path.ts

## Import Cycles
- None detected.

## Communities (46 total, 9 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.08
Nodes (40): authorizationUrl(), base64url(), CallbackDependencies, handleOAuthCallback(), callbackUrl(), challenge(), exchangeToken(), isActualWorkspaceMember() (+32 more)

### Community 1 - "Community 1"
Cohesion: 0.08
Nodes (30): AccessState, actionLabels, AdminConsole(), AdminPager(), AdminUserRow, AdminView, adminViews, AuditRow (+22 more)

### Community 2 - "Community 2"
Cohesion: 0.06
Nodes (32): dist, dom, dom.iterable, esnext, graphify-out, **/*.mts, .next/dev/types/**/*.ts, next-env.d.ts (+24 more)

### Community 3 - "Community 3"
Cohesion: 0.07
Nodes (22): ApiStatus, channelById, channels, DbPostRow, defaultScopes, emptySecretFlags, historyFilters, HistoryRecord (+14 more)

### Community 4 - "Community 4"
Cohesion: 0.06
Nodes (31): @cloudflare/vite-plugin, eslint, eslint-config-next, devDependencies, @cloudflare/vite-plugin, eslint, eslint-config-next, react-server-dom-webpack (+23 more)

### Community 5 - "Community 5"
Cohesion: 0.08
Nodes (24): engines, node, name, private, scripts, backup:dropbox, build, build:github-pages (+16 more)

### Community 6 - "Community 6"
Cohesion: 0.16
Nodes (17): clamp(), createCropPlan(), outputByAspect, compactOutputByAspect, createEncodingPlan(), apiHeaders(), encodeObjectPath(), probeVideo() (+9 more)

### Community 7 - "Community 7"
Cohesion: 0.10
Nodes (20): architectureHash, colors, docsDir, edgeColors, escapeHtml(), escapeXml(), generatedAt, graph (+12 more)

### Community 8 - "Community 8"
Cohesion: 0.15
Nodes (7): public.is_social_workspace_member(), public.social_integrations, public.social_post_channels, public.social_post_files, public.social_posts, public.social_workspace_members, public.social_workspaces

### Community 9 - "Community 9"
Cohesion: 0.17
Nodes (9): public.social_integration_secrets_mutate(), public.social_x_oauth_configs, public.social_x_oauth_configure(), public.social_x_oauth_finish(), public.social_x_oauth_refresh_claim(), public.social_x_oauth_states, social_private.x_oauth_invalidate(), social_x_oauth_integration_revision (+1 more)

### Community 10 - "Community 10"
Cohesion: 0.21
Nodes (13): aspectOptions, clamp(), defaultMediaCrop, formatTime(), MediaAspect, MediaCropConfig, MediaCutRange, MediaEditor() (+5 more)

### Community 11 - "Community 11"
Cohesion: 0.13
Nodes (15): @heroui/react, @heroui/styles, lucide-react, next, dependencies, @heroui/react, @heroui/styles, lucide-react (+7 more)

### Community 12 - "Community 12"
Cohesion: 0.18
Nodes (10): args, includeGenerated, limit, limitArg, matchingExcerpt(), normalize(), query, results (+2 more)

### Community 13 - "Community 13"
Cohesion: 0.18
Nodes (8): DispatchPayload, encodeBase64Url(), getGoogleAccessToken(), GoogleServiceAccount, MediaJob, mediaJobsFunction, MediaJobStatus, privateKeyBytes()

### Community 14 - "Community 14"
Cohesion: 0.18
Nodes (11): getXOAuthCallbackUrl(), hasUnsavedComposer(), IntegrationInput, integrationInputReady(), safeXAuthorizationUrl(), XOAuthCallback, xOAuthCallbackMessage(), xOAuthConfigureBody() (+3 more)

### Community 15 - "Community 15"
Cohesion: 0.18
Nodes (10): backupDir, backupRoot, fileDir, headers, listStorageFiles(), manifest, supabaseFetch(), tableDir (+2 more)

### Community 16 - "Community 16"
Cohesion: 0.20
Nodes (11): isXOAuthConnected(), parseXOAuthCallback(), clearAuthCallbackParams(), createDefaultIntegrations(), createIntegration(), formatDateTime(), formatDateTimeDuration(), formatFileSize() (+3 more)

### Community 17 - "Community 17"
Cohesion: 0.20
Nodes (9): collectFiles(), errors, exists(), gitStatus, manifestPath, projectDir, requiredRepoFiles, requiredVaultFiles (+1 more)

### Community 18 - "Community 18"
Cohesion: 0.44
Nodes (7): assertOAuthConcurrency(), background(), command(), connection(), gate(), sql(), waitFor()

### Community 19 - "Community 19"
Cohesion: 0.25
Nodes (3): Env, ExecutionContext, worker

### Community 20 - "Community 20"
Cohesion: 0.33
Nodes (5): filterPosts(), PostFilter, PostStatus, scheduledPosts(), SearchablePost

### Community 21 - "Community 21"
Cohesion: 0.33
Nodes (4): expression, normalizedBasePath, outputDirectory, prefixes

### Community 22 - "Community 22"
Cohesion: 0.33
Nodes (4): auth.users, public.gourmet_fixture, storage.buckets, storage.objects

### Community 23 - "Community 23"
Cohesion: 0.33
Nodes (5): name, private, scripts, test, type

### Community 24 - "Community 24"
Cohesion: 0.40
Nodes (3): geistMono, geistSans, metadata

### Community 25 - "Community 25"
Cohesion: 0.50
Nodes (3): KNOWLEDGE_VAULT_APP_DIR, KNOWLEDGE_VAULT_GRAPHIFY_DIR, update-knowledge-vault.sh script

### Community 26 - "Community 26"
Cohesion: 0.50
Nodes (3): imports, @supabase/functions-js, @supabase/server

### Community 27 - "Community 27"
Cohesion: 0.50
Nodes (3): imports, @supabase/functions-js, @supabase/server

### Community 28 - "Community 28"
Cohesion: 0.50
Nodes (3): imports, @supabase/functions-js, @supabase/supabase-js

### Community 29 - "Community 29"
Cohesion: 0.50
Nodes (3): imports, @supabase/functions-js, @supabase/server

## Knowledge Gaps
- **218 isolated node(s):** `AdminView`, `AccessState`, `PostStatus`, `SystemMapMode`, `SystemMapStats` (+213 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **9 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `devDependencies` connect `Community 4` to `Community 5`?**
  _High betweenness centrality (0.013) - this node is a cross-community bridge._
- **Why does `dependencies` connect `Community 11` to `Community 5`?**
  _High betweenness centrality (0.007) - this node is a cross-community bridge._
- **What connects `AdminView`, `AccessState`, `PostStatus` to the rest of the system?**
  _218 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.08106219426974144 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.0761904761904762 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.06060606060606061 - nodes in this community are weakly interconnected._
- **Should `Community 3` be split into smaller, more focused modules?**
  _Cohesion score 0.06666666666666667 - nodes in this community are weakly interconnected._