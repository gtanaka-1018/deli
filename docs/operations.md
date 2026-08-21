# 億メーター運用ガイド

更新日: 2026-08-20

## 公開先と正本

- 本番: https://okumeter.com
- Vercel既定URL: https://delilog.vercel.app
- Vercelプロジェクト: `delilog`
- GitHub: `gtanaka-1018/deli`
- 正本ブランチ: `main`

公開コードは `public/` に置き、`vercel.json` の `outputDirectory` で公開対象を限定する。`data/`、`docs/`、`tests/`、`tools/` は公開しない。

## スマートフォンで使う

スマートフォンのブラウザーで本番URLを開く。ホーム画面へ追加するとPWAとして起動できる。

- iPhone: Safariの共有メニューから「ホーム画面に追加」
- Android: Chromeのメニューから「ホーム画面に追加」または「アプリをインストール」

現在の入力データは端末内に保存される。PCとスマートフォンは別データになるため、端末間移行にはJSONのエクスポート／インポートを使う。

## アクセス状況

Vercel Web Analyticsの読込コードを公開ページに設置している。Vercelダッシュボードの対象プロジェクトでWeb Analyticsを有効化し、再デプロイすると、日時、ページビュー、国、端末種別、OS、ブラウザーなどの詳細をプロジェクト所有者が確認できる。

公開ページ下部には、Web Analyticsを有効化してからの「ページ閲覧」と「推定訪問者」の匿名集計だけを表示する。`/api/traffic` がVercel Web Analytics APIをサーバー側で読み、本番環境のトップページ（`environment = production`、`requestPath = /`）だけに絞って、ブラウザーへ2つの集計値を返す。Preview環境や別パスの閲覧は公開値へ含めない。売上・経費などの入力内容は取得も公開もしない。

「推定訪問者」は実人数ではない。Vercelがリクエストから生成する匿名ハッシュを使い、24時間単位で同一訪問者を推定する。同じ人でも24時間経過後、ネットワーク・ブラウザー・端末などが変わった場合は別の訪問者として数えられる可能性がある。反対に、共有端末などは同一と判定される可能性がある。ログインなしで実人数を厳密に確定することはできないため、画面上も「推定訪問者」と表記する。

公開集計を有効にするには、Vercelプロジェクトへ次を設定して再デプロイする。

- `VERCEL_ANALYTICS_TOKEN`: Web Analyticsを読み取れるVercel Access Token。Sensitiveとして設定する。
- `VERCEL_ANALYTICS_TEAM_ID`: チーム所有プロジェクトの場合のTeam ID。
- `VERCEL_ANALYTICS_PROJECT_ID`: `VERCEL_PROJECT_ID`を自動公開していない場合だけ設定する。

トークンは`public/`へ置かない。未設定時やVercel APIが利用できないとき、公開画面は数値の代わりに「公開集計は準備中です」と表示する。

Web Analyticsは匿名集計であり、氏名やメールアドレスまでは特定できない。「誰が」を確認するには、利用者ごとのログインが必要になる。推奨構成は次のとおり。

1. Supabase AuthのメールOTPまたはマジックリンクで本人確認する。
2. 売上データをユーザーID単位でPostgresへ保存し、Row Level Securityを設定する。
3. Auth Audit Logsでログイン日時、ユーザーID、IPアドレス、端末情報を管理者だけが確認する。
4. 自分のメールアドレスも同じログイン方式へ登録し、スマートフォンとPCで同じデータを使う。

認証導入前にアクセスした人の氏名を、後から正確に復元することはできない。

## 公開ランキング

ランキングは通常の売上・資産データ保存とは分離する。通常の記録は引き続き端末内だけに保存し、ユーザーがランキング画面でログインして「ランキングへの掲載に同意する」をチェックした場合だけ、次の自己申告値をSupabaseへ同期する。

- ランキング表示名
- 現在の純資産合計（資産合計から負債を引いた値）
- 直近30日の日付、配達件数、売上金額

メールアドレス、経費、稼働時間、車両、メモ、資産の内訳はランキングテーブルへ保存しない。チェックを外して保存すると、そのユーザーのランキング用プロフィール、資産、日別売上を削除する。ランキング値は自己申告であり、運営が証明した金額ではない。

### Supabase設定

1. Supabaseプロジェクトを作成し、SQL Editorで [`docs/ranking-schema.sql`](ranking-schema.sql) を実行する。
2. AuthenticationのURL ConfigurationでSite URLを `https://okumeter.com` にし、Redirect URLsへ `https://okumeter.com/?screen=ranking` を追加する。補助URLでもログインさせる場合は `https://delilog.vercel.app/?screen=ranking` も追加する。
3. Vercelへ次の環境変数を設定して再デプロイする。

- `SUPABASE_URL`: SupabaseプロジェクトURL。
- `SUPABASE_PUBLISHABLE_KEY`: ブラウザー利用可能なPublishable key。旧形式を使う場合は `SUPABASE_ANON_KEY` でもよい。

`SUPABASE_SERVICE_ROLE_KEY`、データベース接続文字列、JWT署名秘密鍵はVercelにもブラウザーにも設定しない。ランキング用テーブルはすべてRLSを有効化し、ログインユーザーは自分の行だけを変更できる。公開ランキングはユーザーIDを返さない読み取り専用RPCだけを使用する。

メールのマジックリンク認証にはSupabase Authを使用する。ログインリンクの送信元、メールテンプレート、レート制限は本番公開前にSupabaseダッシュボードで確認する。

参考:

- https://vercel.com/docs/analytics
- https://vercel.com/docs/analytics/privacy-policy
- https://supabase.com/docs/guides/auth
- https://supabase.com/docs/reference/javascript/auth-signinwithotp
- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://supabase.com/docs/guides/auth/audit-logs

## 本番更新

1. 構文チェックとテストを実行する。
2. 変更を `main` へコミットしてGitHubへpushする。
3. Vercelの本番デプロイ完了を確認する。
4. 本番URL、`service-worker.js`、`manifest.webmanifest` がHTTP 200になることを確認する。

CLIから緊急デプロイした場合も、同じ変更をGitHubへpushして差分を残さない。
