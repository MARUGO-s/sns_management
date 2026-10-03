# Instatic TalksX

Instagram、TikTok、X、Threadsの投稿予約、履歴、添付ファイル、API設定を一括管理する業務用コンソールです。

## Current capabilities

- Supabase Authによるメールアドレス・パスワード認証
- 公式22店舗とBLU NEROを合わせた23店舗の所属マスター
- 新規登録時の所属店舗選択と、既存利用者向けの初回所属設定
- 店舗・ワークスペース単位の投稿予約と履歴保存
- 非公開Supabase Storageへのファイル保存と期限付きダウンロード
- 履歴の動画をダウンロードせずアプリ内プレーヤーで再生
- 1:1、4:5、9:16、16:9のクロップ、開始・終了調整、複数の途中カット
- 元動画を保持したままCloud Run Jobsで編集済みMP4を生成する非同期処理（移植先へのCloud Run再接続待ち）
- SNS APIの公開設定と秘密情報の分離保存
- RLSによる利用者・ワークスペース単位のアクセス制御
- 通常の運用画面で現在の所属店舗を常時表示
- 管理者専用ページ `/admin` での全利用者・投稿・予約予定・ファイル・操作履歴の一元確認
- 管理者画面での全店舗一覧と店舗別の絞り込み・運用状況確認
- 管理者による投稿ステータス更新と期限付きファイル取得
- 利用者一覧からの管理者権限付与・解除（最後の管理者は解除不可）
- 管理者専用のGraphifyシステムマップによるコード構成の確認
- 投稿本文やAPIシークレットを複製しない監査ログ
- SupabaseからDropboxへの管理者向けバックアップ

SNSへの実際の公開、コメント、DM、外部分析値の取得には、各SNSの開発者アプリ審査とOAuth・Webhook実装が別途必要です。画面では未取得データを実データ風に表示しません。

## Local development

Node.js 22以降を使用します。

```bash
npm install
npm run dev
npm test
```

ローカル環境変数は `.env.local` に置きます。

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_your_key
```

秘密キー、service role key、SNSトークンをGitへ保存しないでください。

## GitHub Pages deployment

本番URLは [https://marugo-s.github.io/sns_management/](https://marugo-s.github.io/sns_management/) です。`main`へpushするとGitHub Actionsが静的アプリをビルドしてGitHub Pagesへ公開します。Actionsには`NEXT_PUBLIC_SUPABASE_URL`と`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`をRepository Secretとして登録します。これらはブラウザ向けの公開キーであり、秘密キー・service role key・SNSトークンを登録してはいけません。

Supabase DashboardのAuthentication > URL Configurationでは、Redirect URLsに次を登録します。

```text
https://marugo-s.github.io/sns_management/
```

2026-10-04にこのURLだけ追加済みです。既存グルメのSite URL・許可URLは維持しています。
メール確認とパスワード再設定の完了後にGitHub Pagesのアプリへ戻ります。
現在のgourmetではGoogle OAuthが無効なので、メール・パスワード認証を利用します。
Googleを別途設定した場合だけ `NEXT_PUBLIC_SUPABASE_GOOGLE_ENABLED=true` をビルドに指定してください。

## System map

`/admin` の「システムマップ」は2つの表示を切り替えられます。

- **コード構成**: Graphifyがコードから生成した関数・ファイル・依存関係のグラフ。
- **実行環境・AI知識循環**: ブラウザ、Supabase、Cloud Run、GitHub Pagesに加え、AI・Graphify・Obsidianの探索／実装／知識保存フロー。

利用者の投稿本文、添付ファイル、Supabase本番データ、環境変数、SNS連携シークレットは解析・表示しません。

コード構成だけを更新する場合:

```bash
npm run graphify:system-map
```

Graphify・環境図・Obsidian・AIコンテキストをまとめて更新する場合:

```bash
npm run knowledge:update
```

`graphify-out/`はローカルの作業用出力で、Git・Dropboxソースミラーに保存しません。

## Obsidian knowledge vault

プロジェクト知識は、Dropbox上のObsidian Vault「アプリ知識」にアプリごとに分けて保存します。

```text
アプリ知識/
├── 00_総合/
├── 10_アプリ別/
│   └── Instatic TalksX/
│       ├── 00_HOME.md
│       ├── 10_プロジェクト概要/
│       ├── 20_設計/
│       ├── 30_運用手順/
│       ├── 40_意思決定/
│       ├── 50_障害と対応/
│       ├── 60_機能別知識/
│       ├── 70_AI作業環境/
│       └── 90_Graphify/
└── 90_共通知識/
```

AIと開発者は、まず手書きObsidian知識を検索し、次にGraphifyでコード構造を絞ります。

```bash
npm run knowledge:search -- "<依頼・症状・機能名>"
graphify query "<コード上で知りたいこと>"
```

コード構成を変更した後は、次の1コマンドで管理画面マップ、環境図、Graphifyノート、AI開始文書を更新します。

```bash
npm run knowledge:update
npm run knowledge:check
```

別PCでVaultの場所が異なる場合は、`KNOWLEDGE_VAULT_APP_DIR`にアプリフォルダ、または`KNOWLEDGE_VAULT_GRAPHIFY_DIR`に`90_Graphify`を指定します。`70_AI作業環境/`にはAIの入口・環境図・チェックリスト、`90_Graphify/`には自動生成のコードノートがあります。Vaultへ`.env`、秘密鍵、service role key、SNSトークン、本番個人データ、投稿本文、添付ファイルを保存しないでください。

Cloud Run向けメディアワーカーはDocker Desktopでローカル検証できます。

```bash
npm run worker:docker:check
```

このコマンドは`linux/amd64`イメージbuild、Node・FFmpeg・libx264・非root実行、crop・encoding・timeline planテストに加え、実MP4のクロップ、前後トリム、途中カットを音声あり／なしの両方で`ffprobe`検証します。プラットフォームを変える場合は`MEDIA_WORKER_DOCKER_PLATFORM`を指定します。Docker Desktopで他アプリのSupabaseコンテナが動作している場合、それらを停止・再作成せず、Instatic TalksXのワーカーイメージだけを独立して検証します。

Cloud Run workerは動画時間から出力ビットレートを計算し、処理済みMP4をSupabase Freeの50MB上限内へ収めます。短い動画は通常解像度を維持し、長尺動画は必要な場合だけ720ベースへ縮小します。Cloud Runへの依頼受付後は`dispatching`、worker開始後は`processing`となり、20分以上更新されない処理は履歴から安全に再実行できます。

## Supabase

接続先は既存の `gourmet` (`ycsqfajidusuibqljjwr`) です。SNS用の12テーブルは
`social_`、内部関数は `social_private`、非公開ファイルは `social-post-files` に分離します。
グルメの既存テーブル・RLS・関数は変更しません。SNSを開いた利用者だけをSNS利用者一覧へ登録し、
ログイン保存領域とログアウト対象もアプリ単位に分けます。
ただし同じプロジェクトなので、Authユーザー、パスワード、APIキー、容量は共有です。

```bash
npm run test:db
supabase functions deploy social-integration-secrets --project-ref ycsqfajidusuibqljjwr --use-api
supabase functions deploy social-media-jobs --project-ref ycsqfajidusuibqljjwr --use-api
```

共有DBへ `supabase db push` / `db reset` を実行しないでください。
追加SQLは `supabase migration new <name>` で作成し、SNSだけを対象にレビューして単一migrationを適用します。
`test:db` は独立した一時Postgresコンテナで、グルメデータ保持とRLS・秘密情報保護を確認します。
本番へテストfixtureを適用してはいけません。

旧リポジトリ内容は `backup/pre-instatic-2026-10-04` ブランチに保存されています。
GitHub Pagesの公開は作業ブランチのPR → 検証 → mainへmerge → Actionsで行います。
初期のSNS管理者は自動付与しません。SNSログイン後、所有者が指定したAuthユーザーにだけ別途付与します。

動画変換のCloud Runは、この移植先では未接続です。Google Cloudの再認証後にSNS専用jobを構成し、
`SOCIAL_GOOGLE_*` の設定を追加してください。旧SNSのCloud Run JobやグルメのSecretsは上書きしません。

動画編集画面では、動画を添付して「動画編集」を押すと、縦横比・位置・拡大に加え、開始・終了、複数の途中カットを0.1秒単位で指定できます。実際のFFmpeg処理にはCloud Run Jobを使用します。接続前の処理は`queued`として残り、履歴から再実行できます。Cloud Runの設定手順は`workers/media-processor/README.md`にあります。

## Backup

`npm run backup:dropbox` は、管理者用のserver-only keyを使ってSupabaseのテーブル、SNS連携シークレット、ファイルをDropboxへバックアップします。Supabaseが本番データの正本で、Dropboxは所有者専用のバックアップとAI引き継ぎ用です。秘密情報はGitのソースフォルダと分離してください。
