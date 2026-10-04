# Googleログイン

2026-10-04、所有者が共有gourmetプロジェクト `ycsqfajidusuibqljjwr` のGoogleプロバイダーを保存。公開Auth設定APIでGoogle・メール認証の両方が有効と確認した。

- Pagesビルドだけで `NEXT_PUBLIC_SUPABASE_GOOGLE_ENABLED=true` を指定し、既存の「Googleで続ける」ボタンを表示する。未指定の環境では非表示。
- Google側Callbackは `https://ycsqfajidusuibqljjwr.supabase.co/auth/v1/callback`。SNSへ戻るURLは `https://marugo-s.github.io/sns_management/`。ワイルドカードを実際の戻り先に使わない。
- Client SecretはSupabaseにのみ保存する。Git、公開ビルド、知識ノートには記載しない。
- メールログイン、SNS専用保存キー・local logout、所属店舗、管理者確認、RLSは既存の処理を維持する。Googleログインだけで店舗・管理者権限を追加しない。
- 共有AuthのGoogleプロバイダーはgourmetにも作用するが、他アプリのGoogle UI導入完了を意味しない。
- Googleプロバイダー有効・認証開始・本人認可後のログイン完了は別の検証段階。既存利用者のUID、店舗、所有データの維持は所有者の実ログイン後に確認する。
- Google Cloudで旧シークレットと新シークレットが併存。旧シークレットの操作ログ露出は報告済み。所有者は現時点で削除・無効化を希望していないため変更しない。接続成功後の失効は改めて所有者の承認を得る。

SNSへの投稿・Xの認可・動画処理は今回の変更対象ではない。DB migration、Functions再配備、gourmetのSite URL・既存Redirect URLの上書きは行わない。
