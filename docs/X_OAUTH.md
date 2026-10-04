# X OAuth接続

## 状態と範囲

2026-10-04 16:05 JST時点で実装・検証、限定バックエンド反映、Pages公開と
アプリ側の設定保存が完了。本人のX認可と接続確認は課金なし指定により保留。
加算migration `20261004070000_social_x_oauth.sql`、`social-x-oauth`、
`social-x-oauth-callback`、更新された`social-integration-secrets`は公開済み。
現在の公開先は https://marugo-s.github.io/sns_management/ 、共有Supabaseプロジェクトは
`ycsqfajidusuibqljjwr`。古いSNS/SMSプロジェクトの設定を流用しない。

実装commitは `4fb332d50391863bcc217069ac2fb0a1d8eb6e1f`。
PR #8 https://github.com/MARUGO-s/sns_management/pull/8 の最終head
`0cdefc22af5b46073d67a4d136b756cd37921c38`はCI成功し、16:02 JSTに
`6f07ef8dc14703557285b9380fc924d16c6197fc`としてsquashマージ。
Pages run https://github.com/MARUGO-s/sns_management/actions/runs/37184605009
は同じSHAで成功。本番の設定保存後、再読込した秘密情報欄は空で
「保存済み（変更時のみ入力）」、状態は「設定保存済み・未接続（要確認）」。
固定Callbackと要求スコープを確認し、X用のトークン手入力欄は表示しない。
非SNSの`public`／`auth`について列・制約・ポリシー・grants・関数・RLSの6種の
構造fingerprintがバックエンド適用前後で一致している。
無関係のFunctionsは変更なし。秘密情報のRLS・テーブルアクセス・関数実行権限は
`anon`／`authenticated`に対して拒否、JWT必須Functionsの未認証要求は401を確認済み。

今回の機能はXのOAuth認可、接続情報の保管と更新まで。
投稿の公開、予約投稿の実行、DM、コメント、分析、Webhookは追加しない。
接続検証のために投稿する必要はない。

開発者登録は完了し、コンソールには既定の`Pay Per Use`プロジェクトが表示された。
X側の読み書き権限（DM・メールなし）、機密Webクライアント、固定Callback、
Websiteは保存・再表示で確認済み。認証情報はEnergy Vaultから保護された入力で
アプリへ登録し、秘密値を平文表示・出力・撮影・ファイル保存していない。
残高ゼロや登録完了を「API利用も無料」と解釈しない。
利用者は課金しない指定のため、費用が発生し得る本番API呼び出しは保留する。
OAuth完了時のアカウント識別も、この保留対象に含む。
2026-10-04のコンソールでは残高・無料クレジット・今回使用額はすべて$0、
カード未登録。$20無料クレジットの案内は最初のカード登録を条件としている。
本人識別の`users/me`の最終費用・利用制限・必要クレジットは未確定。
利用者が承認するまでOAuth開始・本人認可・Callback・トークン交換・X API通信を
実行しない。カード登録・クレジット購入・自動チャージ・投稿も行っていない。
設定済みのまま保留するか、無料クレジットの条件確認だけを進めるかが未決定。
条件確認の選択も、カード登録の承認を意味しない。

## 固定URL

- アプリへの戻り先: https://marugo-s.github.io/sns_management/
- Xに登録するCallback:
  https://ycsqfajidusuibqljjwr.supabase.co/functions/v1/social-x-oauth-callback
- X認可画面: https://x.com/i/oauth2/authorize

CallbackはSupabase Edge Functionで受信する。GitHub Pagesのルートを
XのCallbackとして登録しない。登録URLは完全一致が必要。
アプリでCallbackを任意入力させず、サーバーの固定URLを表示する。

## 設定と利用手順

1. X Developerでアカウント登録を完了し、開発者アプリの利用条件と料金を確認する。
   規約への同意、支払い、プラン変更は利用者の判断なしに行わない。
2. 自分が管理する開発者アプリでOAuth 2.0を有効にし、投稿権限に対応した
   Webアプリのクライアント設定を確認する。
3. 上記CallbackとアプリURLを登録する。公開クライアントはClient IDを使い、
   機密クライアントはClient IDと秘密情報をサーバー側へ保存する。
4. Instatic TalksXのX設定でClient IDと必要な秘密情報を保存する。
   空欄の秘密情報は、保存済みの値を消す指示ではない。
5. スコープは `tweet.read tweet.write users.read offline.access`。
   投稿とプロフィール確認に加え、`offline.access`で継続更新を可能にする。
6. 費用と利用条件について利用者が判断した後、「Xと接続」から本人が認可を完了する。
7. アプリへ戻り、接続状態とアカウント表示を確認する。
   期限切れや取消しの場合は状態を確認して更新または再認可する。

秘密情報、アクセストークン、更新トークンをチャット、Git、スクリーンショット、
Graphify、Obsidian、ソースミラーに記録しない。

## サーバー契約

`social-x-oauth`へのPOSTはSupabaseの認証済み利用者として行う。

- `configure`: `workspaceId`, `appId`, 任意の`clientSecret`, `scopes`
- `start`: `workspaceId`。`authorizationUrl`と`callbackUrl`を返す。
- `refresh`: `workspaceId`。安全な状態と登録有無だけを返す。
- `status`: 秘密値を含まない設定・接続メタデータ。
  `connected`は現在の設定に紐付く本人確認済み・有効期限内のトークンのみ。
  `needsRefresh`は同じ設定で期限が切れ、更新用トークンがある状態。
  `needsReview`は保存済みの認証情報が現在の確認済み設定に一致しない状態。
  アカウント名は最後に本人確認した時点の値で、毎回の更新で取り直さない。

CallbackはアプリのJWTを持たないため、ランダムなstateによって要求と紐付ける。
戻り先に付ける結果は`social_x_oauth=success|denied|error`と
限定された`social_x_error`のみ。認可code、state、トークン、プロバイダーの
エラー本文をブラウザの戻り先へ付けない。

## セキュリティ設計

- S256 PKCE、stateのハッシュ保存、10分の有効期限、単回の原子的な取得。
- 実際のワークスペース所有者・メンバーだけが設定や認可を変更できる。
  全体管理者の閲覧権限だけでは他人の認証情報を変更できない。
- Callback時にも開始者の所属を再確認する。設定変更・削除・再作成が
  行われた場合は古い認可結果を採用しない。
- 失敗時に動作中のトークンを上書きしない。更新処理の競合を防ぎ、
  Xが新しい更新トークンを返した場合は保存する。
- 外部の任意URLへ移動させない。アプリの固定ルートだけに戻す。
- トークン値はブラウザに返さず、localStorageにも保存しない。
- 従来の手入力保存も、所属確認と変更項目だけの更新を同一DB処理で行う。
  更新済みトークンを古い読み取り結果で上書きしない。
- 更新トークンの保存を同じ内容で再試行し、成功後の応答消失を保存済みの
  確認記録で判定する。プロバイダーへの更新要求そのものは再実行しない。
- 既存の認証情報テーブルはサーバーのみが読めるDB列。
  アプリ独自の暗号化保管を実装したという意味ではない。
- Xの認可はアプリへのSupabaseログインとは別のフロー。

## 本番反映の前提

機能・テスト・変更内容の確認後に、以下を個別に反映する。
2026-10-04 16:05 JST時点で以下すべてとアプリ側設定の保存が完了。
本番状態を確認せず再適用しない。本人の認可とトークン保存はまだ未完了。

- 反映済み: OAuth用の正確な加算migration `20261004070000_social_x_oauth.sql`だけを対象に適用。
- 反映済み: `social-x-oauth`、`social-x-oauth-callback`と必要な共有ヘルパー。
- 反映済み: 所属確認を強化した`social-integration-secrets`。
- 反映済み: 通常のPR、CI、GitHub Pagesの公開手順でフロントエンドを反映。

**共有プロジェクトへ`db push`や`db reset`をしない。**
既存のグルメテーブル、Authプロバイダー、共通の認証設定、Cloud Run、
他アプリの秘密情報を変更しない。
本番を適用先として使うDBテストを行わない。

## 検証

- Nodeの回帰テストと静的ビルド。
- OAuthヘルパー・プロバイダー通信のモックテスト。
- 独立Postgresでの所属・state・設定世代・競合・秘密情報非公開の確認。
- 本番認証を持たない合成データの画面でPC・モバイル確認。
- 本番反映後、本人の認可で接続状態と`users/me`の識別結果を確認。
  取消し、期限切れ、再接続、更新失敗は動作中の接続を壊さない条件で検証。
- 投稿せずに完了を確認する。接続完了を投稿機能の完成と表現しない。

```sh
npm test
npx tsc --noEmit
npm run lint
npm run test:db
npm run test:db:oauth
npm run check:x-oauth
npm run test:x-oauth
npm run build:github-pages
```

OAuthチェックとテストにはDeno 2が必要。CIでは検証済みのDeno 2.9.6と
公式setup-denoを使用する。
OAuthのDenoテストはモック通信のみで、ネットワーク権限を付与しない。
プロバイダーの更新とDB保存は別システムのため、プロセス停止などにより
更新済みトークンの保存が不可能なケースは再認可が必要になる。
分散した2システム間の完全な原子性を保証すると説明しない。

## 2026-10-04 16:05 JST 公開・設定保存の確認記録

- PR #8の最終CIとsquashマージ、マージSHAのPages公開成功を確認。
- 本番アプリの設定保存・再読込、秘密情報非表示、固定Callback、要求スコープ、
  X専用UIを確認。設定保存を接続完了と扱わない。
- OAuth開始・本人認可・Callback・トークン交換・X API・支払い関連・投稿は未実施。
- 公開処理や予約の自動実行は未実装。次は費用条件の利用者判断、その後に
  許可された範囲で本人認可と接続状態を確認する。テスト投稿はしない。

## 一次資料

- X OAuth認可・PKCE:
  https://docs.x.com/fundamentals/authentication/oauth-2-0/authorization-code
- Xユーザートークン:
  https://docs.x.com/fundamentals/authentication/oauth-2-0/user-access-token
- X権限対応:
  https://docs.x.com/fundamentals/authentication/guides/v2-authentication-mapping
- Xアカウント識別:
  https://docs.x.com/x-api/users/get-my-user
- Xの料金:
  https://docs.x.com/x-api/getting-started/pricing
- Supabase Function設定:
  https://supabase.com/docs/guides/functions/function-configuration
- SupabaseユーザーJWT確認:
  https://supabase.com/docs/reference/javascript/auth-getuser
- Deno CI設定:
  https://github.com/denoland/setup-deno

X公式SDKの更新トークン処理:
https://github.com/xdevplatform/twitter-api-typescript-sdk/blob/main/src/OAuth2User.ts
