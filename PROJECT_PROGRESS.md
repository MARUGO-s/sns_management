# Instatic TalksX 進行記録

## 2026-10-04 SNS管理リポジトリ移植（最新状態）

- 対象: `MARUGO-s/sns_management`、公開先 `/sns_management/`。
- 旧内容は `backup/pre-instatic-2026-10-04` に保存し、Gitの履歴は保持。
- 利用者の最終指定により、既存gourmet (`ycsqfajidusuibqljjwr`) 内にSNSだけを追加。
- `social_` 12テーブル、`social_private`、非公開 `social-post-files`（50MB）、SNS専用Edge Functions 2件。
- 既存グルメの列・制約・RLS・関数を前後比較し一致。既存利用者をSNSへ自動複製しない。
- Auth・APIキー・容量はプロジェクト共通。ブラウザのログイン保存キーとログアウトはSNS用に限定。
- 独立PostgresテストでRLS・アクセス権・既存データ保持を検証。型検査、Deno検査、16回帰テスト、静的ビルドを実施。
- 所有者の承認によりSNSの認証Redirect URLだけ追加。グルメのSite URLと既存3件は維持。
- 現接続先ではGoogle認証が無効。SNS画面はメール・パスワード認証を提供し、無効なGoogleボタンは表示しない。
- Cloud RunはGoogle認証が `invalid_grant` で未接続。旧動画workerを別DBへ誤接続しない。
- SNSへの実投稿・DM/分析取得は移植前と同様に未実装。初期管理者は所有者指定後に付与。
- Docker worker検証に成功（9テスト、実MP4のクロップ・途中カット・音声なし編集）。既存の他アプリ用コンテナは変更せず。
- 移植PR: https://github.com/MARUGO-s/sns_management/pull/3 。CIの設定未投入時は管理者画面がRestrictedを表示する正常動作にSSR回帰テストを対応。
- 以下は過去の経緯。古い接続先や手順は最新状態より優先しない。

## 文書情報

- 記録日時: 2026-07-26 21:50:36 JST
- 最終更新日時: 2026-07-26 20:17 UTC
- 対象リポジトリ: `https://github.com/MARUGO-s/sms-management.git`
- 対象ブランチ: `main`
- 作業開始時HEAD: `cbf7d20c07b715c49a9bbc911343a1318fe72b0e`
- ローカル作業場所: `/Users/yoshito/Documents/New project`
- 本番URL: `https://marugo-s.github.io/sms-management/`
- 管理者URL: `https://marugo-s.github.io/sms-management/admin/`
- 旧OpenAI Sites URL: `https://instatic-talksx.yoshito0428.chatgpt.site`
- Supabase project ref: `xpdrewhzisycjdtcvvey`
- この文書には秘密値、個人メール、アクセストークンを記載しない。

## AI引き継ぎの必須ルール

このセクションは、このプロジェクトを編集するすべてのAIと作業者に適用する。省略不可。

### 作業開始時

1. 編集前に`PROJECT_PROGRESS.md`を最初から最後まで読む。
2. `AI_HANDOFF.md`も読み、両方の記録を現在の実装と照合する。
3. `git status --short`、現在ブランチ、現在HEADを確認する。
4. 既存の未コミット変更を利用者または別AIの作業として扱い、勝手に削除・上書きしない。
5. 本番DB、Supabase設定、Sitesの状態は変化し得るため、作業対象に関係する項目を実環境で再確認する。
6. 秘密値は画面、チャット、ログ、Git、この文書へ表示しない。

### 編集中

1. 実装、設定変更、DB変更、デプロイ、テスト結果をその場で控える。
2. Supabase変更はmigration名、Edge Function名、適用先、検証結果を残す。
3. UI変更は確認したURLとデスクトップ・モバイルの確認結果を残す。
4. 問題や未完了事項を隠さず、再現条件と次の具体的な手順を残す。
5. 以前の記録は原則として削除しない。誤りを訂正する場合は、訂正日時と理由を追記する。

### 知識・コード調査の必須手順（絶対事項）

このプロジェクトにはObsidian（永続知識）とGraphify（現在コードの構造グラフ）が導入済みである。調査・実装時は、次を絶対事項として守る。

1. まず`npm run knowledge:search -- "<依頼・症状・機能名>"`で、設計意図・意思決定・運用・障害・機能知識をObsidianから検索する。会話コンテキストだけを過去知識として扱わない。
2. `npm run knowledge:check`でGraphify、Web環境図、Obsidian AI workspace、秘密値ガードの整合性を確認する。
3. 次にGraphifyでコードの場所と関係を特定してから読む。当てずっぽうの広範囲`grep`／`read`の連打を最初の手段にしない。
4. 使うコマンドは作業ディレクトリ`/Users/yoshito/Documents/New project`で実行する。
   - `graphify query "<自然言語の質問>"` … 関連ノードを横断で特定
   - `graphify path "<A>" "<B>"` … 2ノード間の経路
   - `graphify explain "<関数名など>"` … そのノードの呼び出し元・呼び出し先
5. Graphifyで当たりを付けた後は、該当ファイルの必要な箇所だけをピンポイントで読む。全体を無差別に`grep`しない。
6. Graphifyの限界を理解して補完する。次はコード限定の静的グラフに載らないため、該当ファイルを直接確認する。
   - SQL migration / RLS / trigger（例: 管理者権限は`supabase/migrations/`のSQLに実装があり、queryでは出ない）
   - DB・HTTP・Cloud Runをまたぐ実行時フロー（UIからワーカーまでが1本の`path`として繋がらない）
   - CSS・`Dockerfile`・`config.toml`など分類対象外ファイル
7. コード構成を変更したら、必ず`npm run knowledge:update`でGraphify、管理画面マップ、環境図、Obsidian Graphifyノート、AI開始文書を一括更新する。古いグラフや環境図のまま調査・報告・デプロイしない。
8. `graphify update .`（watch版）はサンドボックス環境で`Operation not permitted`になることがある。その場合は`npm run knowledge:update`を使用する。
9. Graphifyの解析対象はコード構成に限定する。投稿本文、添付ファイル、Supabase本番データ、環境変数、SNS連携シークレットをGraphifyの入力にしない。
10. 次回も必要な判断・運用・障害・機能知識は、作業終了前に該当する手書きObsidianノートへ書き戻す。`90_Graphify/`は自動生成領域なので手編集しない。

### 作業終了時

作業を行ったAIは、完了報告を返す前に必ず次を実施する。

1. この`PROJECT_PROGRESS.md`の「現在の到達点」「既知の警告」「未実装範囲」「次に着手する優先順位」を実態に合わせて更新する。
2. この文書末尾の「継続作業ログ」へ新しい記録を追記する。
3. 継続作業ログには、日時、依頼内容、実施内容、変更ファイル、DB・設定変更、テスト結果、デプロイ先、Git情報、未完了事項、次の作業を記載する。
4. 秘密値、個人メール、アクセストークン、Client Secret、Sitesのバイパストークンは記載しない。
5. 関連する手書きObsidianノートを更新し、構造変更後は`npm run knowledge:update`、終了前は`npm run knowledge:check`を実行する。
6. メディアワーカーを変更した場合は、Dockerが利用可能なら`npm run worker:docker:check`を実行する。他アプリの稼働中コンテナは停止・再作成しない。
7. コードとこの文書をGitへcommitし、明示された運用方針に従ってpushする。
8. `/Users/yoshito/Library/CloudStorage/Dropbox/web/instatic-talksx/`へ、`.env*`などの除外規則を守ってソースを同期する。
9. Dropbox側の`PROJECT_PROGRESS.md`がGit作業場所の内容と一致することを確認する。

この更新を行っていない作業は、コードが動いていても引き継ぎ未完了として扱う。次のAIは、前回作業の記録漏れを発見した場合、確認できる事実だけを追記してから新しい作業を始める。

## 現在の到達点

Instatic TalksXは、Instagram、TikTok、X、Threadsの運用情報を一括管理する業務用Webアプリとして、以下の基盤まで本番反映済み。

- Supabase Authによるメール・パスワード認証
- Google OAuthログイン
- 公式22店舗とBLU NEROを合わせた23店舗の所属マスター
- 新規登録時の所属店舗必須選択
- 既存利用者向けの初回所属店舗設定
- 利用者ごとのワークスペース作成
- 通常画面での所属店舗表示
- 投稿本文、予約日時、投稿先、ステータスの保存
- 投稿履歴の閲覧
- 非公開Supabase Storageへの添付ファイル保存
- 1ファイル50MBまでのFreeプラン向け添付制限
- 動画の1:1、4:5、9:16、16:9クロップ設定
- 元動画を保持する非同期メディア処理キューと処理履歴
- Cloud Run Jobs向けFFmpeg動画クロップワーカー
- 期限付きURLによるファイルダウンロード
- SNS連携設定のメタデータ保存
- SNS APIシークレットのブラウザ非公開保存
- 全利用者、店舗、投稿、予約予定、ファイル、操作履歴を確認する管理者画面
- 管理者画面の全店舗一覧、店舗別絞り込み、店舗別運用状況
- 管理者画面からの管理者権限付与・解除
- 最後の管理者を削除できないDB保護
- 管理者権限変更を含む監査ログ
- GitHub Pagesへの静的デプロイとDropboxソースミラー
- 管理者画面のGraphifyコード構成マップ
- 管理者画面の実行環境・AI知識循環マップ
- Dropbox同期のObsidian知識Vault（アプリ別、手書き知識と自動生成領域を分離）
- AI向け`AGENTS.md`、`00_AI_START_HERE`、`knowledge:search`、`knowledge:check`
- `npm run knowledge:update`によるGraphify・環境図・Obsidian・AI文書の一括同期
- Docker DesktopによるCloud Run向けFFmpeg workerのローカル再現性検証

知識環境の最新生成結果は326ノード、343関係、32コミュニティ。ObsidianのInstatic TalksX配下はMarkdown合計373件で、`90_Graphify/`はGraphify生成ノート358件 + 運用説明`_README.md` 1件 + `graph.canvas` + 生成manifestで構成される。`70_AI作業環境/`はAI入口・環境図・Canvas・チェックリスト・Graphify/Obsidianブリッジを含む8ファイル。

現時点では実際のSNS公開処理、コメント・DM同期、Webhook受信、各SNSの分析値取得は未実装。各SNSの開発者アプリ審査、OAuth認可、公開API実装が別途必要。動画クロップの画面、キュー、Edge Function、FFmpegワーカーは実装済みで、Cloud Run実行環境も構築済み。2026-07-28に処理中固定の障害は対応済み。2026-08-14にGoogle OAuthの戻り先誤設定、予約保存の巻き戻し、下書き再予約・削除、所属店舗の取り違え、管理者ステータス不整合を修正した。

### Cloud Run動画処理の実環境

- Google Cloud project: `instatic-talksx-media`
- Region: `asia-northeast1`（東京）
- Artifact Registry: `instatic-talksx`
- Worker image: `asia-northeast1-docker.pkg.dev/instatic-talksx-media/instatic-talksx/media-processor:latest`
- Cloud Run Job: `instatic-media-processor`
- Job設定: 1 task、parallelism 1、max retries 1、timeout 15分、2 vCPU、2GiB、runtime service account `instatic-media-runtime`
- Secret Manager secret名: `instatic-supabase-url`、`instatic-supabase-secret-key`
- Dispatcher service account: `instatic-media-dispatcher`
- Dispatcher権限: `roles/run.jobsExecutorWithOverrides`
- Supabase Edge Function Secrets: `GOOGLE_SERVICE_ACCOUNT_JSON`、`GOOGLE_CLOUD_PROJECT_ID`、`GOOGLE_CLOUD_REGION`、`GOOGLE_CLOUD_RUN_JOB_NAME`
- 秘密値そのもの、サービスアカウントJSON、Supabase Secret keyはこの記録・Git・Dropboxソースミラーへ記載しない。

### 直近の動画処理確認

- アプリの予約一覧でテスト投稿1件を確認済み。
- 9分16秒動画をクロップ保存し、アプリ上で処理中表示を確認済み。
- 予約一覧は処理済み動画のプレビュー画面ではない。確認は`履歴`の投稿詳細から、`変換済み`と表示されたMP4をダウンロードして行う。
- 2026-07-27 00:25 JST時点では`変換済み`とダウンロード再生まで未確認。
- 15分を超えて処理中のままなら、Cloud Run JobのExecutionログとSupabaseの`social_media_jobs`のstatus/error_messageを確認する。手動でJobを実行しない。手動実行には対象ジョブID等の入力が必要で、アプリのDispatcher経由の実行と異なる。

## 本番データのスナップショット

2026-07-26 22:20 JSTまでに本番DBへ直接照会した結果。

| 対象 | 件数 |
| --- | ---: |
| Supabase Auth利用者 | 1 |
| 管理者 | 1 |
| 公開プロフィール | 1 |
| 店舗マスター | 23 |
| 所属店舗未設定プロフィール | 1 |
| ワークスペース | 1 |
| 所属店舗未設定ワークスペース | 1 |
| ワークスペースメンバー | 0 |
| 投稿 | 0 |
| 投稿先チャンネル | 0 |
| ファイルメタデータ | 0 |
| Storage内ファイル | 0 |
| SNS連携設定 | 0 |
| SNS連携シークレット行 | 0 |
| 監査ログ | 0 |

投稿、ファイル、SNS連携、監査ログが0件なのは、まだ実データ操作が行われていないためであり、読み込み失敗ではない。

## 技術構成

### フロントエンド

- React 19
- Next.js 16互換のVinext
- Vite 8
- TypeScript
- HeroUI v3
- Lucide React
- Cloudflare Workers互換のビルド出力

主要ファイル:

- `app/page.tsx`: 通常画面のルート
- `app/social-console.tsx`: 通常のSNS運用画面
- `app/admin/page.tsx`: 管理者画面のルート
- `app/admin/admin-console.tsx`: 管理者画面
- `app/lib/supabase.ts`: ブラウザ用Supabaseクライアント
- `app/globals.css`: 通常画面、認証画面、管理者画面の共通スタイル
- `app/layout.tsx`: メタデータ、フォント、OG設定

### バックエンド

- Supabase Postgres
- Supabase Auth
- Supabase Storage
- Supabase Edge Functions
- Row Level Security
- `private`スキーマ内のSecurity Definer関数

### ホスティング

- 現行本番: GitHub Pages `https://marugo-s.github.io/sms-management/`
- `main`へのpushで`.github/workflows/deploy-github-pages.yml`が自動ビルド・公開
- Vinextの静的exportと`/sms-management/` base pathに対応
- GitHub Actions SecretsはSupabase publishable設定だけを保持し、secret/service role keyは置かない
- OpenAI Sites project ID `appgprj_6a65e85b2c6c8191b197204738f2e23f`は旧配信経路として`.openai/hosting.json`に残るが、現行本番の正本はGitHub Pages

### 知識・AI開発環境

- 構成モデルの正本: `knowledge/system-architecture.json`
- AI運用ルール: `AGENTS.md`、`AI_HANDOFF.md`、`PROJECT_PROGRESS.md`
- AI向け生成文書: `docs/AI_CONTEXT.md`、`docs/AI_KNOWLEDGE_SYSTEM.md`
- Web環境図: `public/system-map/environment.html`
- Graphify統計: `public/system-map/graph-stats.json`
- Obsidian Vault: `/Users/yoshito/Library/CloudStorage/Dropbox/web/アプリ知識`
- Instatic TalksX AI入口: `10_アプリ別/Instatic TalksX/70_AI作業環境/00_AI_START_HERE.md`
- 自動Graphifyノート: `10_アプリ別/Instatic TalksX/90_Graphify/`
- 手書き知識検索: `npm run knowledge:search -- "<依頼・症状・機能名>"`
- 一括更新: `npm run knowledge:update`
- 整合性検査: `npm run knowledge:check`

## 通常画面の機能

### 店舗所属

- 店舗マスターはMARUGO GROUP公式の22店舗と`BLU NERO`の合計23店舗
- 新規登録時に所属店舗を必須選択
- メール登録は`social_store_id`をAuth metadataへ渡し、DB側で有効店舗か検証
- Google OAuth登録はCallback完了まで選択値をローカルの一時情報として保持し、認証後にDBへ確定
- 既存利用者で所属店舗が未設定の場合、業務画面を表示する前に一度だけ選択を要求
- 所属店舗は`social_user_profiles.store_id`と`social_workspaces.store_id`を正本とする
- Authの`user_metadata`は認可判定には使用しない
- 通常画面のサイドバー、上部見出し、利用者欄へ現在の店舗名を表示

### 投稿

- 本文を最大2200文字で入力
- Instagram、TikTok、X、Threadsを複数選択
- 公開予定日時を設定
- 下書きまたは予約投稿としてPostgresへ保存
- 投稿タイトルは本文から生成
- 投稿の作成者をAuth user IDで保存

### 添付ファイル

- 1投稿につき最大4ファイル
- 1ファイル50MBまで
- ファイル本体は非公開Storage bucket `post-files`へ保存
- ファイル名、MIME type、サイズ、Storage pathは`social_post_files`へ保存
- ダウンロード時だけ60秒の署名付きURLを生成
- 動画は1:1、4:5、9:16、16:9のクロップ範囲を設定可能
- クロップ設定済み動画は`social_media_jobs`へ非同期ジョブとして保存
- 元動画を上書きせず、処理済みMP4を別ファイルとして追加
- 処理待ち、処理中、完了、失敗を履歴で確認
- 処理待ち・失敗ジョブは履歴から再実行可能

### 予約

- `scheduled`状態の投稿を一覧表示
- 予約日時、投稿先、担当者を確認

### 履歴

- 保存済み投稿を新しい順に表示
- 本文、ステータス、投稿先、保存日時、添付ファイルを確認
- 投稿本文の検索

### 受信箱

- 画面枠は存在する
- 実際のコメント・DM API同期は未実装
- 実データ風のダミー値は表示しない

### 分析

- 保存済み投稿の内部件数を集計
- 実際のSNSインプレッション、反応数、フォロワー推移は未取得

### 連携

- Instagram、TikTok、X、Threadsごとの設定画面
- App ID、Callback URL、Scopes、接続状態を`social_integrations`へ保存
- Client Secret、Access Token、Refresh Token、Webhook SecretはEdge Function経由で`social_integration_secrets`へ保存
- 保存済みシークレットの値はブラウザへ返さず、登録有無だけ返す

## 認証

### 有効なログイン方式

- メールアドレスとパスワード
- Google OAuth

### 現在の保護

- 未ログイン時は通常画面の業務データを表示しない
- 投稿、履歴、ファイル、SNS設定はSupabase RLSで保護
- UIを直接操作しなくても、Data API側で権限を拒否
- 新規登録は有効な所属店舗の選択を必須化
- 匿名利用者は有効な店舗名だけを読み取り可能で、店舗マスターを変更できない
- 所属店舗未設定の利用者は自分のプロフィールへ有効店舗を一度だけ設定でき、通常の画面操作では別店舗へ変更できない
- 新規登録画面は12文字以上のパスワードを要求
- Google OAuthのClient SecretはSupabase AuthenticationとGoogle Auth Platformにのみ保存

### Supabase Auth URL設定

- Site URL: 本番Sites URL
- Redirect URL: 本番URL配下
- Redirect URL: `http://localhost:3000/**`

### 既知のAuth警告

Supabase Advisorsは`Leaked Password Protection Disabled`を1件報告している。HaveIBeenPwned連携による漏洩パスワード保護はSupabase Proプラン向けのため、Freeプラン中は有効化できない。現在はアプリ側の12文字制限を維持する。

## 管理者画面

### アクセス

- ルート: `/admin`
- `social_admin_users`にAuth user IDが存在する利用者だけアクセス可能
- 一般利用者がURLを直接開いても管理データは取得できない
- 通常画面の「管理者」リンクも管理者にだけ表示

### 全体管理

- 全利用者数
- 全店舗数
- 全投稿数
- 全予約予定数
- 全ファイル数
- 設定済みSNS連携数
- 利用者、投稿、ファイルの横断検索
- 全店舗表示と店舗別表示を切り替える共通店舗フィルター
- 店舗ごとの利用者数、投稿数、予約数、次回予約を表示する運用状況一覧

### 投稿管理

- 全ワークスペースの投稿を確認
- 利用者、店舗、ワークスペース、投稿先、公開予定を表示
- 全店舗の一覧と店舗別の一覧を切り替え
- 投稿ステータスを下書き、予約済み、公開済み、失敗へ変更
- 管理者画面には投稿削除機能を置いていない

### 予約予定

- `scheduled`状態で公開予定日時がある投稿を時系列で表示
- 公開予定、店舗、投稿本文、投稿先、利用者、状態を表示
- 全店舗の予定と選択店舗だけの予定を切り替え

### ファイル管理

- 全ワークスペースのファイルメタデータを確認
- 投稿、作成者、店舗、ワークスペース、保存日時を表示
- 共通店舗フィルターで店舗別に絞り込み
- 非公開Storageから期限付きURLで取得
- 管理者画面にはファイル削除機能を置いていない

### 操作履歴

- 作成、更新、削除を監査ログへ保存
- 対象種別、対象ID、表示名、実行者、日時を記録
- 投稿本文は監査ログへ複製しない
- SNSシークレットは監査ログへ複製しない
- 監査対象:
  - ワークスペース
  - ワークスペースメンバー
  - 投稿
  - 投稿先
  - ファイルメタデータ
  - SNS連携メタデータ
  - 管理者権限

### 利用者管理

- 登録済み利用者を一覧表示
- 登録日時、最終ログイン、所属店舗、投稿数、ファイル数を表示
- 共通店舗フィルターで店舗別に絞り込み
- 管理者と一般利用者を区別
- 一般利用者を「管理者にする」
- 管理者の「権限を解除」
- 現在ログイン中の管理者は画面から自分自身を解除できない
- DB側でも最後の管理者1名は削除できない
- 権限付与・解除は監査ログへ保存
- 管理者へ変更できるのは、事前に一度登録済みの利用者のみ

## Supabaseテーブル

### `social_stores`

- 23店舗の正規マスター
- `id`、店舗名、エリア、表示順、有効状態を保持
- 匿名登録画面と認証済み画面は有効店舗を読み取り可能
- ブラウザロールに店舗の追加、変更、削除権限を付与しない

### `social_workspaces`

- ワークスペース
- `created_by`で作成者を保持
- `store_id`で店舗所属を保持
- 作成者またはメンバーが通常画面から閲覧
- 管理者は管理者画面から全件閲覧

### `social_workspace_members`

- ワークスペースと利用者の所属
- roleは`owner`、`admin`、`member`、`viewer`
- ワークスペース所有者だけがメンバーを管理

### `social_posts`

- 投稿本文、タイトル、公開予定、ステータス、形式、作成者
- ステータスは`draft`、`scheduled`、`published`、`failed`
- 通常利用者は所属ワークスペース内だけ操作
- アプリ管理者は全件閲覧とステータス更新が可能

### `social_post_channels`

- 投稿とSNSチャンネルの多対多情報
- チャンネルは`instagram`、`tiktok`、`x`、`threads`

### `social_post_files`

- Storage内ファイルのメタデータ
- Storage pathは一意
- ファイルサイズは0以上
- `media_variant`で元ファイルと処理済みファイルを区別
- `generated_from_file_id`で処理済みファイルから元ファイルを追跡

### `social_media_jobs`

- 動画クロップの非同期処理要求
- 対象ワークスペース、投稿、元ファイル、依頼者を保持
- クロップ比率、横位置、縦位置、拡大率をJSONで保持
- 状態は`queued`、`processing`、`completed`、`failed`、`cancelled`
- 処理済みファイル、Cloud Run実行名、安全なエラー情報を保持
- 通常利用者は所属ワークスペース内だけ閲覧・作成
- ジョブの元ファイルは同一ワークスペース・同一投稿・同一作成者の動画に限定
- service roleだけがCloud Runワーカーとして処理結果を更新

### `social_integrations`

- SNS連携の公開可能なメタデータ
- App ID、Callback URL、Scopes、Status
- シークレット値は保存しない

### `social_integration_secrets`

- Client Secret
- Access Token
- Refresh Token
- Webhook Secret
- ブラウザロール`anon`、`authenticated`へ権限を付与しない
- `service_role`とEdge Functionのみが操作

### `social_admin_users`

- アプリ全体の管理者
- Auth user IDを主キーとして保持
- 付与者と付与日時を保持
- RLSにより管理者だけが全管理者を閲覧・変更
- 最後の管理者削除を拒否

### `social_user_profiles`

- `auth.users`を直接Data APIへ公開しないための管理者向けディレクトリ
- email、所属店舗、登録日時、最終ログインを同期
- `auth.users`のInsert、email更新、last sign-in更新で自動同期
- 通常利用者は自分のプロフィール、管理者は全件を閲覧
- `store_id`が空の間だけ、利用者本人が有効店舗を一度設定可能

### `social_audit_logs`

- 操作履歴
- workspace ID、actor user ID、action、entity type、entity ID、label、metadata、日時
- 管理者だけが閲覧
- 本文やシークレットを保存しない

## Supabase Storage

- Bucket ID: `post-files`
- Public設定: false
- 1ファイル上限: 50MB
- 通常利用者は所属ワークスペースのファイルだけ操作可能
- アプリ管理者は全ファイルを読み取り可能
- ファイルの更新・削除権限は管理者へ自動拡張していない

## Supabase Edge Function

### `integration-secrets`

- 状態: ACTIVE
- バージョン: 1
- JWT検証: 有効
- 役割:
  - SNSシークレット保存
  - 保存済みシークレットの有無確認
  - SNSシークレット削除
- シークレット値をブラウザへ返さない

### `media-jobs`

- 状態: ACTIVE
- JWT検証: 有効
- 役割:
  - 認証済み利用者が閲覧可能なメディアジョブだけを受理
  - Cloud Run Jobへ`MEDIA_JOB_ID`を安全に渡して実行
  - Cloud Run未接続時はジョブを失敗させず`queued`で維持
  - Dispatch失敗時は安全なエラー情報だけを保存
- Google service-account JSONはSupabase Secretsへ保存する設計で、Gitには保存しない

## 適用済みマイグレーション

ローカルと本番が一致している。

### `20260726102900_social_ops_storage.sql`

- SNS運用の基本テーブル作成
- 投稿、チャンネル、ファイル、連携設定
- 非公開Storage bucket作成
- 初期RLSと権限

### `20260726103150_consolidate_social_rls_policies.sql`

- 初期RLSの重複整理

### `20260726104635_secure_integration_secrets.sql`

- サーバー専用シークレットテーブル
- browser roleからシークレットテーブル権限を削除
- Storageの20MB制限

### `20260726111630_fix_social_rls_recursion.sql`

- `private`スキーマ作成
- Security Definerによる所有者・メンバー判定
- 循環RLSによるログイン後読み込み失敗を修正

### `20260726114941_allow_workspace_owner_returning.sql`

- 新規ワークスペース作成直後の`insert ... returning`を所有者が読めるよう修正

### `20260726135609_add_social_media_processing.sql`

- Storage上限をFreeプラン向け50MBへ変更
- 元ファイルと処理済みファイルの系譜を追加
- `social_media_jobs`、RLS、監査trigger、service role権限を追加

### `20260726141243_fix_media_job_rls_qualification.sql`

- メディアジョブ作成RLSの外側テーブル参照を明示
- 元動画とジョブのワークスペース・投稿一致を厳密化

### `20260726121622_add_social_admin_console.sql`

- 管理者テーブル
- 利用者プロフィール同期
- 監査ログ
- 管理者の全体閲覧RLS
- 投稿ステータス更新

### `20260726122528_consolidate_social_admin_rls.sql`

- 管理者用RLSを既存ポリシーへ統合
- 複数Permissive Policy警告を解消
- 管理者の権限を閲覧と投稿更新へ限定

### `20260726124138_manage_social_administrators.sql`

- 管理者による管理者権限付与・解除
- 最後の管理者保護
- 管理者変更の監査ログ

### `20260726130739_add_social_store_affiliation.sql`

- `social_stores`と23店舗の初期データを作成
- プロフィールとワークスペースへ`store_id`を追加
- 新規登録時の`social_store_id` metadataを有効店舗に限定してプロフィールへ同期
- 既存利用者が空の`store_id`を一度だけ設定できるRLS
- 匿名登録画面へ有効店舗の読み取りだけを許可

## RLS検証結果

2026-07-26に本番DB上でロールとJWT subjectを切り替え、トランザクションをRollbackして検証。

- 管理者は全利用者、ワークスペース、投稿、ファイル、監査ログを閲覧可能
- 一般利用者相当では管理者一覧、利用者ディレクトリ、監査ログが0件
- 管理者でない利用者は管理者削除判定がfalse
- 最後の管理者をDELETEしても1名が残る
- 管理者ロールには管理者テーブルのINSERT、DELETE grantが存在
- 実際の変更可否はRLSで管理者だけに制限
- 投稿の作成・更新・削除の監査テストで3操作を記録
- 監査テストで投稿本文がログへ混入しないことを確認
- 匿名ロールは有効な23店舗を読み取れる
- 匿名ロールは店舗マスターへINSERTできない
- 認証済み利用者は未設定の自分の`store_id`を有効店舗へ設定できる
- 一度設定した`store_id`を通常利用者が別店舗へ変更できない
- 所属設定の検証はTransaction内で行いRollbackし、本番プロフィールは未設定のまま維持

## Gitの状態

- ブランチ: `main`
- 本作業開始時HEAD: `cbf7d20c07b715c49a9bbc911343a1318fe72b0e`
- Remote: `origin`
- Remote URL: `https://github.com/MARUGO-s/sms-management.git`
- 本作業のcommit・push・GitHub Pages公開結果は、この文書末尾の継続作業ログへ追記する。

## Dropbox

### ソース引き継ぎ

パス:

`/Users/yoshito/Library/CloudStorage/Dropbox/web/instatic-talksx/`

固定ファイル数は構成変更で変動するため正本としない。同期後は`git ls-files`の各ファイルがミラー側と一致することを検査する。

含むもの:

- アプリソース
- Supabase migrations
- Supabase Edge Functionソース
- README
- AI_HANDOFF
- この進行記録

除外するもの:

- `.git`
- `node_modules`
- `dist`
- `.next`
- `.wrangler`
- `.env*`
- `supabase/.temp`
- coverage、outputs、work

### 秘密情報引き継ぎ

パス:

`/Users/yoshito/Library/CloudStorage/Dropbox/web/instatic-talksx-secrets/`

記録時のファイル数: 2

- `.env.local`: 現在のブラウザ実行設定
- `README.md`: 秘密情報引き継ぎ方針

`.env.local`に存在する変数名:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `DROPBOX_BACKUP_DIR`

秘密値はこの文書へ記載しない。

`SUPABASE_SECRET_KEY`または`SUPABASE_SERVICE_ROLE_KEY`は記録時点でローカルenvに存在しない。入手した場合はGitソース外のDropbox secretsフォルダに`server.env`として保存する。

### 実データバックアップ

既定パス:

`/Users/yoshito/Library/CloudStorage/Dropbox/web/instatic-talksx-backups/`

記録時のバックアップフォルダ数: 0

`npm run backup:dropbox`は以下をバックアップする設計:

- 全業務テーブル
- 管理者テーブル
- 利用者プロフィール
- 監査ログ
- SNS連携シークレット
- `post-files`のファイル本体

実行には`SUPABASE_SECRET_KEY`と`DROPBOX_BACKUP_DIR`が必要。現在はserver-only keyがないため、実データバックアップは未実行。

## 秘密情報の方針

所有者の指示により、秘密情報はAI引き継ぎ目的でDropbox専用secretsフォルダへ保存してよい。

保存してよい場所:

- Supabase
- Google Auth Platform
- 所有者のDropbox secretsフォルダ
- 所有者のDropbox backupフォルダ

保存しない場所:

- Git
- GitHub issue、PR本文
- アプリのブラウザStorage
- チャット本文
- スクリーンショット
- `AI_HANDOFF.md`
- `PROJECT_PROGRESS.md`
- Dropboxのソースミラー

公開可能なSupabase Publishable Keyと、server-onlyのSecret Keyを混同しないこと。Publishable KeyだけではRLSを回避できない。

## 確認済みテスト

### コード

- `npm run lint`
- `npm test`
- `npm run build`
- `npm run build:github-pages`
- `node --test tests/rendered-html.test.mjs`
- `node --test tests/knowledge-system.test.mjs`
- `npm run knowledge:update`
- `npm run knowledge:check`
- `npm run knowledge:search -- "動画クロップ"`
- `npm run worker:docker:check`
- `git diff --check`

結果:

- Build成功
- `/`のサーバーレンダリング成功
- `/admin`のサーバーレンダリング成功
- 店舗所属、管理者の予約予定、店舗別運用状況を検証する自動テスト成功
- 新規登録画面の店舗選択肢がプレースホルダーを含む24件で、23店舗すべてを含むことを確認
- `BLU NERO`が登録選択肢とDB店舗マスターに存在
- スタータープレビューが残っていないことを確認
- Graphify・Obsidian・AI環境モデルのノードID、接続、生成物を専用テストで確認
- Graphify manifestのハッシュと生成統計が最新であることを確認
- Obsidian AI workspace、Graphify Canvas、秘密値マーカー検査が成功
- GitHub Pages向け静的export成功
- Dockerイメージbuild、Node、FFmpeg、libx264、非root実行、crop-planテスト成功
- ESLint error 0、既存warning 1

### 実画面

- ローカル新規登録画面で所属店舗の必須選択を表示
- ローカル新規登録画面で23店舗と`BLU NERO`を表示
- 新規登録画面を1280pxデスクトップで確認
- 新規登録画面を390 x 844のモバイルで確認
- デスクトップ、モバイルとも画面全体の横方向オーバーフローがないことを確認
- 本番通常画面で既存利用者向けの「所属店舗を設定」を表示
- 本番管理者画面で店舗数23、全店舗フィルター、店舗別運用状況を表示
- 本番管理者画面で`BLU NERO`へ切り替えると見出しが店舗別表示へ変わることを確認
- 本番管理者画面で予約予定タブと時系列一覧を表示
- 本番管理者画面をデスクトップと390 x 844のモバイルで確認
- 本番管理者画面のモバイル幅で横方向オーバーフローがないことを確認
- 本番通常画面へGoogle OAuthでログイン
- 通常画面に管理者リンクが管理者だけ表示
- `/admin`の全体件数を表示
- 投稿、ファイル、操作履歴、利用者タブを切り替え
- 利用者タブに管理者1名を表示
- 現在の管理者に解除ボタンが出ないことを確認
- デスクトップ表示を確認
- 390 x 844のモバイル表示を確認
- 表はモバイルで横スクロールし、画面全体を押し広げない
- ローカル環境図を1440 x 1000デスクトップで確認
- ローカル環境図を390 x 844モバイルで確認（大きな図は横スクロール）
- `#knowledge`でAI・Graphify・Obsidian知識循環図を直接表示できることを確認
- 実行環境図にGitHub Pages、Supabase、Edge Functions、Cloud Run、Secret Manager、Artifact Registry、Docker検証、Dropboxミラーを表示
- Obsidianアプリで`アプリ知識` Vaultと`00_AI_START_HERE`を実際に開き、開始手順・環境図・ブリッジへの導線を確認

## 既知の警告と環境上の注意

### Supabase Advisors

- `Leaked Password Protection Disabled`が1件
- Freeプランでは有効化不可
- 他のRLS重複・スキーマ警告は解消済み

### ESLint

- `supabase/functions/integration-secrets/index.ts`のanonymous default export warningが1件
- errorではなく、機能やデプロイを阻害していない

### Docker

- Docker Desktop 28.4.0が起動済み
- 別アプリのSupabaseコンテナ群が稼働しているため、停止・再作成・設定変更を行わない
- Instatic TalksXは`instatic-talksx-media-processor:local`の独立イメージだけを使用
- `npm run worker:docker:check`でDockerfile build、Node 22、FFmpeg 5.1.9、libx264、非rootユーザー、crop-plan 2テストを確認済み
- Docker Desktopを再起動・停止する必要がある場合は、このセッションへ影響し得るため利用者が手動で行う

### Cloud Run

- GCP project、Artifact Registry、runtime/dispatcher service account、Secret Manager、Cloud Run Job、Supabase Edge Function Secretsは構築済み
- ワーカー実装とデプロイ手順は`workers/media-processor/`にある
- 既存GCP資源・Secret・service accountを再作成しない
- 9分16秒動画の処理済みMP4ダウンロード・再生確認だけが未完了

### ローカル開発サーバー

- 記録時点で`127.0.0.1:3000`にNodeプロセスがLISTEN中
- PIDは一時的な値なので引き継ぎ判断には使用しない
- 必要に応じて`npm run dev`を実行

## 現時点の未実装範囲

### SNS連携

- 各SNSのOAuth認可開始・Callback処理
- Access Token更新
- 実際の投稿公開
- 各SNS APIへの処理済み動画アップロード
- 公開結果の取得
- 公開失敗時の再試行
- Rate limit制御
- Webhook署名検証

### 受信箱

- コメント取得
- DM取得
- コメント返信
- DM返信
- 既読・担当者管理

### 分析

- SNS APIからの実績取得
- 投稿別インプレッション
- エンゲージメント
- フォロワー推移
- CSV出力

### 運用

- 定期実行ワーカー
- 予約時刻になった投稿の自動公開
- Dropboxバックアップの自動実行
- 障害通知
- メール通知
- 監査ログの保持期間設定
- 大量データ向けページネーション

### 管理

- 利用者停止
- パスワードリセットの管理者実行
- 管理者による利用者・ワークスペースの所属店舗変更UI
- 管理者による投稿本文編集
- 管理者による安全な論理削除

## 次に着手する優先順位

### 優先度1: Cloud Run動画処理の完了確認

1. アプリの履歴を更新し、対象ジョブが`変換済み`になるか確認
2. `変換済み`のMP4をダウンロードして、クロップ比率と動画時間を確認
3. 15分超または`失敗`なら、Cloud Run Job Executionログと`social_media_jobs.error_message`を確認
4. 必要に応じて既存Jobの設定を修正する。既存のGCP資源、Secret、サービスアカウントを再作成しない

具体的なコマンドと秘密情報の配置先は`workers/media-processor/README.md`を参照。

### 優先度2: SNS OAuth

1. 連携対象SNSを1つに絞る
2. 開発者アプリのClient ID、Client Secretを準備
3. 認可開始URLをEdge Functionで生成
4. Callbackを受けてTokenをserver-only領域へ保存
5. Token更新処理を実装

最初はInstagramまたはThreadsを推奨。複数SNSを同時に実装しない。

### 優先度3: 実際の投稿公開

1. 画像のみの投稿から開始
2. Provider APIへ公開
3. Provider側post IDを保存する列を追加
4. 成功時に`published`
5. 失敗時に`failed`と安全なエラーコードを保存
6. Retry可能な状態を設計

### 優先度4: 予約実行

1. 実行対象投稿を取得するserver-only処理
2. 重複実行防止
3. ロックまたはidempotency key
4. 実行履歴
5. 失敗通知

### 優先度5: バックアップ

1. Dropbox secretsフォルダへserver-only keyを配置
2. `npm run backup:dropbox`を手動実行
3. manifestとファイル数を確認
4. 定期実行方法を決定

## 作業再開手順

1. `/Users/yoshito/Documents/New project`を開く。
2. `git status --short`で利用者の未コミット変更を確認する。
3. `git pull --ff-only origin main`で最新化する。
4. `AI_HANDOFF.md`と`PROJECT_PROGRESS.md`を読む。
5. `.env.local`がない場合はDropbox secretsフォルダの`.env.local`を利用する。値はチャットへ表示しない。
6. `npm install`が必要か確認する。
7. `npm run dev`でローカル起動する。
8. `npm test`で現在の基準状態を確認する。
9. DB変更前に`supabase migration new <name>`を実行する。
10. `supabase db push --linked --dry-run`で確認する。
11. 本番適用後にRollback前提のSQLでRLSを検証する。
12. `supabase db advisors --linked --type all --level warn --fail-on none`を実行する。
13. UI変更時は実画面をデスクトップとモバイルで確認する。
14. Gitへcommit、pushする。
15. Dropboxソースミラーを更新する。
16. `.openai/hosting.json`が存在するため、Sitesで本番公開まで完了する。

## 変更時に守ること

- 秘密値をGitへ入れない。
- `social_integration_secrets`をブラウザへ直接公開しない。
- RLSを無効化しない。
- 管理者画面を隠すだけの認可にしない。必ずDB側でも拒否する。
- 最後の管理者保護を削除しない。
- 投稿本文やシークレットを監査ログへ複製しない。
- 管理者権限をemail文字列で判定しない。Auth user IDを使用する。
- 本番DBへテストデータを残さない。検証はTransactionとRollbackを使用する。
- 利用者の既存Git変更を勝手に戻さない。
- Supabaseのマイグレーション履歴を直接書き換えない。
- Sites ID、version ID、deployment IDを推測しない。

## よく使うコマンド

```bash
npm install
npm run dev
npm run lint
npm test
npm run build
npm run backup:dropbox
supabase migration new <name>
supabase db push --linked --dry-run
supabase db push --linked
supabase migration list --linked
supabase db lint --linked --level warning
supabase db advisors --linked --type all --level warn --fail-on none
supabase functions list --project-ref xpdrewhzisycjdtcvvey
supabase functions deploy integration-secrets --use-api
supabase functions deploy media-jobs --use-api
```

## 完了条件の基準

今後の機能追加は、最低限以下を満たして完了とする。

- TypeScript build成功
- 既存テスト成功
- 新機能のRLSまたはserver-side認可確認
- 一般利用者の拒否確認
- 秘密情報のGit混入なし
- デスクトップ表示確認
- モバイル表示確認
- Git commitとpush
- Dropboxソース同期
- Supabase変更の本番適用
- Sites変更の本番公開
- `PROJECT_PROGRESS.md`の現在状態と継続作業ログの更新

## 継続作業ログ

新しい記録はこのセクションの末尾へ追加する。過去の記録を上書きしない。

### 2026-07-26 21:50 JST - 進行記録の初版作成

- 依頼: 他のAIが現在状態を把握できる詳細な進行記録を作成する。
- 実施内容: 本番、Supabase、認証、管理者機能、Git、Dropbox、未実装項目、再開手順を記録。
- 変更ファイル: `PROJECT_PROGRESS.md`
- DB・設定変更: なし。
- 検証: 本番DB件数、migration同期、Edge Function、Sites v7、Git状態、Dropbox状態を確認。秘密情報スキャンと`git diff --check`に合格。
- デプロイ: アプリ本体の変更がないためSitesデプロイなし。
- Git: commit `62fc116`を`main`へpush。
- Dropbox: ソースミラーへ同期し、内容一致と`.env*`除外を確認。
- 未完了事項: 実データバックアップはserver-only key未配置のため未実行。
- 次の作業: 各SNS OAuthの実装、または利用者が指定する機能。

### 2026-07-26 21:55 JST - AI間の継続記録ルール追加

- 依頼: 次のAIがこの文書を読み、自身の編集結果も同じ文書へ書き込み、さらに次のAIへ引き継ぐことを必須化する。
- 実施内容: 作業開始時、編集中、終了時の必須手順と追記式の継続作業ログを追加。
- 変更ファイル: `PROJECT_PROGRESS.md`
- DB・設定変更: なし。
- 検証: Markdown内容、秘密情報の混入、Git差分を確認。
- デプロイ: アプリ本体の変更がないためSitesデプロイなし。
- Git: commit `356f127`を`main`へpush。
- Dropbox: ソースミラーへ同期し、内容一致と`.env*`除外を確認。
- 未完了事項: なし。
- 次の作業: 次回のAIは作業前にこの文書を読み、作業後にこのログ末尾へ記録を追加する。

### 2026-07-26 22:32 JST - 店舗所属と店舗別管理・予約予定を追加

- 依頼: MARUGO GROUP公式サイトの店舗と`BLU NERO`を登録し、新規登録時の所属店舗選択、通常画面の店舗表示、管理者画面の店舗別表示と予約予定を追加する。
- 実施内容: 公式ブランドページの22店舗に`BLU NERO`を加えた23店舗マスターを作成。メール・Google OAuth登録、既存利用者の初回設定、通常画面の店舗表示、管理者の全店舗／店舗別フィルター、店舗別運用状況、予約予定タブを実装。
- 変更ファイル: `app/social-console.tsx`、`app/admin/admin-console.tsx`、`app/globals.css`、`tests/rendered-html.test.mjs`、`supabase/migrations/20260726130739_add_social_store_affiliation.sql`、`README.md`、`AI_HANDOFF.md`、`PROJECT_PROGRESS.md`。
- DB・設定変更: migration `20260726130739_add_social_store_affiliation.sql`を本番Supabaseへ適用。`social_stores`、プロフィールとワークスペースの`store_id`、店舗RLS、登録metadata検証triggerを追加。店舗23件と`BLU NERO`を確認。
- RLS検証: 匿名の有効店舗SELECTとINSERT拒否、認証済み利用者の未設定店舗の一度限り設定、二度目の変更拒否をTransactionとRollbackで確認。本番の既存プロフィールとワークスペースは未設定のまま。
- テスト: `npm test` 4件成功、`npm run build`成功、`npm run lint`は既存warning 1件・error 0、`git diff --check`成功、差分の秘密値スキャン該当なし。
- 実画面: ローカル登録画面を1280pxと390 x 844で確認。本番通常画面の既存利用者向け所属設定、本番管理者の23店舗、全店舗／店舗別、予約予定、デスクトップと390 x 844を確認。店舗の確定操作は行わず、本番データを変更していない。
- デプロイ: Sites v8を所有者限定のまま本番公開。URLは`https://instatic-talksx.yoshito0428.chatgpt.site`、source commitは`ed6ecf98e37ebd3d5096f3c71f6f1716a02bde54`。
- Git: 実装commit `ed6ecf9`を`main`へpush。記録更新も同じ`main`へ追加commitしてpushする。
- Dropbox: 除外規則を維持してソースミラーへ同期し、`PROJECT_PROGRESS.md`の一致と`.env*`除外を再確認する。
- 未完了事項: 既存利用者1名と既存ワークスペース1件は所属店舗未設定。利用者が次回通常画面で正しい店舗を一度選択する必要がある。管理者による後からの所属店舗変更UIは未実装。
- 次の作業: 利用者が所属店舗を選択後、店舗名が通常画面へ表示されることを確認。その後、優先するSNSのOAuthと実投稿処理へ進む。

### 2026-07-26 23:20 JST - Supabase Free向け動画クロップ基盤を追加

- 依頼: Supabase Freeを維持したまま、Cloud Run Jobsで動画をクロップできる機能を実装する。
- 実施内容: 動画プレビュー、1:1・4:5・9:16・16:9、位置・拡大設定、元動画保持、非同期処理キュー、履歴の状態表示・再実行を実装。Cloud Run向けNode.js/FFmpegワーカーと安全なデプロイ手順を追加。
- 変更ファイル: `app/social-console.tsx`、`app/media-editor.tsx`、`app/globals.css`、`workers/media-processor/`、`supabase/functions/media-jobs/`、migration 2件、テスト、README、AI handoff、進行記録。
- DB・設定変更: `20260726135609_add_social_media_processing.sql`と`20260726141243_fix_media_job_rls_qualification.sql`を本番Supabaseへ適用。Storage上限を50MBへ変更し、`social_media_jobs`、ファイル系譜、RLS、監査triggerを追加。`media-jobs` Edge FunctionをJWT検証付きで本番公開。
- RLS検証: `anon`にテーブル権限がないこと、RLS有効、認証済み利用者の正しい動画ジョブ作成成功、元動画とジョブの投稿・ワークスペース一致条件を確認。検証データはTransactionとRollbackを使用し、本番残存0件を確認。
- テスト: `npm test` 7件成功、`npm run build`成功、`supabase db lint`エラー0、Edge Function未認証POSTは401、Supabase Advisorsは既知のPro限定Auth警告1件のみ。
- セキュリティ: service role、Google service-account JSON、SNSシークレットはGitへ追加していない。Cloud Run側はGoogle Secret Manager、Dispatcher側はSupabase Secretsへ保存する手順。
- デプロイ: Supabase DBと`media-jobs` Edge Functionを本番反映。Sites v9を所有者限定アクセスのまま`https://instatic-talksx.yoshito0428.chatgpt.site`へ本番公開。Sites source commitは`1a1a79b2f7477b57bb877362adc6228eac88e26f`。
- Git: 実装commit `1a1a79b2f7477b57bb877362adc6228eac88e26f`を`main`へpush。公開結果を記録する文書commitも同じ`main`へpushする。
- Dropbox: `.env*`を除外してソースミラーへ同期し、`PROJECT_PROGRESS.md`の一致と秘密ファイル除外を確認する。
- 未完了事項: Cloud Run Job自体はGCPプロジェクト未選定、`gcloud`未導入、Docker未起動、server-only key未配置のため未デプロイ。接続前のジョブは`queued`で保持される。
- 次の作業: 使用するGCPプロジェクトを所有者が指定後、`workers/media-processor/README.md`に従ってCloud Runを接続し、50MB未満の実動画1件で処理完了を確認する。

### 2026-07-27 00:25 JST - Cloud Run動画処理環境の構築とAI引き継ぎ更新

- 依頼: 使用量枠が近いため、次のAIが現在状態を問題なく引き継げるよう、実装・本番・Cloud Run設定・未完了事項を記録する。
- 実施内容: Google Cloud project `instatic-talksx-media`を使用。必要APIを有効化し、Artifact Registry、FFmpeg worker image、runtime service account、Secret Manager secrets、Cloud Run Job、Dispatcher service accountと実行権限を作成。Supabase Edge Function SecretsへCloud Run接続設定を保存。
- 実行済みコマンドの要約: `gcloud services enable`、`gcloud artifacts repositories create`、`gcloud builds submit`、service account作成、Secret Manager登録・IAM付与、`gcloud run jobs create`、Dispatcher IAM付与、service account JSON作成・ダウンロード・Cloud Shell側削除。
- 変更ファイル: `PROJECT_PROGRESS.md`。アプリコードの変更なし。
- DB・設定変更: Supabase DB migrationの追加なし。既存の`media-jobs` Edge Functionと既存Secretsを利用。Cloud Run JobとGoogle Cloud IAM/Secret Manager設定を追加。
- セキュリティ: Supabase Secret keyとGoogle service account JSONはチャット、スクリーンショット、Git、Dropboxソースミラーへ記録していない。ダウンロードしたJSONのCloud Shell側ファイルは削除済み。Macのダウンロードフォルダ側の一時JSONは利用者が削除する運用として案内済みで、次のAIは再取得しない。
- テスト結果: Artifact Registry buildは`STATUS: SUCCESS`。Cloud Run Job作成成功。アプリで9分16秒動画をクロップ保存し、処理中表示まで確認。変換済みMP4のダウンロード・再生、Cloud Run Execution成功、動画時間の確認は未完了。
- デプロイ先: 本番Sitesは既存v9のまま。Supabase `media-jobs` Edge Functionは既存本番版を使用。Cloud Run Jobは`instatic-media-processor`。
- Git: 作業開始時HEADは`bb23a9a221221b53fa7394b72ed22c9a0dcabfa1`。この記録更新を新しいcommitとして`main`へ保存・pushする。
- Dropbox: Gitソースミラーを更新し、`PROJECT_PROGRESS.md`をGit作業場所と一致させる。`.env*`と秘密JSONは同期しない。
- 未完了事項: 9分16秒動画が15分以内に`変換済み`へ遷移するか未確認。遷移しない場合は既存Cloud Run Executionログ、Supabase job status、workerのエラーを調査する。SNS API連携・実投稿公開は未実装。
- 次のAIへの最初の作業: `PROJECT_PROGRESS.md`と`AI_HANDOFF.md`を全文確認し、`git status`を確認。既存資源を再作成せず、まずアプリ履歴を更新して変換済みMP4を確認する。秘密値は表示・取得・再発行しない。

### 2026-07-27 00:40 JST - GitHub Pagesのトップ表示を修正

- 依頼: GitHub PagesのURLを開くとREADMEが表示されるため、トップページからアプリを開けるようにする。
- 実施内容: リポジトリルートに`index.html`を追加。GitHub Pagesのトップアクセスを本番アプリURLへ即時リダイレクトし、自動遷移できない場合のリンクも表示する。
- 変更ファイル: `index.html`、`PROJECT_PROGRESS.md`、`AI_HANDOFF.md`。
- DB・設定変更: なし。GitHub Pagesはアプリ実行環境ではなく、本番アプリはOpenAI Sites上で動作するため、Pages側は本番URLへの入口として扱う。
- 検証: `git diff --check`とHTML内容を確認。GitHub Pagesの反映後、`https://marugo-s.github.io/sms-management/`を開き、本番URLへ遷移することを確認する。GitHub Pagesの反映には数分かかる場合がある。
- 未完了事項: GitHub Pagesのリモート反映後のブラウザ確認は未完了。ブラウザキャッシュが残る場合はプライベートウィンドウまたは強制再読み込みを使う。
 - 次の作業: GitHub Pages URLを再読込し、本番アプリへ遷移することを確認。アプリの機能変更は本番Sites側のデプロイで行い、GitHub Pages用の`index.html`をアプリ本体と混同しない。

### 2026-07-27 01:00 JST - 予約投稿キャンセル機能を追加

- 依頼: 投稿の予約をキャンセルできるようにする。
- 実施内容: 予約一覧の各予約投稿にキャンセルボタンを追加。確認ダイアログ後、対象投稿がまだ`scheduled`の場合だけ`status=draft`、`scheduled_at=null`へ更新し、本文・添付ファイル・履歴は削除しない。キャンセル後は予約一覧から消え、履歴の下書きとして残る。
- 変更ファイル: `app/social-console.tsx`、`app/globals.css`、`PROJECT_PROGRESS.md`、`AI_HANDOFF.md`。
- DB・設定変更: migrationなし。既存のworkspace member RLS付き`social_posts` UPDATEを使用し、対象状態を`scheduled`に限定。
- テスト: `npm test`成功。既存7テスト全てpass。`git diff --check`成功。
- デプロイ: Sites本番バージョン10として公開完了（2026-07-27 01:03 JST）。本番URLは`https://instatic-talksx.yoshito0428.chatgpt.site`。Supabase DB・Edge Function変更なし。
- 未完了事項: 認証済みブラウザ上で予約投稿を1件キャンセルし、予約一覧からの消失と履歴での下書き表示を実操作確認すること。未認証のHTTP確認は所有者限定公開のため`401`となる。
- 次の作業: 認証済み本番画面で予約投稿を1件選び、確認ダイアログ、予約一覧からの消失、履歴での下書き表示を確認する。既存の動画Cloud Run資源や秘密値は触らない。

### 2026-07-27 01:25 JST - Graphify管理者用システムマップを追加

- 依頼: インストール済みのGraphifyをSNS管理アプリへ最適化して対応する。
- 実施内容: `/admin`に管理者専用の`システムマップ`タブを追加。Graphifyのコード構成グラフをアプリ内で表示し、別画面でも確認できるようにした。更新用に`npm run graphify:system-map`と`scripts/refresh-system-map.sh`を追加。
- 解析範囲: `graphify extract . --code-only --out .`でアプリのコード構成のみを対象にした。投稿本文、添付ファイル、Supabaseの本番データ、環境変数、SNS連携情報、秘密キーは解析・表示・送信しない。`graphify-out/`はローカル作業用としてGitとDropboxソースミラーから除外する。
- 生成結果: 254ノード、269関係、25コミュニティ。Graph診断でmissing edge、dangling edge、self-loop、collapsed edgeは0件。
- 変更ファイル: `app/admin/admin-console.tsx`、`app/globals.css`、`public/system-map/graph.html`、`public/system-map/GRAPH_REPORT.md`、`scripts/refresh-system-map.sh`、`package.json`、`.gitignore`、`README.md`、`AI_HANDOFF.md`、テスト。
- DB・設定変更: Supabase migration、Edge Function、Cloud Run、Google Cloud、SNS APIの変更なし。Graphify CLIはCodex開発環境にのみインストール済みで、アプリ利用者端末に依存関係を追加していない。
- 検証: `npm test`は7件すべて成功、`git diff --check`成功。ローカルで`/admin`の既存管理者ログイン制限を確認し、`/system-map/graph.html`が254ノード・269関係のインタラクティブグラフとして描画されることを確認。公開対象の秘密値スキャンで新規の秘密値混入なし。
- デプロイ: Sites v11を所有者限定アクセスのまま本番公開。URLは`https://instatic-talksx.yoshito0428.chatgpt.site`、source commitは`827d5ddf03a7e6e4699dfd69cf949b813df012d0`。Supabase DB・Edge Function、Cloud Run、Google Cloudの変更なし。
- 次の作業: コード構成を大きく変更した時だけ`npm run graphify:system-map`を実行し、生成された公開用マップをレビューしてから本番へデプロイする。Graphifyを実データ処理に使う場合は、別途Supabase RLS・Storage・Cloud Runを含む設計を行う。

### 2026-07-27 01:56 JST - 本番サイトのChatGPT認証ゲートを解除

- 依頼: GitHub Pagesから本番URLへ転送された際にChatGPT認証画面が出る状態を、通常の本番運用として利用できるようにする。
- 実施内容: OpenAI Sitesのアクセス設定を`public`へ変更し、既存ソースをSites v12として再公開した。GitHub Pagesの`index.html`による転送先は変更していない。
- 検証: 本番URLへの未認証HTTPアクセスが`200`となり、HTMLのタイトルが`Instatic TalksX`であることを確認。以前の`Sign in required` / ChatGPT認証ゲートは返らない。
- セキュリティ: 公開されるのはアプリのログイン画面まで。業務データ、ファイル、管理画面、SNS連携情報は引き続きSupabase AuthとRLSで保護され、Supabaseの秘密キーやSNSキーはブラウザへ公開していない。
- デプロイ: Sites v12、source commit `93f90337cfafe1b48228117b426815ab9a70a3f4`、本番URL `https://instatic-talksx.yoshito0428.chatgpt.site`。
- DB・設定変更: Sitesのアクセス設定以外に、Supabase migration、Edge Function、Cloud Run、Google Cloud、SNS APIの変更なし。
- 次の作業: ブラウザで`https://marugo-s.github.io/sms-management/`を再読み込みし、ChatGPT認証画面なしでアプリのSupabaseログイン画面が開くことを確認する。GitHub Pagesをアプリ実行環境としては扱わない。

### 2026-07-27 02:20 JST - GitHub Pagesをアプリ本体の本番URLへ切替

- 依頼: GitHub URLから転送ではなく、`https://marugo-s.github.io/sms-management/`そのものをアプリの本番URLとして利用したい。
- 実施内容: Vinextの静的exportを追加し、GitHub Actionsで`main`更新時に`dist/client`をGitHub Pagesへ公開する`.github/workflows/deploy-github-pages.yml`を追加。GitHub Pagesのbuild typeを`workflow`へ切替済み。プロジェクトPages配下の`/sms-management/`に合わせ、生成物のアセット・メタデータURLを`scripts/prepare-github-pages.mjs`で正規化し、画面内の管理リンク・Graphifyマップ・Supabase Authの戻り先を`app/lib/public-path.ts`経由で同じパスへ揃えた。
- GitHub設定: Actions Secret `NEXT_PUBLIC_SUPABASE_URL`と`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`を登録済み。値はGit、作業ログ、Dropboxソースミラー、文書へ記録していない。Secret/service role key/SNS秘密情報は追加していない。
- テスト: `npm run build:github-pages`が`/`と`/admin`を静的生成し、`dist/client/index.html`と`dist/client/admin/index.html`を確認。静的HTML/RSC内のアセット参照が`/sms-management/`配下になることを検査。`npm test`は7件すべて成功、`git diff --check`成功。
- 必須の手動設定: Supabase Dashboard > Authentication > URL ConfigurationのRedirect URLsに`https://marugo-s.github.io/sms-management/**`を追加する。追加前はGitHub Pages上のメール確認、パスワード再設定、Google OAuthの戻り先が拒否されるため、本番ログイン確認を行わない。
- 次の作業: 本commitを`main`へpushし、GitHub ActionsのPagesデプロイ成功を確認。次にGitHub Pages URLをブラウザで開き、ログイン画面、`/admin/`、システムマップのアセット読み込みを確認する。SupabaseのRedirect URL追加後にメール認証またはGoogle OAuthを1回実操作で確認する。

### 2026-07-26 03:26 JST - Graphifyシステムマップを最新コードへ更新

- 依頼: Graphifyの既存グラフを最新化し、管理画面用システムマップの更新、コードグラフへの質問、`appPath()`ノードの説明をすべて実施する。
- 実施内容: `npm run graphify:system-map`を実行し、commit `254ae115`時点のコードを再抽出・クラスタリング。管理画面が参照する`public/system-map/graph.html`と`GRAPH_REPORT.md`を更新した。Graphify query/path/explainで動画クロップ、管理者画面、GitHub Pages向けbase pathの構造を確認した。
- Graphify結果: 264ノード、282関係、26コミュニティ。前回の254ノード、269関係、25コミュニティから増加。`appPath()`が5関係のGod Nodeとして追加され、`SocialConsole()`および`AdminConsole()`から呼び出される構造を確認。
- 経路確認: `processJob()`は`probeVideo()`、`createCropPlan()`、`run()`、`updateJob()`等を呼び出す。`createCropPlan()`は`clamp()`を使用し、テストからもimportされる。UIとCloud Run worker間はSupabase DB、Edge Function、Cloud Runの実行時境界をまたぐため、コード限定の静的グラフでは単一の`path`として接続されない。
- 管理者権限確認: 管理者UIの`AdminConsole()`は抽出されたが、権限付与・解除の中核はSupabase migration内のSQL/RLS/triggerであり、現在のGraphifyコード抽出対象ではSQL migrationが分類されないため、自然言語queryだけでは該当ノードを返さなかった。権限設計の検証にはmigrationを直接確認する。
- 変更ファイル: `public/system-map/graph.html`、`public/system-map/GRAPH_REPORT.md`、`PROJECT_PROGRESS.md`。
- DB・設定変更: Supabase migration、Edge Function、Cloud Run、Google Cloud、SNS API設定の変更なし。
- テスト: `npm test`成功。7件すべてpassし、ビルドも成功。
- デプロイ: commit `981c7ac04a45e08598eb4dc8a3ab3e9aaecb3177`を`main`へpush。GitHub Actions `Deploy Instatic TalksX to GitHub Pages`（run `30214762150`）は成功。公開中の`/system-map/GRAPH_REPORT.md`と`graph.html`はいずれもHTTP 200で、264ノード、282関係の最新版を確認した。OpenAI Sitesはこの作業では変更していない。
- Dropbox: commit後にGit管理ツリーを`/Users/yoshito/Library/CloudStorage/Dropbox/web/instatic-talksx/`へ同期し、`.env.local`と`.git`を含めない。
- 次の作業: GitHub ActionsのPagesデプロイ成功後、`/sms-management/admin/`でシステムマップが264ノード、282関係の最新版として開くことを確認する。管理者権限フローをGraphifyで横断探索したい場合は、SQL migrationを安全に含める抽出設計を別途追加する。

### 2026-07-26 03:39 JST - Graphify優先のコード調査を絶対事項として明文化

- 依頼: Graphifyがあるので、当てずっぽうの`grep`／`read`の連打を繰り返さない運用を、MDファイルへ絶対事項として記載する。
- 実施内容: `PROJECT_PROGRESS.md`の「AI引き継ぎの必須ルール」に「### コード調査の必須手順（絶対事項）」を追加し、`AI_HANDOFF.md`に「## Mandatory Graphify-first code investigation」を追加した。Graphifyで場所と関係を特定してから必要箇所だけを読むこと、SQL/RLS・実行時フロー・分類対象外ファイルは直接確認すること、コード変更後は`npm run graphify:system-map`で更新すること、Graphifyの入力をコード限定に保つことを明記。
- 変更ファイル: `PROJECT_PROGRESS.md`、`AI_HANDOFF.md`。
- DB・設定変更: なし。アプリコードの変更なし（ドキュメントのみ）。
- テスト: ドキュメント変更のため`npm test`は再実行せず。`git diff --check`で確認する。
- デプロイ: 本commitを`main`へpushし、GitHub Actionsが実行される（アプリ挙動への影響はドキュメントのみのため無し）。OpenAI Sitesは変更しない。
- Dropbox: commit後にGit管理ツリーをソースミラーへ同期し、`.env.local`と`.git`を含めない。
- 次の作業: 次回以降のコード調査は、まずGraphify（query/path/explain）で当たりを付けてから該当箇所だけを読む運用を守る。

### 2026-07-26 04:00 JST - Dropbox同期のObsidian知識Vaultをアプリ別構成で導入

- 依頼: Obsidianを外部記憶として利用し、Dropboxで複数のデスクトップPCへ同期する。複数アプリを同じVault内でアプリごとに分離し、Instatic TalksXのGraphify知識を自動更新できるようにする。
- Vault: `/Users/yoshito/Library/CloudStorage/Dropbox/web/アプリ知識`。`00_総合/`、`10_アプリ別/`、`90_共通知識/`を作成し、Instatic TalksXは`10_アプリ別/Instatic TalksX/`内に概要・設計・運用・意思決定・障害・機能別・Graphifyの番号フォルダで分離した。
- 初期ノート: Vaultトップ、アプリ一覧、全アプリ共通ルール、Instatic TalksXホーム、概要、アーキテクチャ、デプロイ、意思決定、障害、動画クロップ、管理者権限を作成。Vaultへ秘密情報・本番個人データ・投稿本文・添付ファイルを保存しないルールを明記した。
- Graphify: `90_Graphify/`へObsidian形式を出力。コード変更と更新スクリプトを含む最新グラフは267ノード、284関係、27コミュニティ。294件のMarkdownノートと`graph.canvas`を生成した。自動生成領域は手編集禁止。
- 自動更新: `scripts/update-knowledge-vault.sh`と`npm run knowledge:update`を追加。管理画面用`public/system-map/`更新、Obsidian Graphify出力、秘密値マーカー検査を1コマンドで行う。別PCでは`KNOWLEDGE_VAULT_GRAPHIFY_DIR`で出力先を上書き可能。
- 変更ファイル: `scripts/update-knowledge-vault.sh`、`package.json`、`README.md`、`AI_HANDOFF.md`、`PROJECT_PROGRESS.md`、`public/system-map/graph.html`、`public/system-map/GRAPH_REPORT.md`。Vault側はDropbox同期対象だがGitリポジトリ外。
- DB・設定変更: Supabase、Cloud Run、SNS APIの変更なし。
- 検証: `npm run knowledge:update`成功。Graphify code-only更新、Obsidian出力、秘密値ガードを完走。続けて`npm test`、`git diff --check`を実行する。
- デプロイ: commit後に`main`へpushし、GitHub ActionsでGitHub Pagesへ公開する。OpenAI Sitesは変更しない。
- Dropbox: ソースミラーとObsidian Vaultは別フォルダ。ソースミラーには`.env.local`と`.git`を含めない。VaultはDropbox同期完了後に別PCで同じフォルダをObsidian Vaultとして開く。
- 次の作業: 別のアプリを追加する場合は`10_アプリ別/<アプリ名>/`を作り、そのアプリ固有のGraphify出力先を設定する。2台で同じノートを同時編集しない。

### 2026-07-26 19:41 UTC - Graphify・Obsidian・AI・Dockerを統合した開発知識環境を構築

- 依頼: GraphifyとObsidianを十分に連携させ、アプリ開発に役立つシステム構成をまとめ、AI自身が両方を活用できる環境図を作る。利用可能になったDockerも必要箇所で使用する。
- 設計: Graphifyを「現在コードの場所・関係・経路」、Obsidianを「設計意図・意思決定・運用・障害・機能知識」、Git作業コピーを「実装とテストの正本」、AIを「検索・構造探索・精読・実装・検証・書き戻しを循環させる主体」と定義した。会話コンテキストは永続記憶として扱わない。
- AI作業フロー: `knowledge:search`で手書きObsidian知識を検索 → `knowledge:check`で整合性確認 → Graphify query/path/explainで該当コードを特定 → 必要箇所だけ精読 → 実装/検証 → 手書きObsidianノートと`PROJECT_PROGRESS.md`へ書き戻し → 構造変更後に`knowledge:update`。
- 構成モデル: `knowledge/system-architecture.json`を環境構成の正本とし、`scripts/generate-knowledge-system.mjs`からWeb環境図、Graphify統計、AI向けMarkdown、Obsidian Markdown、Obsidian Canvasを同時生成することで内容ずれを防止。
- AI入口: ルート`AGENTS.md`を追加。Obsidianへ`70_AI作業環境/00_AI_START_HERE.md`、実行環境図、AI知識循環図、情報源優先順位、作業チェックリスト、Graphify/Obsidianブリッジ、Canvas 2件を生成。Obsidianアプリ上で`00_AI_START_HERE`を実際に開き内容を確認した。
- Graphify/Obsidianブリッジ: 主要機能について手書きノートとGraphifyノードを相互リンク。`npm run knowledge:search -- "<依頼・症状・機能名>"`を追加し、通常は自動生成`90_Graphify/`を除外して設計・運用・障害・機能知識を検索できるようにした。
- 管理画面: `/admin`のシステムマップを「コード構成」と「実行環境・AI知識循環」の切替表示へ拡張。Graphify統計は`public/system-map/graph-stats.json`から取得し、ノード数等の固定値陳腐化を防止。環境図は`#runtime` / `#knowledge`で直接表示可能。
- 環境図: GitHub Repository/Actions/Pages、ブラウザUI、Supabase Auth/Postgres RLS/Storage、integration-secrets/media-jobs Edge Functions、Artifact Registry、Cloud Run Job、Secret Manager、Dropbox source mirror、Docker Desktop検証を実行環境図へ記載。AI入口、Graphify CLI/graphify-out、Git作業コピー、必要箇所精読、実装/テスト/デプロイ、Obsidian Vault、90_Graphify、knowledge:update/search、Dropbox同期を知識循環図へ記載。
- 自動化: `npm run knowledge:update`をGraphify更新、Obsidian export、環境図・AI文書生成、整合性/秘密値検査まで行う処理へ強化。`npm run knowledge:check`、`knowledge:generate`、`knowledge:search`を追加。`.graphifyignore`で生成物・docs・knowledgeモデルをGraphify再解析から除外。
- Docker: 起動済みDocker Desktop 28.4.0を確認。既存の別アプリ用Supabaseコンテナ群を停止・変更せず、`instatic-talksx-media-processor:local`だけを独立build。`npm run worker:docker:check`を追加し、Cloud Runに近い`linux/amd64`イメージ、Node 22.23.1、FFmpeg 5.1.9、libx264、非root nodeユーザー、crop-plan 2テストを確認。さらにコンテナ内で1秒のテスト動画を生成し、実際のcrop-plan filterで9:16の1080×1920 H.264/AAC MP4へ変換、`ffprobe`で`video=h264,1080,1920`、`audio=aac`、duration 1.000000秒を確認。
- Graphify結果: 326ノード、343関係、32コミュニティ。Obsidian `90_Graphify/`はGraphify生成ノート358件、運用説明`_README.md`、`graph.canvas`、生成manifestで構成。Graphify manifest hash、Web生成物、Obsidian AI workspace、Canvas、秘密値マーカー検査はすべて成功。
- 実画面: ローカル環境図を1440 x 1000と390 x 844で確認。デスクトップは全体構成を表示し、モバイルは統計を2列化、タブを横スクロール、大型図を横スクロールで閲覧できる。`#knowledge`でAI知識循環図を直接表示できることを画像確認した。
- 変更ファイル: `AGENTS.md`、`.graphifyignore`、`knowledge/system-architecture.json`、`docs/AI_CONTEXT.md`、`docs/AI_KNOWLEDGE_SYSTEM.md`、`scripts/generate-knowledge-system.mjs`、`scripts/check-knowledge-system.mjs`、`scripts/search-knowledge-vault.mjs`、`scripts/check-media-worker-docker.sh`、`scripts/update-knowledge-vault.sh`、`package.json`、管理画面/CSS、公開system-map生成物、テスト、README、AI handoff、進行記録。Obsidian側はDropbox同期対象でGit外。
- DB・設定変更: Supabase DB migration、Edge Function本番、Cloud Run本番、Google Cloud IAM/Secret、SNS API設定の変更なし。既存Dockerコンテナの停止・再作成なし。
- テスト: `npm run knowledge:update`成功、`npm run knowledge:check`成功、`npm run lint`はerror 0・既存warning 1、`npm test`は9件すべてpass、`npm run build:github-pages`成功、`npm run worker:docker:check`成功（linux/amd64 build、Node/FFmpeg/libx264/非root、crop-plan 2件、実9:16 MP4のH.264/AAC encode/probe）。`knowledge:search`で動画クロップ、管理者権限、Docker/Cloud Run知識が手書きノートから取得できることを確認。
- Git: 統合実装commit `96acd595c8483e09d836a2e907fbd27e6519f8d9`、Graphify生成物整合commit `d0e49dc512436ec4cb1cbb784ffbce98ed66f5ce`、公開記録commit `b538fb0b37675d97e62f4254bb99ebd96afb8a8c`、linux/amd64実MP4スモークテストcommit `45c8da6d1356f468809bf718ceba17af87ce41ad`、生成物整合commit `e51125c3e18d1f0b2f9937a973e02e91c989be04`を`main`へpush。
- デプロイ: 最新のGitHub Actions `Deploy Instatic TalksX to GitHub Pages` run `30218468590`（HEAD `e51125c3e18d1f0b2f9937a973e02e91c989be04`）は成功。`/system-map/environment.html`と`graph-stats.json`はHTTP 200で、公開環境図に`linux/amd64`、実MP4変換、Graphify × Obsidian × AI、326ノード、343関係、32コミュニティを確認。公開manifestにローカル`/Users/`パスが無いことを確認。OpenAI Sites、Supabase、Cloud Run本番は変更していない。
- Dropbox: commit後にGit管理ツリーを`instatic-talksx`ソースミラーへ同期し、`.git`と`.env*`を含めない。Obsidian Vaultは`アプリ知識`で独立同期し、同じノートを複数PCで同時編集しない。
- 未完了事項: 認証済み本番`/admin`でシステムマップの2表示を切り替える最終操作確認。本番データに関する既存未完了（9分16秒動画の変換済みMP4再生確認、SNS実連携）は継続。
- 次の作業: 次の開発依頼からこの知識フローを実運用する。別アプリをVaultへ追加する際は、アプリ固有の`70_AI作業環境/`、`90_Graphify/`、構成モデル、更新/検査/検索コマンドを同じ設計で用意する。

### 2026-07-28 01:30 JST - Cloud Run動画処理の停止を修復

- 依頼: 履歴で処理中のままになっていた動画1件の原因を調査し、再発しない形で修復する。
- 原因1: Cloud Run Executionは起動していたが、Secret Managerの`SUPABASE_SECRET_KEY`が無効で、workerの最初のREST取得が`401 Invalid API key`になっていた。正しいSupabase secret keyを新しいSecretバージョンとして追加し、Cloud Run Jobは固定バージョンを参照するよう更新。
- 原因2: key修正後、固定2.6Mbpsで生成したMP4がSupabase Storageの50MB上限を超え、uploadが`400`になった。動画時間から安全なビットレートを計算し、長尺時だけ720ベースへ縮小する`encoding-plan.mjs`を追加。50MBを超える出力はupload前に失敗へ移し、品質を保てない極端な長尺動画は明確なエラーにする。
- 原因3: Edge FunctionがCloud Run APIの受付時点で`processing`にしていたため、worker起動前・起動直後の失敗が永久に処理中表示となった。`dispatching`状態を追加し、worker開始時だけ`processing`へ変更。20分以上更新されない`dispatching`/`processing`を安全に再配送可能にした。
- 冪等性: 同じjob IDで再実行しても、固定Storageパスと`storage_path`競合upsertを使い、処理済みファイル行を重複させない。既存の処理済み行があればジョブだけ`completed`へ回復する。
- 本番反映: migration `20260727152027_add_media_job_dispatching_state.sql`を適用。`media-jobs` Edge Functionを再デプロイ。Cloud Run workerを固定digestへ更新。Google Secret Managerの秘密値そのものはGit・チャット・文書へ記録していない。
- 実データ復旧: 対象jobを同じID・元動画のまま再実行し、Cloud Run Executionは6分57秒で成功。DBは`completed`、`attempts=3`、エラーなし、処理済みファイルは44,992,238 bytes。元動画1件・処理済み動画1件で重複なし。
- 実ファイル検証: 元動画はH.264/AAC・1280×720・235.01秒・43,608,654 bytes。処理済みはH.264/AAC・1080×1920・235.01秒・44,992,238 bytes。以前の「9分16秒」は誤記で、実ファイルは3分55秒。時間欠落なし。
- テスト: `deno check`成功、`npm run lint`はerror 0・既存warning 1、`npm test`は12件すべて成功、`npm run worker:docker:check`成功。9分16秒相当の計算テストでは720×1280・推定43.2MiBとなることを確認。
- 次の作業: 本番履歴を再読み込みし、利用者画面で「変換済み」とダウンロード操作を確認する。今後Cloud Runに失敗が出た場合は、DBの`error_message`とExecutionログの両方を確認する。

### 2026-07-28 02:00 JST - 履歴動画のアプリ内再生を追加

- 依頼: 動画ファイルを毎回ダウンロードせず、アプリ内で閲覧できるようにする。
- 実施内容: 履歴の保存ファイル一覧で、動画行を押すとアプリ内プレーヤーを開くよう変更。元動画・変換済み動画の両方に対応し、再生・シーク・音量・全画面などブラウザ標準controlsを利用。ダウンロードは動画行右側の「保存」とプレーヤー内ボタンに分離して維持。
- セキュリティ: 非公開`post-files` bucketを維持。動画を開いた時だけ1時間有効の署名URLを発行し、DB・localStorage・GitへURLを保存しない。ログアウト時にプレーヤーを閉じる。
- 操作: Esc、閉じるボタン、背景クリックで終了。URL取得中はローディング表示。URL取得失敗と動画読み込み失敗を画面へ表示。連打や別動画への切替では古い非同期応答を無視する。
- レスポンシブ: デスクトップは最大980pxのモーダル、モバイルは全画面プレーヤー。動画以外のファイルは従来どおり行クリックでダウンロード。
- 検証: `npm test`は12件すべて成功。実本番動画の署名URLへRange requestを送り、`HTTP 206`、`content-type: video/mp4`、`content-range: bytes 0-1023/44992238`を確認。ファイル全体を先に取得せずストリーミング再生できる。
- 次の作業: 本番履歴で元動画と変換済み動画をそれぞれ開き、画面上の再生・シーク・閉じる・保存を操作確認する。

### 2026-07-28 - 動画タイムライン編集を追加

- 依頼: 動画の開始・終了調整と、タイムライン途中のカットを実装する。
- UI: 投稿画面で動画を添付し「動画編集」を開く。縦横比・横位置・縦位置・拡大に加え、開始・終了を数値入力・スライダー・現在位置ボタンで0.1秒単位に設定。タイムラインをクリックしてシークでき、複数の途中カットを追加・削除できる。
- プレビュー: 元動画・編集後時間・総削除時間を表示。緑を使用範囲、灰色の前後と赤を削除範囲として表示。再生・シーク時は途中カットを自動で飛ばし、音声を含めて確認できる。
- 正規化: カットは時刻順に並べ、重複・接触範囲を統合。開始・終了外の範囲は切り詰める。最大32件、1件0.1秒以上、編集後0.5秒以上。無効値、全範囲削除、件数超過は理由を画面表示して保存しない。
- DB: migration `20260727171106_add_media_timeline_editing.sql`、`20260727204751_harden_media_timeline_validation.sql`、`20260728040605_enforce_media_timeline_remaining_duration.sql`を本番適用。`crop_config`の既存クロップ項目と任意の`startTime`・`endTime`・`cuts`をprivate validatorで検証し、重複カット統合後も0.5秒以上残ることを最終保証。旧クロップのみのjobは互換維持。
- Worker: `timeline-plan.mjs`で残す区間を作り、FFmpeg `trim`/`atrim`/`concat`で映像・音声を同じ位置で編集してからクロップ・スケール・容量調整を行う。音声なし動画にも対応。出力時間を使って50MB向けビットレートを計算。
- 本番: Cloud Run workerを固定digest `sha256:74ae97bc5705d8704c695b147edcc79053517c8c2607ca257a66f5dc97b0945b`へ更新。既存完了済みクロップjobを無変更で読み込む最終互換スモークExecutionは11.08秒で成功。
- 検証: `npm test`は16件すべて成功。`npm run worker:docker:check`で、5秒の音声付き動画から先頭0.5秒・末尾0.5秒・途中1秒を削除して3.000秒、3秒の音声なし動画から前後と途中を削除して1.500秒、H.264/AACまたはH.264音声なしを`ffprobe`確認。DB migrationはロールバック検証でvalid=true、短すぎる出力・短すぎるcut・不正型・統合後0.5秒未満=false。Supabase Advisorsは既知のPro限定Auth警告1件のみ。
- 本番E2E: 既存元動画を変更せず一時jobを作成し、開始1秒・終了5秒・途中2〜3秒を削除。Cloud Run Executionは19.45秒で成功し、出力は3.003秒・H.264/AAC・1080×1920・1,089,285 bytes。検証用Storage object、job、file row、audit logは削除し、既存元動画と既存completed jobを保持した。
- 次の作業: 公開後、投稿画面で実動画を添付し、開始・終了・途中カットを保存して、履歴の編集済み動画をアプリ内再生確認する。

### 2026-07-29 - 解凍変換ソフト 2026年6月集計の重複を修正

- POS日報写真の正解（料理922,700円＋ドリンク596,600円＝1,519,300円）と元LZHを照合。旧集計の3,074,600円は、`ｵｰﾀﾞｰｷｬﾝｾﾙ`控え、全角`ＶＯＩＤ`、`取引変更終了`レコードの二重計上が原因。
- `VOID_RE`へ取消パターンを追加し、2026年6月は63件・1,519,300円となることを独立再集計で確認。Mac/Windows版を再ビルド。
- Unicode正規化で半角/全角表記を吸収し、商品明細の数量マイナスを伴う単独の「取消」は確定会計として残す判定に整理。2024年3月・2026年6月で回帰確認。
- 詳細と検算値はObsidianの「売上PDFレポート」ノートへ追記。

### 2026-07-29 - 解凍変換ソフトの最終解析監査と訂正

- 訂正: 直前ログの「取引変更終了を除外」は逆だった。実ジャーナルでは`取引変更開始`が旧伝票、`VOID`が取消、`取引変更終了`が置換後の確定伝票。開始とVOIDを除外し、終了側を採用する。
- 実装: 支払確定行必須、VOID対象伝票番号の除外、商品名と状態行の分離、日計精算の一意選択、売上・総売上・税・点数・組数・客数・営業日付・支払方法の一致検査を追加。不一致や日計なしはPDFを作らず理由を表示するフェイルクローズへ変更。
- 支払方法: 日計の各ラベル行と直後2行だけを読み、0円欄から後続金額へ読み越す不具合を修正。個別レシートの語句推測ではなく日計精算を正本とする。
- 入力保護: LZHのサイズ・範囲・展開サイズ・CRC-16、文字化け、重複ファイルの全バイト一致、同一伝票の時刻・支払・商品内訳差異、複数月混在、macOSの`._`管理ファイルを検査。
- 保存保護: 解析版`2026-07-29-v3`と検算版`daily-summary-reconcile-v1`を保存レポートへ記録。旧解析版は表示上警告し、PDF再保存を無効化。
- 回帰結果: 2024年3月23 LZHは71件・71組・161名・2,130,900円・税193,685円・766点・平均客単価13,235円。支払はクレジット1,781,662円・現金346,900円・その他2,338円。2026年6月21 LZHは63件・63組・137名・1,519,300円・税138,093円・475点・平均客単価11,090円。支払はクレジット1,388,600円・現金130,700円。全44ファイルで重大エラー0件。
- UI確認: 読込カード2件から個別削除で1件になること、残った実ファイルから月間プレビューが開き自動検算OKになることを実画面で確認。
- 配布物: Dropbox正本`jnl2txt.html`、Mac版`解凍変換ソフト.app`、Windows版`dist/解凍変換ソフト-Windows-x64.zip`を同一HTMLで再ビルド。Mac署名検証、Windows ZIP整合性、Mac/Windows梱包HTMLのSHA-256一致を確認。
- Windows梱包: `package.json`の`ditto`設定を`--norsrc --noextattr --noqtn --noacl`へ変更し、Windows ZIPから不要な`__MACOSX`とAppleDoubleファイルを除外。再作成後のZIPテストはエラー0、`__MACOSX`該当0件。
- 知識: Obsidian「売上PDFレポート」ノートの旧3月集計値と取引変更方向を訂正し、停止条件と回帰基準値を追記。
- DB・設定変更: なし。Instatic TalksX本体、Supabase、Cloud Run、GitHub Pages、OpenAI Sitesは変更していない。
- 未完了事項: 未知のPOS様式自体への絶対保証はできない。現行実装は未知・不一致を推測せず停止する。新しいレジ様式を導入した場合は、その月の日計写真または公式日報と1回照合して解析版を更新する。

### 2026-07-29 - 解凍変換ソフト 2023年8月の旧形式互換を修正

- 依頼: `/Volumes/KIOXIA/202308/` の21 LZHでも解析をテストし、今後同じ形式で誤集計しないようにする。
- 原因1: 8月11日のVOID対象番号を読む前に空白と改行を全削除していたため、`No.0311`と次行の商品コードが連結され、変更前伝票No.0311を除外できなかった。VOID行と直後1行に抽出範囲を限定し、番号末尾の空白または行末を必須にした。
- 原因2: 2023年形式の`計1 現計`は売上額ではなく現金預り額で、`お 釣`が別行にある。支払方法別集計と伝票検算を、現金預りからお釣りを引いた純支払額で行うよう修正。お釣りが現金預り額を超える場合も重大エラーとして停止する。
- 自己検査: VOID番号の次行が商品コードになる記録、現金預り＋お釣り、その他決済＋現金預り＋お釣りを追加。解析版を`2026-07-29-v4`、検算版を`daily-summary-reconcile-v2`へ更新。
- 2023年8月基準値: 317レコード、確定会計79件、79組、182名、21売上日、売上1,890,600円、税171,838円、742点、平均客単価10,388円。支払は現金227,420円、クレジット1,566,340円、その他96,840円。全21日で日計と一致し、重大エラー・警告・文字化け・重複は0件。
- 実画面: 8月11日は変更前No.0311とVOID No.0317を除外して訂正後No.0318を採用し、6件・6組・12名・137,200円で自動検算OK。8月18日は現金預り20,000円・お釣り800円を現金19,200円として扱い、3件・11名・122,300円で自動検算OK。
- 回帰: 2023年8月21ファイル、2024年3月23ファイル、2026年6月21ファイルの計65ファイルを再解析。各月の既知基準値を維持し、全日計照合、商品純額、支払純額、LZH CRCで重大エラー0件。
- 配布物: Dropbox正本HTMLとMacアプリ内HTMLはv4でSHA-256一致。WindowsはDropbox競合コピーが旧実行ファイルを残す事象を検出したため、クリーンビルドフォルダへ置換してZIPを再作成。ZIP内`app.asar`から再抽出したHTMLもMac・正本とSHA-256一致し、競合コピー0件、ZIP約138MB。
- 知識: Obsidian「売上PDFレポート」へ旧形式の原因、停止条件、2023年8月基準値、65ファイル回帰、Windowsクリーン梱包手順を追記。
- DB・設定変更: なし。Instatic TalksX本体、Supabase、Cloud Run、GitHub Pages、OpenAI Sitesは変更していない。

### 2026-07-29 - 解凍変換ソフトにフード・飲料別集計を追加

- 依頼: 日別・月間売上レポートで飲料とフードを分けて集計し、アプリ内保存後も同じ内訳を表示する。
- 分類正本: POS公式の`GP(グループ)[期間]`にある「料理 / ドリンク」を正本とした。POS上の「チャージ料」は料理のため、画面では「フード（チャージ含む）」として扱い、内数も表示する。
- 実装: `parseReceipt()`で13桁商品コードを保持し、NFKC正規化した「コード＋商品名」の明示マスタ39組で分類する。コード範囲や曖昧な商品名キーワードは使わない。商品取消の負数量もカテゴリ別純額へ相殺する。
- フェイルクローズ: 未知の商品コード＋商品名は推測せず未分類エラーにし、`フード＋飲料＝商品純額＝伝票合計`が一致しない場合もPDF作成を中止する。起動時自己検査へフード、飲料、未知商品、負数量、カテゴリ合計を追加。
- UI: 日別・月間にフード売上、飲料売上、点数、比率ドーナツ、カテゴリ別の商品ランキングを追加。月間には日別のフード・飲料・合計表を追加し、既存の件数・組数・客数・売上・税・客単価表は維持した。
- 保存互換: 保存データへ解析版、検算版、分類版、フード・飲料・チャージ合計を記録。版欠落を現行値で補う旧挙動をやめ、旧レポートは一覧に残したまま「旧解析版」と表示し、PDF再保存を無効化する。
- 解析版: `2026-07-29-v5`、検算版`product-group-reconcile-v1`、分類版`pos-food-drink-v1`。
- 回帰結果: 2023年8月はフード974,100円・飲料916,500円・合計1,890,600円、2024年3月はフード990,900円・飲料1,140,000円・合計2,130,900円、2026年6月はフード922,700円・飲料596,600円・合計1,519,300円。計65 LZHで未分類0件、重大エラー0件、カテゴリ合計差額0円。
- POS照合: 2026年6月20日・24日・26日時点のPOS公式GP累計とフード・飲料の金額と点数がすべて一致。6月30日単日はフード52,100円・飲料41,500円・合計93,600円。
- 実画面: 6月30日のLZHで日別・月間を開き、各KPI、グラフ、商品別内訳を確認。日別レポートをアプリ内保存し、「保存済みレポート」から開き直して同じ内訳が保持されることを確認。
- 配布物: Dropbox正本HTMLとmacOSアプリを更新し、Windows版はクリーン一時出力から正式distへ置換してZIPを再作成。Mac署名、Windows ZIP、競合コピー0件、正本・Mac同梱・Windows `app.asar`同梱HTMLのSHA-256一致を確認。
- 知識: Obsidian「売上PDFレポート」へ分類根拠、3か月の基準値、停止条件、保存互換、配布検証を追記。
- DB・設定変更: なし。Instatic TalksX本体、Supabase、Cloud Run、GitHub Pages、OpenAI Sitesは変更していない。
- 継続運用: 新商品は明示マスタへ追加するまでレポートを停止する。新しい月またはPOS様式を初めて扱う際は、公式GPまたは日報と1回照合してから分類版を更新する。

### 2026-07-29 - 解凍変換ソフトにランチ・ディナー別分析を追加

- 依頼: 会計時刻が16:00未満の伝票をランチ、16:00以降をディナーとして分け、売上・組数・客数・客単価・フード・飲料を日別／月間レポートへ掲載する。
- 客数の根拠: ランチ／ディナー客数は日計客数を按分せず、各確定レシートの`控え番号`直後8行以内にある単独の`N名`を使用する。候補が0件または複数件なら停止し、ファイルごとにレシート客数合計と日計客数を照合する。
- 時刻の根拠: 伝票番号・営業日・会計時刻は先頭ヘッダー1行だけからNFKC正規化後に抽出する。本文中の別時刻を拾わず、ヘッダー欠落・時刻不正はPDF作成を停止する。自己検査で15:59をランチ、16:00をディナーとして固定した。
- UI: 日別／月間に両区分の売上、組数、客数、平均客単価、フード、飲料、飲料比率を追加。月間には日別のランチ／ディナー売上・客数・客単価表と、区分別のフード／飲料グラフ・商品ランキングを追加。該当会計0件の客単価は`—`とする。
- 取消対応: 商品取消の負数量・負金額は会計伝票の時間帯で符号付き相殺する。一方のカテゴリ純額が負になる場合は誤った比率円グラフを描かず、符号付き金額表示へ切り替える。
- フェイルクローズ: `ランチ＋ディナー`の会計数・客数・売上が全体値と一致しない場合、会計時刻またはレシート客数が一意でない場合、レシート客数合計と日計客数が一致しない場合はレポートを作成しない。
- 解析版: `2026-07-29-v6`、検算版`meal-period-reconcile-v1`、分類版`pos-food-drink-v1`、会計区分版`lunch-before-1600-v1`。保存データへ会計区分版、両区分の売上・客数を記録し、旧保存レポートは残したままPDF再保存を無効化する。
- 回帰結果: 2023年8月はランチ0件、ディナー79件・182名・1,890,600円・客単価10,388円。2024年3月はランチ0件、ディナー71件・161名・2,130,900円・客単価13,235円。2026年6月はランチ9件・12名・40,900円・客単価3,408円（フード27,900円・飲料13,000円）、ディナー54件・125名・1,478,400円・客単価11,827円（フード894,800円・飲料583,600円）。
- 検証: 3か月・65 LZH・確定会計213件で、客数候補は全伝票1件、日計客数との不一致0件、重大エラー0件、独立集計との差額0円。2026年6月の全21ファイルを実画面で読み込み、月間・日別・伝票バッジ、アプリ内保存後の再表示、ファイル削除を確認した。
- 配布物: Dropbox正本HTML、macOSアプリ、Windows x64版ZIPを更新。Mac署名、Windows ZIP整合性、競合コピー0件を確認し、正本・Mac同梱・Windows `app.asar`同梱HTMLのSHA-256 `b9b7bb85d798bc28e4bae52d500d8530efea4d80a49cb746bff51ea03c99ea05`が一致した。
- 知識: Obsidian「売上PDFレポート」へ会計時間帯の定義、客数根拠、3か月基準値、停止条件、保存互換、配布検証を追記。
- DB・設定変更: なし。Instatic TalksX本体、Supabase、Cloud Run、GitHub Pages、OpenAI Sitesは変更していない。

### 2026-08-14 22:10 JST - 認証と予約まわりのバグ修正

- 依頼: 洗い出したバグを優先度順に直す。
- 実施内容:
  - Googleログイン後の`error` / `error_description`をログイン画面へ表示。
  - 通常画面の初期`authLoading`を管理者画面と同様にtrueへ変更。
  - 所属店舗の一時保存を新規登録15分以内だけ適用し、既存利用者へ別アカウントの店舗が付かないようにした。
  - 予約保存が途中失敗したとき、Storageオブジェクトと投稿行を巻き戻す。
  - 下書き・失敗投稿の再予約と削除を履歴詳細へ追加。
  - 公開予定は現在より後の日時だけ受け付ける。
  - SNS連携で秘密情報の保存に失敗したらメタデータを`incomplete`へ戻す。
  - 管理者のステータス変更で、予約済みには予定日時必須、下書き／失敗では予定日時を消す。
  - 管理一覧が1000件上限に達したら警告する。
  - ファイル取得をポップアップではなくBlobダウンロードへ変更。
- 変更ファイル: `app/social-console.tsx`、`app/admin/admin-console.tsx`、`app/globals.css`、`supabase/migrations/20260814133000_allow_post_delete_with_media_jobs.sql`、`tests/rendered-html.test.mjs`、`AI_HANDOFF.md`、`PROJECT_PROGRESS.md`。
- DB・設定変更: migration `20260814133000_allow_post_delete_with_media_jobs.sql` を本番へ適用済み。`social_media_jobs.source_file_id` は `ON DELETE CASCADE`。Redirect URLsの分離はSupabase Dashboardの手動設定が必要。
- 検証: ESLintの変更ファイルはerror 0。`node --test` 16件成功。`npm run knowledge:update` と `knowledge:check` 成功。Graphify 374ノード / 406関係 / 37コミュニティ。
- 未完了事項: Redirect URLsを4行に分けて保存する作業はダッシュボード側。保存後にローカルでGoogleログインを再確認する。
- 次の作業: Redirect URLs保存後、`http://localhost:3000/` でGoogleログインを確認する。

### 2026-08-14 22:25 JST - ローカルGoogleログインを確認

- 依頼: Redirect URLs修正後のログイン確認。
- 実施内容: 利用者がSupabaseのRedirect URLsを4行に分けて保存し、`http://localhost:3000/` からGoogleログインできることを確認した。
- 変更ファイル: なし。
- DB・設定変更: Auth URL ConfigurationのRedirect URLsを別行へ分離（手動）。
- 未完了事項: なし。
- 次の作業: 利用者が指定する次の編集。

### 2026-08-16 - 管理者画面にページ送りを追加

- 依頼: 1000件上限の警告だけでなく、一覧のページ送りまで実装する。
- 実施内容: 管理者の投稿・予約予定・ファイル・操作履歴・利用者を、Supabaseから1000件ずつ最後まで取得し、画面は50件ずつ「前へ／次へ」で送れるようにした。店舗・検索・ステータス変更で1ページ目に戻る。
- 変更ファイル: `app/admin/admin-console.tsx`、`app/globals.css`、`tests/rendered-html.test.mjs`、`PROJECT_PROGRESS.md`。
- DB・設定変更: なし。
- 検証: ESLint error 0、`node --test tests/rendered-html.test.mjs tests/knowledge-system.test.mjs` 7件成功。
- 未完了事項: なし。
- 次の作業: 利用者が指定する次の編集。

### 2026-08-29 - ログイン画面のパスワード再設定注釈

- 依頼: セキュリティ保護のためパスワードをクリアした旨と、再設定を促す注釈をトップのログイン画面へ表示する。
- 実施内容: ログインモード時のみ、パスワード再設定リンクの利用を促す注釈を追加。登録画面には表示しない。
- 変更ファイル: `app/social-console.tsx`、`app/globals.css`。
- DB・設定変更: なし。
- 検証: `npm test` 16件成功、`npm run build:github-pages` 成功、`git diff --check` 成功。
- デプロイ: `main`へpushしてGitHub ActionsによるGitHub Pages公開を開始する。
- 未完了事項: 公開URLでのブラウザ表示確認。
- 次の作業: GitHub Actions完了後にログイン画面を再読み込みして注釈を確認する。
