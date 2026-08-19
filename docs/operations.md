# 億メーター運用ガイド

更新日: 2026-08-19

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

公開ページ下部には、Web Analyticsを有効化してからの「ページ閲覧」と「訪問者」の匿名集計だけを表示する。`/api/traffic` がVercel Web Analytics APIをサーバー側で読み、ブラウザーへは2つの集計値だけを返す。売上・経費などの入力内容は取得も公開もしない。

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

参考:

- https://vercel.com/docs/analytics
- https://vercel.com/docs/analytics/privacy-policy
- https://supabase.com/docs/guides/auth
- https://supabase.com/docs/guides/auth/audit-logs

## 本番更新

1. 構文チェックとテストを実行する。
2. 変更を `main` へコミットしてGitHubへpushする。
3. Vercelの本番デプロイ完了を確認する。
4. 本番URL、`service-worker.js`、`manifest.webmanifest` がHTTP 200になることを確認する。

CLIから緊急デプロイした場合も、同じ変更をGitHubへpushして差分を残さない。
