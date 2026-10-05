# Instatic TalksX 進行記録

## 現在状態: X予約自動公開のローカル実装（未公開・実行停止）

- 依頼: 利用者がX手動投稿に加えて予定投稿も希望し、継続を承認。対象は明示確認付きのXのみ。既存の手動投稿処理を再利用し、他SNSへは送らない。
- 実装: `feat/x-scheduled-publishing`（開始時点のmain `eb50a8b`）にX専用キューmigration、private payloadとworkspace RLS、内容・添付・X接続世代の固定、enqueue/cancel/claim/finish RPC、秘密値で保護するWorker、UI表示・明示確認・キャンセル、競合テストとCI検査を追加。詳細は`docs/X_SCHEDULING.md`。
- 安全停止: migrationのruntime markerは`enabled=false`、定期起動設定なし。Worker secretも未設定で、本番DB／Function／Cron／Pagesには何も反映していない。よって予約の自動公開は現時点で使えず、UIの自動公開準備状態も有効にならない。ローカル実装だけで公開済みとは扱わない。
- 重複防止: 送信開始より前と証明できる一部失敗だけ同じrequest IDで再試行可能。X応答が不明、送信中lease期限切れ、永続receiptの不一致は`unknown`で停止し、自動再送しない。確実に未送信の予約だけキャンセル可能。
- 検証: Deno導入後に`npm test` 53/53、予約Worker Denoテスト13/13と型検査、既存X publisher Denoテスト31/31と型検査、隔離PostgreSQLの権限・状態・独立接続競合（claim/cancel/enqueueおよびdispatch/stale-sweep NOWAIT競合）、`npx tsc --noEmit`、GitHub Pages buildが成功。Lintエラー0、既存React Hook警告1件。Graphifyは709 nodes / 999 edges / 59 communitiesで以前更新し、その時点の`knowledge:check`は成功したが、後続差分で生成物が古くなっており、最終確認には再生成・再検査が必要。手書きVaultノートは未変更。
- レビュー・外部通信: 独立read-only再レビューで予約状態の読み取り失敗時に自動公開を止めるガード修正を確認し、新たなリリース阻害なし。これは本番実行・X受理の検証ではない。実X/API・Provider呼び出し、投稿、upload、token refresh、OAuth、課金変更、production DB/Functions/Auth/Cloud Run操作なし。差分は未commit／未pushで、PR・main merge・本番反映も行っていない。
- 未決: 実行頻度と運用費用に関わるため、周期起動方式を確定していない。推奨はSupabase Cron、代替はGitHub Actions。利用者の「続けて」はローカル作業の承認として扱い、方式の明示選択・本番有効化の承認とは扱わない。公式資料: [Supabase scheduled Edge Functions](<https://supabase.com/docs/guides/functions/schedule-functions>)、[GitHub Actions workflow schedule](<https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax>)、[GitHub schedule delays](<https://docs.github.com/en/actions/how-tos/troubleshoot-workflows>)。
- Git: 差分は未commit／未push、PR・CI・main mergeなし。通常のPR経路でCIを通す前にDeno結果を確認し、実行方式と有効化条件を別途決める。本番有効化前に、その時点で投稿対象となり得る予約を利用者へ明示する。

## 2026-10-04 20:44 JST メディア用権限設定保存済み・未接続（現在の接続状態）

- 利用者の20:37:55 JSTの別承認後、専任ブラウザ担当が20:43:03 JSTに`tweet.read tweet.write users.read offline.access media.write`を保存し、「保存しました」を確認。固定Callbackと認証情報は維持、秘密情報欄は空。設定変更は旧接続を無効化するため、20:37 JSTに確認した4スコープ接続を現在も接続済みと扱わない。
- 認可画面で対象と権限を確認し、認可ボタンを1回だけ操作したが、X画面が操作不可のままでアプリ復帰・Callback・新トークン保存は未確認。20:44:36 JSTの新しいアプリタブはXの「API設定 要確認」を表示し、5スコープ保存・秘密情報欄は空だが接続成功表示なし。現在は「メディア用設定保存済み・未接続」。文章・画像・動画とも再接続完了までは利用準備完了と扱わない。認可画面の再クリック・reload・追加通信は行わず、利用者へ障害と再試行判断を報告する。
- 実投稿・実アップロード・追加Providerテスト・支払い設定変更・DB／Functions変更はなし。実投稿は別操作。以下の20:37 JSTは公開画面と当時の4スコープ記録の根拠で、現在接続状態は本節を優先する。

## 2026-10-04 20:37 JST X手動投稿の公開・読み取り専用画面確認完了（現在状態）

- PR #12 https://github.com/MARUGO-s/sns_management/pull/12 は、最終head `dda2c8a4e2f4c7aad364d6a96b8d4ce1734c0e96`のCI run https://github.com/MARUGO-s/sns_management/actions/runs/37198676592 成功後、20:29 JSTに通常のsquashでマージ。mainは`225c73282ebaeaec618aa5580b2c384462515522`。同じSHAのPages run https://github.com/MARUGO-s/sns_management/actions/runs/37198925360 成功を20:32 JSTに確認。
- 20:37 JSTの読み取り専用確認で、公開アプリ https://marugo-s.github.io/sns_management/ に「Xへ今すぐ投稿」、X加重文字数0/280、元JPEG／PNG各5MiB・4枚または元MP4 20MiB・1本、APIクレジット消費の注意を確認。空の作成欄では「Xへの投稿内容を確認」が無効。新しい認証済みタブを使い、元の作成欄・未保存入力は保持。
- X設定の「登録済み」「Xに再連携」「連携を削除」、保存済み4スコープ、固定Callback、秘密情報欄が空であることを確認。保存された接続記録が残っている確認であり、X側の本人・トークン有効性を新しく照会した確認ではない。本人認可の根拠は19:01 JSTの記録。
- 文章・画像・動画の手動投稿コードと画面は公開済み。ただし現在は`media.write`がなく、画像・動画には利用者の別承認による権限設定保存と再認可が必要。権限不足の警告を本番で確認し、添付後の確認無効化は合成画面だけで検証。保存・再連携・添付・preview・投稿・トークン更新・Provider通信は実行していない。
- 限定バックエンドは20:14 JST記録のとおり反映済み。加算migration `20261004110000_social_x_publications.sql`、`social-x-publish` v1/JWT必須、`social-x-oauth` v2/JWT必須、`social-x-oauth-callback` v2/JWT不要を再適用しない。非SNSの6構造fingerprint、既存Storage trigger2件、無関係Functions6件は不変、権限確認8件と未認証401を検証済み。
- 統合後の検証はNode47件、投稿Denoモック31件、OAuth Deno17件、UI組合せ24件、型検査、隔離DB／競合、Google公開フラグ付きPagesビルド、知識検査が成功。独立安全性・不具合再レビューに阻害なし。既存Lint警告1件・依存audit28件は残り、新しい脆弱性の増加や無関係の依存更新なし。
- 並行のGoogleログインPR #11を保持。認証済み画面ではGoogleログインボタンを安全に確認できず、ログアウト・新規認証は行わないため本番ボタン確認は未実施。所有者のGoogle認証完了・既存UID等の維持についても既存の未検証事項を残す。
- コード限定の知識再生成は統合ソースで完了済み。ソースミラーのGit管理118ファイルは20:33 JSTにmainと完全一致、競合0・削除0を確認。今回の更新は文書のみで索引再生成なし。実画面証跡は作業場所の`../reports/qa/x-manual-publication/live-published.txt`。
- 未完了: 実X投稿・実アップロード・実Provider受理・本番更新の成功は未検証。予約自動公開、他SNSの公開、DM・コメント・分析は追加しない。20:37:55 JSTに利用者がメディア権限追加・再認可を別途承認し、専任担当が実施中。完了までは権限付与済みと扱わない。実投稿や課金設定変更を自動実行しない。以下の公開待ち／未実装記録は当時の履歴で、本節を優先。

## 2026-10-04 Googleログイン公開設定（現在状態）

- 所有者がgourmet共有AuthのGoogle設定を手動保存。公開Auth設定APIでGoogle有効・メール有効を確認。
- Pagesビルドに公開UIフラグを追加し、既存Googleログインボタンを有効化。秘密鍵はSupabaseだけに保存し、コードには追加しない。
- 既存メール認証・所属店舗・UIDベースの管理者判定・RLS・X接続は変更しない。共有DBのmigrationやFunctions再配備も行わない。
- 設定有効と本人ログイン成功は区別する。所有者によるGoogle認証完了と既存UID・店舗・データの維持は未検証。詳細は `docs/GOOGLE_AUTH.md`。
- 認証開始エンドポイントは302でGoogleへ転送し、対象クライアント・gourmetのCallbackと一致、要求scopeはemail/profileと確認。秘密値・stateは記録しない。32 Node回帰テスト・型検査・Lint・知識整合検査が成功。
- 以下のGoogle無効という記録は移植時の履歴であり、現在状態は本節を優先する。

## 2026-10-04 20:10 JST X手動投稿のローカル検証完了（当時は本番反映未確認、履歴）

- 依頼: Xへの投稿機能を進め、文章・画像・動画を対象にする。ブランチは`feat/x-manual-publishing`、開始HEADは`640b09688068c833baca56dc620b51e03785be2a`。commit・PR・投稿機能の本番反映はこの記録時点で未実施。
- ローカル実装: 確認画面付き手動投稿、JWT必須`social-x-publish`、SNS専用加算migration、公開履歴、動画処理待ちの明示的続行。予約保存は維持し、予約の自動公開は実装しない。他SNSの公開成功を記録しない。
- 確認固定: 生本文、順序付き元ファイルID・パス・MIME・サイズ・SHA-256、DBのみから取得する対象接続fingerprintを準備時に比較。初回アップロード前は全元ファイルを検証し終えるまで更新・アップロードを呼ばない。初回prepareの既知ロールバックだけを未開始の証明とし、通信失敗・後の履歴不在を根拠に別requestIdで再送しない。
- 上限: 必須本文はX加重280文字、JPEG／PNG各5MiB・4枚まで、MP4 20MiB・1本、画像動画混在不可。元ファイルのみ。X側の全プラン上限・エンコード受理を保証しない。
- 権限: 既存4スコープ接続は維持。メディア用`media.write`は利用者の別判断による設定保存と再認可が必要で、自動変更しない。実投稿・実アップロード・再認可・支払い設定変更は行わない。
- 検証済み: Node初回全42件、OAuth Deno17件、独立DBの共有境界・投稿・OAuth・複数接続競合、Pages静的ビルド。投稿Denoモック最終31件（Provider16・制御15）、UI組合せ24件が成功。独立安全性の最終重点レビューは阻害指摘なし。
- 画面: 正確な1440×1000／390×844で横はみ出しなし、確認ダイアログ中央配置・架空接続名・メディア権限不足の確認無効化を確認。実コンポーネントのhydrationとpreview-onlyモックで、preview中の編集無効化、取消し→編集→再確認、ローカルfile digest／freeze経路を確認。最終投稿・Storage保存／アップロード・OAuthは実行しない。実Provider・本番永続化は未検証。証跡は作業場所の`../reports/qa/x-manual-publication/follow-up.txt`。
- 次: 手書き知識と索引更新、通常PR・CI、正確なheadのsquash、限定バックエンド・Pages反映、許可済みソースミラー同期。限定migration適用は結果待ちで完了を主張しない。新migrationは`20261004110000_social_x_publications.sql`、Functionsは`social-x-publish`と追加スコープ対応の2 OAuth Functionsのみ。共有DBの`db push/reset`・共通Auth・他アプリ・Cloud Runは変更しない。契約・一次資料: `docs/X_PUBLISHING.md`。
- 本節はローカル実装の到達点。以下の19:01 JST記録は本番の既存接続状態であり、接続済みを投稿機能の公開済み・実通信検証済みとは扱わない。

## 2026-10-04 19:01 JST X OAuth本人認可・接続確認完了（接続の根拠、投稿未実装は当時の履歴）

- 利用者が18:59 JSTに無料APIクレジットを使うX接続を承認し、19:01 JSTに1回のOAuth認可を完了。認可画面で利用者所有のXアカウントと読み書き・継続更新の権限を確認し、DM・メールは要求しない。
- 本番アプリの成功通知は「Xの連携許可が完了しました。投稿・自動公開機能はまだ有効になりません。」。再読込後もXの「登録済み」「Xに再連携」とトークン保存済み・サーバー管理・値非表示の表示が継続し、設定保存だけではなく認可後の接続保存を確認。
- 現在のアプリUIには接続アカウント名の表示がない。本人の一致は認可画面で確認した。Callbackに必要な本人識別API以外の追加API・手動API・トークン更新は実行しない。
- 接続後も自動チャージOFFと有限の利用上限が保存されていることを確認。クレジット購入、投稿、予約の自動公開は実施しない。使用額表示には遅延や丸めがあるため、API費用ゼロや課金完全防止を保証しない。
- 投稿公開・予約の自動実行・DM・コメント・分析・Webhookは未実装。接続済みを投稿機能完成と扱わない。期限切れ・再認可・更新の本番動作は未検証で、不要な接続検証を繰り返さない。
- 今回は運用文書だけを更新。既に公開済みのmigration・3 Functionsを再適用せず、共有DB・Auth・Cloud Run・他アプリ秘密情報を変更しない。構造変更がないためGraphify再生成は不要。
- 以下の16:05 JSTの保留記録は当時の履歴。本節が現在の接続状態と許可範囲に優先する。次の実投稿や追加API操作には別の利用者指示が必要。

## 2026-10-04 16:05 JST X OAuth接続機能（公開・設定保存済み、当時は本人認可保留）

- ブランチ: `feat/x-oauth-pkce`。開始HEAD: `02117d430a168eb7ab2546e9dcb8af1c22d2ff71`。
- Xの投稿権限を含むOAuth 2.0 S256 PKCE、サーバー側のstate管理とトークン更新を実装。
- API設定だけで接続完了と表示しない。本人の認可後に状態を確認する。
- 既存のSNS設定変更は実際の所有者・所属を要求し、管理者の閲覧権限と分離する。
- 最終検証: build、30 Node回帰テスト、16 Denoテスト、3 Edge Functionの型検査、TypeScript、Lint、独立DBの共有境界・OAuth・複数接続競合テストが成功。Pages静的ビルドと1440px／390pxの合成画面確認も成功。
- 設計・本番適用前提: `docs/X_OAUTH.md`。
- 共有Supabase `ycsqfajidusuibqljjwr`へ加算migration `20261004070000_social_x_oauth.sql`だけを適用し、`social-x-oauth`、`social-x-oauth-callback`、更新された`social-integration-secrets`を公開済み。PR #8を通常のsquashマージで反映し、GitHub Pagesの公開も成功。X側は読み書き（DM・メールなし）、機密Webクライアント、固定Callback・Websiteを保存し再表示確認済み。
- 2026-10-04 16:05 JSTに本番アプリのX設定へClient IDと秘密情報をVaultから保護された入力で保存。再読込後は秘密情報欄が空で「保存済み（変更時のみ入力）」、状態は「設定保存済み・未接続（要確認）」。固定Callbackと`tweet.read tweet.write users.read offline.access`を確認。X用のトークン手入力欄は表示しない。秘密値は平文表示・出力・撮影・ファイル保存しない。
- 非SNSの`public`／`auth`について、列・制約・ポリシー・grants・関数・RLSの6種の構造fingerprintが適用前後で一致。既存グルメ・共通Authの構造を変更していない。
- 無関係のFunctionsは変更していない。秘密情報のRLS・テーブルアクセス・関数実行権限は`anon`／`authenticated`に対して拒否、JWT必須Functionsの未認証要求は401を確認済み。
- 投稿処理は未実装で、テスト投稿もしない。本人のOAuth認可とアプリへのトークン保存は未実施。
- 共有DBの`db push/reset`、共通Auth変更、既存グルメやCloud Runへの変更は禁止。
- 利用者は課金なしのX開発者登録を承認。送信担当が承認済み登録の完了を確認した。登録後に既定のアプリを表示し、アプリの新規作成・支払い・クレジット購入・自動チャージ設定は行っていない。
- XプロジェクトはPay Per Use。残高・無料クレジット・今回の使用額はいずれも$0、カード未登録。コンソールの$20無料クレジット案内は最初のカード登録を条件としている。本人識別APIの最終費用・利用条件は未確定。課金しない指定に従い、OAuth開始・本人認可・Callback・トークン交換・X API呼び出しは保留し、カード登録・購入・自動チャージ・投稿も行っていない。
- GitHubはMARUGO-sの管理権限とCLI認証を確認済み。SupabaseのhCaptchaは解決し、共有gourmetプロジェクトの所有者アクセス・CLI認証・対象プロジェクトへのlinkを確認済み。
- 実装commit: `4fb332d50391863bcc217069ac2fb0a1d8eb6e1f`。PR #8 https://github.com/MARUGO-s/sns_management/pull/8 の最終head `0cdefc22af5b46073d67a4d136b756cd37921c38`はCI成功、2026-10-04 16:02 JSTにマージ。mainは`6f07ef8dc14703557285b9380fc924d16c6197fc`。Pages run https://github.com/MARUGO-s/sns_management/actions/runs/37184605009 は同じSHAで成功。
- 2026-10-04 15:47 JSTに知識更新を完了し、494ノード・638関係・46コミュニティ。今回の公開結果更新は文書のみで構造再生成は不要。終了記録は`docs/x-oauth-rollout-complete`から通常のPRへ提出し、許可済みソースミラーをGit管理ツリーだけで同期する。
- 現在の優先事項: 利用者が「設定済みで接続保留」か「無料クレジット条件の確認」を選択するまで、課金に関わる操作と本番認可を進めない。設定保存済みは接続済みでも投稿機能完成でもない。以下の旧運用・優先順位・未実装一覧より本節のX到達点を優先する。

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
- CIの新規Postgres初期化では一時ソケットサーバーの停止と競合したため、TCPで最終サーバーの起動を確認してからSQL検証するよう修正。
- 2026-10-04 接続アカウント欄の「API設定」表示位置を統一するため、ロゴ横の名前・補足テキスト領域を左揃えにした。CSSのみの変更。DB・認証・SNSロゴ画像は変更しない。
- 2026-10-04 通常運用画面とログイン画面を白・淡い紫を基調にリデザイン。投稿先→本文・添付→日時の3段階、端末内プレビュー、状態別履歴フィルター、日時順の予約、件数カードからの移動、スマホの開閉メニューを実装。詳細は `docs/SOCIAL_UI.md`。
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

2026-10-04 20:37 JSTにX手動投稿の限定バックエンド・Pages公開と読み取り専用画面確認を完了。
20:43 JSTに別承認のメディア用5スコープ設定を保存し、旧接続は無効化。20:44:36 JSTに未接続を確認。文章・メディアとも再接続が必要で、実投稿は別操作。
詳細と未検証事項は文書先頭および`docs/X_PUBLISHING.md`を優先する。

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
- 確認画面付きのX手動投稿（文章・元画像・元動画のコード公開、メディア権限は別承認待ち、実通信未検証）
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

2026-10-04 15:47 JSTの知識環境生成結果は494ノード、638関係、46コミュニティ。ObsidianのInstatic TalksX配下はMarkdown合計559件で、`90_Graphify/`はGraphify生成ノート540件 + 運用説明`_README.md` 1件 + `graph.canvas` + 生成manifestで構成される。`70_AI作業環境/`はAI入口・環境図・Canvas・チェックリスト・Graphify/Obsidianブリッジを含む8ファイル。

X手動公開のコードは公開済みだが実Provider通信は未検証で、画像・動画には別承認の`media.write`設定・再認可が必要。X以外の公開、予約自動公開、コメント・DM同期、Webhook受信、各SNSの分析値取得は未実装。X以外は開発者アプリ審査、OAuth認可、公開API実装が別途必要。動画クロップの画面、キュー、Edge Function、FFmpegワーカーは実装済みで、Cloud Run実行環境も構築済み。2026-07-28に処理中固定の障害は対応済み。2026-08-14にGoogle OAuthの戻り先誤設定、予約保存の巻き戻し、下書き再予約・削除、所属店舗の取り違え、管理者ステータス不整合を修正した。

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

2026-10-04: 接続アカウント一覧ではSNS名と「API設定」を左揃えにし、補足ラベルの開始位置を統一。

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

### X手動投稿の未完了事項

- モック・独立再レビュー・合成画面・知識索引・PR／CI・限定バックエンドとPages公開・本番読み取り専用画面確認は完了。実Provider受理は未検証。
- 画像・動画には`media.write`の追加再認可が必要。現在の4スコープ接続を自動変更しない。
- Providerテストはモックのみ。実投稿・実アップロード・本番更新の成功を確認済みとはしない。API費用ゼロは保証しない。
- 本番では空の確認ボタン無効とメディア警告を別々に確認。添付後の無効化・最終送信は実操作しない。認証済み画面でGoogleボタンは確認できず、サインアウトしてまで調べない。

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

- X以外のSNSのOAuth認可開始・Callback処理（Xは2026-10-04に実装・本番認可確認済み）
- X以外のSNSのAccess Token更新（Xの更新実装は検証済み、本番更新は未検証）
- X手動投稿の実Provider検証・メディア追加再認可（コードと画面は本番公開済み）。X以外の実際の投稿公開
- 各SNS APIへの処理済み動画アップロード
- X以外の公開結果取得とX側への自動照合（X手動投稿は保存済みDB状態だけを表示）
- 公開要求の自動再送（Xは重複防止のため結果不明で停止、動画処理待ちだけ明示的続行）
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

2026-10-04 20:37 JST時点の優先事項は、公開済みX手動投稿の文書引き継ぎを通常PRで確定し、
未完了のX再認可について利用者が再試行等の次の操作を判断すること。
実投稿・追加API・課金設定変更は自動実行しない。
以下の旧Cloud Run等の優先順位は今回の依頼を上書きしない。

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

### 2026-10-04 - 利用者指定のSNSロゴ画像を反映

- 依頼: 添付されたInstagram・TikTok・X・Threadsの画像を、それぞれのSNSロゴとして使用する。
- 実施内容: 4ファイルを加工せず`public/logos/`へ保存。`app/channel-logo.tsx`に共通部品を追加し、通常画面の接続アカウント・投稿先・連携設定・登録状況・予約・履歴・履歴詳細と、管理画面の投稿一覧・予約予定へ反映。SNS名とボタンのアクセシブルなラベルは維持。
- 公開パス: ロゴ参照は`appPath()`を使用し、ローカルの`/logos/`とGitHub Pagesの`/sns_management/logos/`に対応。元画像の縦横比と白い余白を`object-fit: contain`で保持。
- 検証: `npm test` 19件成功、Lint成功、`tsc --noEmit`成功。追加3テストで共通部品のSSR、ローカル／PagesのURL、既知／未知のSNS名、全表示箇所、4画像のSHA-256によるバイト一致を確認。本番と同じ部品・ビルド済みCSSを使用するローカル専用表示でPCと390px幅を確認し、全画像読み込み成功・モバイルの横はみ出しなし。
- DB・設定変更: なし。gourmetの既存データ、SNSテーブル、認証、Storage、Edge Functions、Cloud Runは変更しない。認証済み本番画面の実データ操作は行わず、表示確認に本番個人データを使わない。
- 知識: Graphify／Obsidianのコード構成（381ノード・422関係・35コミュニティ）と手書きSNSロゴノートを更新済み。`knowledge:check`成功。公開先は`https://marugo-s.github.io/sns_management/`。
- Git・公開: `feat/provided-sns-logos`からPRでmainへ反映し、CIとPagesデプロイの成功・公開4画像の一致を確認する。

### 2026-10-04 - API連携見出しに残った旧SNS略字ロゴを修正

- 依頼: 「API情報を登録」のInstagram見出しに旧`In`ロゴが残っている。
- 原因: 前回は一覧の`channel.label`を確認していたが、選択中のSNSを表示する`activeChannel.label.slice(0, 2)`が別の見出しに残存。以前の回帰テストも変数名`channel`に限定されており見逃した。
- 修正: 見出しを`ChannelLogo channel={activeChannel.id}`へ統一。Instagram・TikTok・X・Threadsすべてで指定画像へ切り替わる。通常画面の共通ロゴ使用箇所は8箇所。
- 回帰防止: 変数名を問わず`.label.slice()`と旧`network-badge`の直接描画を検出するガード、およびAPI見出しの選択SNS連動チェックを追加。修正前にテストが失敗し、修正後に成功することを確認。
- 検証: `npm test` 20件成功、Lint・型検査成功。実際の見出しJSXを抽出したローカル専用表示（DB接続なし）でPCと390px幅を確認。4画像読み込み成功、モバイル横はみ出しなし。
- DB・設定変更: なし。グルメ・SNSの既存データや認証・Storage・Edge Functions・Cloud Runを変更しない。
- 知識・公開: Graphify索引と手書きSNSロゴノートを更新し、`fix/integration-heading-logo`からPR・CI・Pagesの通常手順で公開する。公開先は`https://marugo-s.github.io/sns_management/`。

### 2026-10-04 - 接続アカウントの「API設定」位置を揃える

- 依頼: Instagram、TikTok、X、Threadsの各カードで「API設定」の書き出し位置を揃える。
- 実施内容: ロゴ横のテキスト領域を左揃えにし、SNS名の文字幅にかかわらず補足ラベルが同じ位置から始まるようにした。
- 変更ファイル: `app/globals.css`、`PROJECT_PROGRESS.md`。
- DB・認証・SNS API設定変更: なし。
- テスト: 個別テストは追加・実行しない。GitHub ActionsのPRチェック結果を確認する。
- 未完了事項: PRのマージとPages公開の確認。
- 次の作業: Pages公開完了後、対象の画面を再読み込みする。

### 2026-10-04 - SNS運用画面をリデザイン

- 依頼: アプリをリデザインし、使いやすさを向上する。
- 実施: 白・淡い紫のワークスペース、用途別のメニュー、投稿作成の3段階、本文・画像・動画の内容確認、検索・状態別履歴、日時順予約、全件数からの絞り込み、スマホメニュー、パスワード表示切り替え、キーボードのフォーカス表示を追加。
- 件数: 検索結果の件数と全体の予約数を分離。API「登録済み」の件数は保存済みの状態だけを集計し、未保存の入力確認を含めない。
- 既存機能: 予約の保存・キャンセル・再予約、添付・動画編集・履歴の再生、SNS設定、所属店舗を維持。SNSへの自動公開とDM取り込みは準備中と明示。
- 変更: `app/social-console.tsx`、`app/social-design.css`、`app/layout.tsx`、`app/lib/post-list.ts`、回帰テスト・進行記録・引き継ぎ・操作文書、生成された知識マップ。
- 検証: 型検査・Lint・21回帰テスト成功。PCで本文と日時のプレビュー、画面移動後の入力保持、予約の日時順、検索と全体件数の独立、下書きへの絞り込みを確認。390pxと320px幅で横はみ出しなし。ログイン・登録の店舗選択・パスワード表示復帰を確認。ローカル添付処理から画像がblob URLで読み込まれることを確認。
- UI検証: 本番DBにつながらない、リポジトリ外の専用ハーネスと架空データを使用。ブラウザ拡張のファイルURL権限が未許可のため、ローカル専用操作で同じファイル選択ハンドラーを実行した。権限設定は変更していない。
- DB・外部設定変更: なし。認証、共有gourmetデータ、SNS秘密値、Storage、Edge Functions、Cloud Runは従来どおり。
- 知識: 関連手書きノートとGraphify・Obsidianの索引を更新。公開先は `https://marugo-s.github.io/sns_management/`。Gitブランチ `feat/social-console-redesign` から通常のPR・CI・Pages手順で反映。
- 前回作業: 「API設定」左揃えはPR #6でマージ済み、Pages公開とDropbox側のCSS一致も確認済み。

### 2026-10-04 - X OAuth接続基盤を実装、公開と本人認可は保留

- 依頼: 所有するXアカウントをInstatic TalksXへ接続し、投稿権限を含むAPI設定を完了する。
- 実装: X専用Client ID・秘密情報の設定、固定Callback表示、認可開始、結果の安全な取り込み、トークン更新。従来のAccess Token手入力ではOAuth接続を完了できなかったため、Xだけ専用フローへ変更。他のSNSの手入力方式は維持。
- サーバー: S256 PKCE、ハッシュstateの単回取得と10分の期限、開始時・確定時の所属確認、設定／トークンの世代管理、削除・再作成対策、本人識別と一括保存、更新のlease／CAS／保存確認記録。更新の本人名は最後に確認した値を維持し、不要なAPI再取得をしない。
- 競合修正: 従来の秘密情報保存を原子的な所属確認・部分更新RPCへ変更。古い読み取り結果による更新トークンの巻き戻しを防ぐ。更新APIは1回だけ実行し、DB保存だけ同一内容で最大3回再試行する。分散システム間の完全な原子性は保証せず、プロセス停止や恒久障害は再認可で回復する。
- 変更: `app/lib/x-oauth.ts`、`app/social-console.tsx`、`app/globals.css`、Xの2 Edge Functionsと共有ヘルパー、既存秘密情報Function、加算migration、Node／Deno／SQL／複数接続テスト、CI、構成モデル、`docs/X_OAUTH.md`と引き継ぎ記録。
- 検証: 30 Node、16 Deno、TypeScript、3 FunctionsのDenoチェック、Lint、共有DBとOAuthのSQL確認、3つの独立接続競合シナリオ、Pages静的ビルドが成功。追加レビューの3指摘を修正し再確認。実X通信・実データ操作・投稿は行わない。
- 画面: リポジトリ外の合成SSRハーネスで1440px／390pxを確認。native viewport変更が反映されなかったため正確な幅のiframeでDOM寸法を検証。横はみ出しなし。SSRの認証・送信イベントは未検証。
- X側: 利用者承認済みの開発者登録を完了。既定Pay Per Useアプリの読み書き、機密Webクライアント、Callback、Websiteを保存。DM・メールは要求しない。新規認証情報はメモリから直接Energy Vaultへ保存し、平文出力・ファイル・撮影はしない。支払い・クレジット購入・自動チャージ・投稿は行わない。
- 本番: migrationとFunctions、Pages、アプリ側認証情報は未反映。共有gourmet／Auth／Storage／Cloud Runは変更しない。Supabaseは利用者によるhCaptcha完了待ち。GitHubのブラウザ認証・管理権限は確認。
- 未完了: Supabaseの権限確認、限定migration／Functions公開、PR・CI・Pages公開、Vaultからのアプリ設定、費用条件の利用者確認、本人によるOAuth認可。User Readの公式単価は$0.01／リソースだが、残高ゼロを無料とは扱わない。
- Git: `feat/x-oauth-pkce`、開始HEAD `02117d430a168eb7ab2546e9dcb8af1c22d2ff71`。本ログ時点ではpush・PR未実施。知識更新とソースミラー同期後にローカル変更を保存する。

### 2026-10-04 15:47 JST - X OAuthの知識・引き継ぎ更新を完了

- 実施: 許可済みObsidianの`20_設計/X OAuth接続.md`を作成し、`アーキテクチャ.md`からリンク。設計判断、先行実装の検証結果、未公開、課金なし、本人認可未実施、共有DB境界を記録した。
- 更新: `npm run knowledge:update`でコード限定索引、公開システムマップ、環境図、`docs/AI_CONTEXT.md`、ObsidianのGraphify・AI入口を再生成。494ノード・638関係・46コミュニティ。解析のLLMトークン使用は0。
- 対象外: `.npmrc`は潜在的機密ファイルとして自動除外。SQL、CSS、Supabase設定等の分類対象外ファイルも索引の証拠とはせず、該当ソース・独立DBテストを根拠とする。
- 検証: 更新処理内と最終の`knowledge:check`、`git diff --check`、知識モデルのNode回帰2件が成功。開始時に検出した4コードファイルの古さと公開統計不一致は解消。Vaultの秘密値マーカー検査に合格。`knowledge:search -- "X OAuth PKCE"`で新規設計ノートが先頭に表示された。
- アクセス: GitHubのMARUGO-s管理権限・CLI認証、Supabaseの共有gourmet本番プロジェクト所有者アクセス・CLI認証・正確な対象へのlinkを担当者が確認。hCaptcha待ちは解消済み。
- 本番・Git: この記録時点でOAuth migration、Functions、Pages、アプリ認証情報は未反映。commit・push・PRとソースミラー同期は未実施。本担当はアプリソースや本番を変更しない。
- 次: 生成物を含めてfeature branchへcommitし、その後にGit管理ツリーだけを許可済みソースミラーへ同期する。限定migration／Functions、通常PR・CI・Pagesを順に反映。費用条件が承認されるまで本番OAuth・X API・テスト投稿は実行しない。

### 2026-10-04 15:54 JST - X OAuthバックエンドを限定反映、フロント公開と認可は未完了

- 実施: 担当者が共有Supabase `ycsqfajidusuibqljjwr`へ正確な加算migration `20261004070000_social_x_oauth.sql`を個別適用。新規`social-x-oauth`・`social-x-oauth-callback`と更新された`social-integration-secrets`を公開した。
- 境界確認: 非SNSの`public`／`auth`に対する列・制約・ポリシー・grants・関数・RLSの6種の構造fingerprintは前後一致。共有プロジェクトへの`db push/reset`や本番データを用いるDBテストは行わず、他アプリの構造変更をしない。
- Git・CI: `feat/x-oauth-pkce`の実装commit `4fb332d50391863bcc217069ac2fb0a1d8eb6e1f`を保存。PR #8 https://github.com/MARUGO-s/sns_management/pull/8 でコードcommitのCI成功を確認。マージ・Pagesはまだ未完了。
- Dropbox: `4fb332d`のGit管理102ファイルを同期済み。35更新・67既存一致、競合0・削除0、`PROJECT_PROGRESS.md`の116,278 bytesが完全一致。ミラー独自ファイルは変更・削除せず、秘密情報・依存・build・索引作業出力は同期対象にしない。
- 記録変更: `PROJECT_PROGRESS.md`、`AI_HANDOFF.md`、`docs/X_OAUTH.md`と手書きObsidianのX OAuth設計ノートへ、バックエンド公開済みと未完了のフロント・アプリ設定・本人認可を分けて記録。コードと生成知識は変更しない。この追加文書変更のcommit／同期は保留。
- 未完了: PRマージ・Pages公開、Vaultからのアプリ設定、費用条件の利用者確認、本人OAuth認可と接続状態確認。アプリ認証情報の保存もX API通信も実施していない。投稿公開機能は本変更の範囲外。
- 次: 文書更新の確認後に通常のPR・Pages手順を完了。課金なし指定に従い、費用が発生し得るプロバイダー呼び出しは承認まで実行しない。テスト投稿はしない。

### 2026-10-04 16:15 JST - X OAuth公開・設定保存と最終引き継ぎ

- 実施: PR #8の最終head `0cdefc22af5b46073d67a4d136b756cd37921c38`のCI成功後、16:02 JSTに通常のsquashマージ。main `6f07ef8dc14703557285b9380fc924d16c6197fc`のPages run https://github.com/MARUGO-s/sns_management/actions/runs/37184605009 は成功。
- 本番設定: ブラウザ担当が16:05 JSTにClient IDと秘密情報をVaultから保護された入力で保存し、再読込を確認。秘密情報欄は空で保存済み表示、固定Callbackと`tweet.read tweet.write users.read offline.access`は正しい。X用のトークン手入力欄なし。状態は「設定保存済み・未接続（要確認）」。
- 本番境界: 先行記録の加算migrationと3 Functions以外を再適用しない。6種の非SNS構造fingerprint一致、無関係のFunctions不変、秘密情報のブラウザロール権限拒否、JWT必須Functionsの未認証401を記録。本担当によるDB・Auth・Cloud Run・SNS API変更はなし。
- 費用: XはPay Per Use。残高・無料クレジット・今回使用額は$0、カード未登録。$20無料クレジット案内は最初のカード登録が条件。本人識別APIの最終費用・必要クレジットは未確定。OAuth開始・本人認可・Callback・トークン交換・X API・カード登録・購入・自動チャージ・投稿は未実施。
- 文書: `PROJECT_PROGRESS.md`、`AI_HANDOFF.md`、`docs/X_OAUTH.md`の現在状態を更新。許可済み手書きObsidianのX OAuth設計ノートとアーキテクチャ2件も更新、同時編集の競合0。アプリソース・生成知識は変更せず、構造再生成は不要。
- 検証: `knowledge:check`の索引鮮度・生成物・Vault秘密値マーカー検査、知識モデルNode回帰2件、`git diff --check`に成功。PR #8マージとPages成功はGitHub CLIでも再確認。
- Git: `docs/x-oauth-rollout-complete`を公開mainから作成。文書commit `cb2fc93`を保存し、最終完了ログも同ブランチで保存。通常のPR・CIへ提出し、mainへの直接pushやCI前マージは行わない。
- Dropbox: `cb2fc93`のGit管理102ファイルを検査し、3文書更新・99既存一致、全102内容一致、競合0・削除0、進行記録一致を確認。無関係のミラー編集を保持し、`.git`・`.env*`・依存・build・索引作業出力は同期対象外。最終ログの追加文書も同じ安全な照合で再同期する。
- 未完了: 本人認可、有効トークンの保存、実X接続確認。投稿公開と予約の自動実行は未実装。設定保存済みを接続済み・投稿機能完成と扱わない。
- 次: 利用者が設定済みで接続保留か無料クレジット条件の確認かを判断するまで、費用が発生し得る操作を進めない。条件確認の選択だけではカード登録は承認されない。文書PRのCI結果を確認し、通常のマージで引き継ぎを確定する。

### 2026-10-04 19:01 JST - X本人認可と接続保存の確認、運用文書を更新

- 依頼・許可: 18:59 JSTに利用者が無料APIクレジットを使うX接続を承認。ブラウザ担当が認可画面で利用者所有の本人と権限を確認し、19:01 JSTにOAuthを1回完了した。
- 実画面: 成功通知、再読込後のX「登録済み」「Xに再連携」、トークン保存済み・サーバー管理・値非表示を確認。UIに接続名は表示しないため本人確認は認可画面を根拠とする。認可後の保存を設定登録だけと区別する。
- 範囲: Callbackに必要な本人識別以外の追加・手動API、トークン更新、購入、投稿は実施しない。接続後も自動チャージOFFと有限の利用上限が維持。表示額の丸め・遅延から費用ゼロや完全な課金防止は断定しない。
- 変更ファイル: `PROJECT_PROGRESS.md`、`AI_HANDOFF.md`、`docs/X_OAUTH.md`と手書きObsidianの`X OAuth接続.md`、`アーキテクチャ.md`。個人の識別情報・カード・詳細な金融情報・トークン値は記録しない。
- DB・デプロイ: 本担当は文書だけを更新。既存migration・3 Functionsを再適用せず、共有DB・Auth・Cloud Run・他アプリ秘密情報を変更しない。PR #8とPagesの実装は既に公開済み、PR #9の設定保存記録もマージ済み。
- 検証・Git: `knowledge:check`と`git diff --check`で文書・索引・秘密値ガードを検証し、`docs/x-oauth-live-connection`から通常の文書PR・CIへ提出する。mainへの直接pushは行わない。構造変更がなく索引再生成や本番通信を伴う追加検証は不要。
- Dropbox: 許可済み手書き2ノートとGit管理ソースミラーを、競合検出と既知commit内容の比較で同期。無関係の編集は保持し、`.git`・`.env*`・依存・build・索引作業出力は同期しない。
- 未完了・次: 投稿公開・予約自動実行は未実装。本番の期限切れ・更新・再認可は未検証。新しいAPI・公開処理は利用者の次の指示と費用判断を待ち、接続確認だけのために投稿や追加実通信をしない。

### 2026-10-04 20:04 JST - X手動投稿の初期実装を記録（本番未反映）

- 依頼: 文章・画像・動画のX手動投稿。確認スナップショット、元ファイル全件ハッシュ、接続fingerprint、重複抑止、結果不明ロック、動画の明示的続行を記録。予約自動公開は対象外。
- 変更: `app/lib/x-posting.ts`、運用画面・CSS、投稿Function／共有ヘルパー／加算migration、Node／Deno／SQL競合テスト、CI・依存、構成モデルと`docs/X_PUBLISHING.md`。文書担当はこの記録・`AI_HANDOFF.md`・投稿設計文書と許可済み手書きノートのみを編集。
- 検証: Node42件、OAuth Deno17件、独立DB・OAuth競合、Pages静的ビルドは成功。投稿モック31件の最終再実行、回復処理の独立再レビュー、修正後の合成SSR画面確認は未完了。実Provider通信・投稿・アップロード・追加再認可なし。
- DB・公開: 本番変更なし。新migration・投稿Functionと変更OAuth Functionsは未反映。既存OAuth migrationを再適用せず、共有DB・Auth・他アプリ・Cloud Runを変更しない。
- Git・知識: `feat/x-manual-publishing`、開始HEAD `640b09688068c833baca56dc620b51e03785be2a`、commit／PR未実施。構造変更に伴う索引再生成とソースミラー同期は親担当が最終確認後に実施する。秘密値・投稿本文・個人識別・金融詳細は記録しない。
- 次: 最終検証・再レビュー、知識更新、通常PR・CIと正確なhead指定のsquash、限定本番反映。メディア追加再認可・実投稿は利用者の別判断を待つ。

### 2026-10-04 20:10 JST - X手動投稿の最終モック・重点レビュー・合成画面確認

- 投稿Denoモック31件（Provider16・制御15）、OAuth Deno17件、UI組合せ24件が成功。初回全42 Node・独立DB／OAuth競合・Pagesビルドの成功に加え、独立安全性の最終重点レビューは阻害指摘なし。
- 合成画面再確認は1440×1000／390×844で横はみ出しなし。中央ダイアログ、架空接続名、メディア権限不足時の確認無効化を確認。実コンポーネントのhydrationでpreview待機中の編集無効化、取消し・再編集・再確認、ローカルfile digest／freezeから確認画面への到達を確認。
- 範囲: preview-onlyモックを使用。最終投稿・Storage保存／アップロード・OAuthはクリックしない。外部通信と最終操作はモック側でも拒否。正確なReact state内digest値、本番永続化、実Provider受理は未検証。証跡: 作業場所の`../reports/qa/x-manual-publication/follow-up.txt`。
- 記録変更: 投稿設計文書・進行記録・引き継ぎと許可済み手書き2ノート。限定migration適用は担当者の結果待ち。本番適用済みと断定せず、親担当が知識更新・PR・限定公開の正確な結果を追記する。


### 2026-10-04 20:14 JST - X手動投稿の限定バックエンド公開と最終検証

- 反映: 正確な追加migration `20261004110000_social_x_publications.sql`を重複防止・timeout付き単一トランザクションで適用。6種の非SNS構造fingerprintと既存Storageトリガー2件の定義・ACL fingerprintは一致。SNS用Storage fenceのみ追加し、8件の権限メタデータ確認に合格。本番データによる書込テストなし。
- Functions: `social-x-publish` v1/JWT必須、`social-x-oauth` v2/JWT必須、`social-x-oauth-callback` v2/JWT不要だけを公開。無関係な6 Functionsは全メタデータ一致。投稿・OAuthの未認証要求は401。
- 検証: 最終Node45件、投稿Denoモック31件、OAuth17件、UI関連24件、型検査、Lint（既存hook警告1件のみ）、共有DB・OAuth・投稿の隔離DB／競合、Pages静的ビルドに成功。安全性／不具合の重点再レビューで阻害なし。依存auditは既存28件から増加なし、一括依存更新なし。
- 画面: 1440×1000／390×844で中央確認画面、対象アカウントの合成表示、横はみ出しなし、メディア権限不足時の確認無効化。hydrated実コンポーネントをpreviewのみのモックで動かし、確認中入力禁止、取消し後の編集・再確認、合成元ファイルのdigest／freeze到達を確認。最終送信・アップロード・永続化の実UI操作は未検証。
- 境界: 実X通信・投稿・アップロード・更新・再認可・購入・支払い／自動チャージ変更はなし。既存4権限の接続を保持。画像・動画の`media.write`追加再認可は利用者の別判断。予約自動公開は未実装。
- 知識・Git: コード限定Graphify、構成図、Obsidianの索引・手書き設計を更新し、`knowledge:check`と`git diff --check`成功。feature branchから通常PR・CI・正確なhead指定squash・Pagesを進める。フロント公開とソース控えの同期は本記録時点で保留。


### 2026-10-04 20:23 JST - 並行Google公開変更を保持してPRを統合

- 追加確認: PR #12作成後にmainのGoogleログイン公開PR #11が進んでいたと判明。Pagesの公開フラグ、Google文書・テスト、両方の進行／引き継ぎ履歴を保持して取り込む。Xの実行コードとSQLは不変、バックエンド再適用なし。
- 競合: 自動生成の構成図・索引は統合ソースから再生成。ソース控えの9差分は新しい正規main `08e7dc7`と完全一致し、独自編集ではないことを確認。削除・一方の変更への巻き戻し・強制pushなし。
- 再検証: Node47件、投稿モック31件、Function型チェック、TypeScript、Lint（既存警告のみ）、Googleの本番フラグを有効にしたPagesビルド成功。知識整合と差分確認後、更新PRのCI・通常マージ・Pagesを継続する。
- PR: https://github.com/MARUGO-s/sns_management/pull/12 。フロント公開・ソース控え同期は本記録時点で保留。実X投稿／メディアアップロード／再認可は引き続き別判断。

### 2026-10-04 20:37 JST - X手動投稿の公開確認と文書引き継ぎ

- 依頼・実施: 文章・画像・動画の手動投稿を公開し、20:29 JSTのPR #12マージと20:32 JSTの同じmain SHAのPages成功を確認。20:37 JSTの新しい認証済みタブで即時投稿UI・空の確認無効・加重文字数／上限・費用注意・既存4スコープ接続記録・メディア不足警告を読み取り専用確認。元の未保存入力を保持。
- Git・デプロイ: feature最終head `dda2c8a4e2f4c7aad364d6a96b8d4ce1734c0e96`、CI `37198676592`成功、squash main `225c73282ebaeaec618aa5580b2c384462515522`、Pages `37198925360`成功。並行Google PR #11を保持。20:14 JSTの限定バックエンドを再適用せず、DB・Functions・共通Auth・他アプリ・Cloud Runを追加変更しない。
- 変更: `PROJECT_PROGRESS.md`、`AI_HANDOFF.md`、`docs/X_PUBLISHING.md`と許可済み手書き`20_設計/X手動投稿.md`・`アーキテクチャ.md`のみ。過去の未公開記録は履歴として保持。構造変更なし、Graphify再生成なし。
- 検証: 統合コードの47 Node・31投稿Deno・17 OAuth Deno・24 UI、隔離DB／競合、型検査、Pagesビルド、独立再レビューが成功。本文書変更は知識モデル2件、`knowledge:check`、`git diff --check`で検証。合成画面と本番読み取り専用確認を、実Provider・投稿成功と区別する。
- 同期: 20:33 JSTにソースミラー118ファイルが公開mainと一致、競合0・削除0を確認。本終了文書は既知commit内容と照合して親担当が同期する。秘密値・個人識別・金融詳細・投稿本文・添付・生成索引作業出力は追加しない。
- 未検証・次: メディアの追加権限・再認可は20:37:55 JSTの別承認後に専任担当が実施中で完了未確認。実投稿は別操作。実アップロード・更新・Provider本人照会は本公開確認ではなし。予約自動公開なし。Googleボタンは認証済み画面で確認不可のためログアウトしない。`docs/x-manual-publishing-live`から通常の文書PR・CIへ提出し、mainへ直接pushせず、終了ログをマージするためだけの再帰ログは追加しない。


### 2026-10-04 20:44 JST - 承認済みメディア設定を保存、再認可未完了を記録

- 許可・操作: 利用者が20:37:55 JSTにメディア用権限追加・再認可を別途承認。専任担当が20:43:03 JSTに5スコープを保存し、既存Callback／認証情報を保持。設定変更は旧接続を無効化する。認可画面の対象・権限確認後に認可を1回操作したが、アプリ復帰は確認できず再クリック・reloadしない。
- 現在状態: 20:44:36 JSTの新しいアプリタブはXの「API設定 要確認」、保存された5スコープ、空の秘密情報欄、接続成功表示なし。メディア設定保存済みと接続済みを区別し、文章・メディアとも再接続完了まで利用準備完了としない。20:37 JSTの4スコープは当時の履歴。
- 範囲・証跡: 実投稿・実アップロード・Providerテスト・支払い設定・DB／Functions／Auth／Cloud Run変更なし。証跡は作業場所の`../reports/qa/x-manual-publication/media-reauth.txt`。本人識別や秘密値を文書へ追加しない。担当者が利用者へ障害と再試行判断を報告し、勝手な再認可や送信をしない。
- 文書終了: 所有3文書と手書き2ノートだけを更新。知識モデル2件、`knowledge:check`、`git diff --check`成功。通常の文書PRへ提出し、終了ログPRのマージだけを記録する再帰ログや構造索引再生成は追加しない。
