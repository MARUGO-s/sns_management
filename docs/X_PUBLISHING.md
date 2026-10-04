# Xへの手動投稿

## 範囲と現状

2026-10-04 20:14 JST、文章・画像・動画の手動投稿をローカル実装・検証済み。
限定migrationと投稿／OAuth Functionsは本番公開済み。フロントは通常のPR・CI・Pages公開待ち。
本番反映と最終検証結果は`PROJECT_PROGRESS.md`の最新記録を正本とする。
予約保存は既存機能のまま。予約日時に自動投稿するスケジューラは追加しない。
実投稿、実メディアアップロード、有料APIを使うテストは行わない。

公開先: https://marugo-s.github.io/sns_management/

### 初期版の制限

- 本文は必須、NFC正規化後にXの加重文字数で280以内。
- 公式`twitter-text@3.1.0`をUIとサーバーで使用。日本語・絵文字・URLを考慮。
- 画像はJPEGまたはPNG、各5MiB以内、最大4枚。
- 動画はMP4、20MiB以内、1本。画像との混在は不可。
- これはアプリの保守的な上限で、Xの全プランの最大値を保証しない。
  実際のエンコード・メディアの受理はX側の条件にも従う。
- GIF、任意の文書、処理済み動画の自動選択、動画ワーカーへの変更は対象外。
- 手動操作が送るのはXだけ。他SNSの公開成功を偽って記録しない。

## メディア権限

公式OpenAPIはメディアのupload、initialize、append、finalize、statusに
OAuth2ユーザートークンの`media.write`を要求する。投稿作成自体の必須権限は
`users.read tweet.read tweet.write`。

既存の`tweet.read tweet.write users.read offline.access`の接続は文章用として維持する。
画像・動画を使う場合は、利用者が明示的に
`tweet.read tweet.write users.read offline.access media.write`を保存し、再認可する。
設定保存はトークンの世代を無効化するため、画面を開いただけで自動変更しない。
追加権限がなければメディアAPIを呼ぶ前に`media_permission_required`で止める。
トークン交換では、Xから返された権限が要求した権限を含むことを検証する。
DM・メールの権限は要求しない。

## 操作とAPI契約

1. 投稿内容と元ファイルを保存する。即時投稿では予約日時を必要としない下書きとする。
2. 元ファイルのバイト列をSHA-256で確認し、DBだけを読む
   `{action:"preview",workspaceId}`から対象接続の不透明なfingerprintと、
   保存済みの接続名があれば取得する。X APIやトークン更新は呼ばない。
   確認画面で本文・添付・送信先X・APIクレジット消費の可能性を確認する。
3. JWT必須の`social-x-publish`を呼ぶ。
   `{action:"publish",postId,requestId,fileIds,expected}`。
   `expected`は確認した未正規化の保存本文`body`、
   順序付き`files:[{id,storagePath,mimeType,sizeBytes,sha256}]`、
   `connectionFingerprint`を保持する。
   新規保存後は確定したファイルID・パスへ置き換え、確認したハッシュを保持する。
4. 動画がXで処理待ちの場合、同じ記録・requestIdで明示的に処理状況を確認して続行する。
5. `published`に実際のX投稿IDが保存された時だけ公開済みとする。
   `{action:"status",postId}`はDBの安全な状態だけを読み、Xへ問い合わせない。

公開結果は`state,attemptId,requestId,remotePostId,errorCode,nextCheckAt`に限定する。
previewは`fingerprint,username`だけを返す。
初回準備の既知SQLロールバックが証明できたエラーだけは、
当該requestId付きの`notStarted`を返せる。
アクセストークン、署名付きStorage URL、内部世代、Xの生エラー本文は返さない。

## 安全境界

- 実際のワークスペース所有者、許可された編集者・管理者だけが投稿できる。
  viewerや他ワークスペースを閲覧できる全体管理者は投稿権限を持たない。
- サービス専用RPCで所属、投稿先X、本文、元ファイルの順序・親・パスを固定する。
  準備時に確認した生本文、順序付きファイルメタデータ、SHA-256、
  DB接続fingerprintを比較し、確認後の別編集や接続先変更を拒否する。
  fingerprintは設定・トークン世代・対象アカウント・権限に結び付く不透明な値で、
  秘密情報や内部世代そのものを返さない。
- 最初の準備で接続世代と対象を固定する。同一requestIdの続行では確認本文とファイルを
  再比較し、自身の正当な更新後のfingerprint変化を許容しても保存済みの接続境界を
  巻き戻さない。後続のトークン照合・CASで現在の利用可否を確認する。
- 準備中・送信中・結果不明・公開済みの本文、添付、投稿先、履歴を削除・差替えさせない。
  Storageの上書き・削除もSNSバケット内の対象投稿に限定して防ぐ。
- 既存の本人確認済みトークン世代を使用。必要時だけ1回更新し、保存後に読み直す。
  401になった公開要求をトークン更新後に送り直さない。
- メディアは署名付き短期URLで元ファイルをサーバー取得。サイズ・MIME・署名を検証。
  初回アップロード前は全添付のSHA-256を照合し終えるまで、
  トークン更新もメディアAPIも呼ばない。後の添付の差替えで一部だけ送らない。
  任意URL、任意バケット、別ワークスペースのファイルを渡せない。
- 動画は分割アップロード。処理待ちは保存し、処理状況を手動で確認する。
  次回確認時刻はfinalize応答を受け取った時点から算出し、
  保存済みメディアの有効期限は短縮だけを許可し、延長しない。
- POST前にDBへ` sending `を確定。外部公開要求は1回のみ、タイムアウト後の再送はしない。
- 同一requestIdの重複を抑止。別requestIdでも送信中・結果不明・公開済みを迂回できない。
- X受理後のDB応答消失では同一内容の確定記録だけ再試行し、Xへ再送しない。
  送信中の期限切れは再キューにせず結果不明扱いで停止する。
- 公開成功の記録は、送信後に所属や設定が変更されても保存する。
  外部公開とDB更新の分散トランザクションによる完全な原子性は保証しない。

## 失敗・結果不明

明確な拒否は`rejected`として安全なコードだけを記録する。
タイムアウト、切断、5xx、不正な成功応答、結果保存の不確実性は`unknown`とする。
結果不明の投稿はX側を人が確認するまで再送・削除・内容変更できない。
初回prepareが既知のSQL例外でロールバックしたと確認できる場合だけ
「この要求は開始していない」と扱える。通信切断や後のstatusに記録がないことは
未開始の証明にならない。送信ゲートでも既知ロールバックと応答消失を区別する。
確実な未開始証明のない要求はrequestIdを保持し、別キーで再送しない。
自動的に最近の投稿を読み取って照合する処理も追加しない。
準備中のメディア失敗は本文の公開前だが、アップロードだけのAPI消費はあり得る。

## テストと限定公開

```sh
npm run check:x-publish
npm run test:x-publish
npm run test:db:x-publish
npm run test:db
npm run check:x-oauth
npm run test:x-oauth
npx tsc --noEmit
npm run lint
npm test
npm run build:github-pages
npm run knowledge:check
git diff --check
```

Provider通信はすべてモック。DBテストは使い捨てPostgreSQLのみ。
テストに本番トークン・投稿本文・添付・カード情報を渡さない。
独立した安全性・不具合レビューを行い、UIは合成データでPC・モバイルを確認する。

### 2026-10-04 20:10 JSTの検証記録

- Node回帰42件、OAuth Deno17件、独立DBの共有境界・投稿・OAuthと
  複数接続競合テスト、GitHub Pages向け静的ビルドは成功。
- 投稿Denoモック31件（Provider16件・制御15件）の最終実行と、
  UI関連24件の組合せテストが成功。独立した安全性の最終重点レビューは阻害指摘なし。
- 合成画面は正確な1440×1000／390×844で再確認し、横はみ出しなし。
  ダイアログ中央配置・架空接続名・`media.write`不足時の確認ボタン無効化を確認。
  外側windowのresizeが反映されないため、同一originの正確なiframe寸法を使用。
- 実際の本番コンポーネントをhydrationした合成fixtureで、DB-previewだけのモックを使い、
  preview中の編集無効化、取消し→編集→再確認、ローカルFileのdigest／freezeから
  確認画面へ進む経路を確認。React state内の正確なdigest値は抽出していない。
  最終投稿・Storage保存／アップロード・OAuthを実行せず、外部通信と最終操作は拒否する。
  実Provider・本番永続化・メディアdecoderの受理を検証済みとは扱わない。
- 合成画面の証跡は作業場所の`../reports/qa/x-manual-publication/follow-up.txt`。
- 構造変更に伴う知識索引の再生成、最終PR・CI、本番限定反映は未完了。
  実X投稿・実メディアアップロード・追加再認可は行っていない。

対象バックエンドは加算migration
`20261004110000_social_x_publications.sql`と`social-x-publish`、
追加権限に対応する`social-x-oauth`・`social-x-oauth-callback`のみ。
共有Supabaseで`db push/reset`、共通Auth、他アプリのテーブル・秘密情報、
Cloud Runを変更しない。既存OAuth migrationを再適用しない。
通常のPR・CI・正確なhead指定のsquashを使用し、mainへ直接pushしない。
実投稿・追加権限の本人認可は別の利用者判断で実施する。

## 一次資料

- https://docs.x.com/openapi.json
- https://docs.x.com/x-api/posts/create-post
- https://docs.x.com/x-api/media/upload-media
- https://docs.x.com/x-api/media/initialize-media-upload
- https://docs.x.com/x-api/media/append-media-upload
- https://docs.x.com/x-api/media/finalize-media-upload
- https://docs.x.com/x-api/media/get-media-upload-status
- https://docs.x.com/fundamentals/counting-characters
- https://github.com/twitter/twitter-text

権限とリクエスト契約は2026-10-04に公式OpenAPIで確認。
費用・無料クレジット・利用上限の最新条件は利用者のDeveloper Consoleで別途確認する。
無料クレジットや自動チャージOFFを、API費用ゼロの保証とは説明しない。
