# 億メーター運用ガイド

更新日: 2026-09-10

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

入力データは既定では端末内に保存される。設定画面の「クラウド同期・バックアップ」からログインし、同期を有効にすると、スマートフォンとPCで同じ内容を使える。同期を使わない場合の端末間移行には、これまで通りJSONのエクスポート／インポートを使う。

## データの保全

「整備」画面から車両ごとの整備日・積算走行距離・整備内容・メモを記録できる。整備履歴は売上・経費を変更しない。保存・互換性・ロールバックは [車両ごとの整備履歴](maintenance.md) を参照。

振込は入力画面で振込日を選び、「振込を追加」からプラットフォーム・金額・メモを入力して「記録を保存」する。集計画面の日・週・月・年に振込合計とプラットフォーム別の内訳が表示される。既存の取り込み済み振込は「未分類」として引き継ぐ。データ形式と旧版へ戻す際の注意点は [振込金額の記録と集計](payouts.md) を参照。

記録の消失を防ぐため、次の3層で守る。上ほど自動、下ほど確実。

1. **端末内の控えと復元ポイント**（`public/backup-vault.js`）
   保存のたびに IndexedDB へ同じ内容の控えを書き、起動時にも取り直す。`localStorage` が壊れた・消えた場合は控えから自動復元し、読めなかった生データは退避してから復元する。復元できないときは自動保存を止め、壊れた内容を上書きしない。
   加えて、ファイル読み込み・全削除・復元の直前と1日1回、最大12世代の復元ポイントを残す。設定画面から任意の世代へ戻せる。
   これは同一ブラウザー内の保険であり、サイトデータの一括削除や機種変更では一緒に消える。

2. **ファイル保存**（設定画面）
   `records` / `targets` / `providers` / `vehicles` / `maintenance` / `taxProfiles` / `assets` と `schemaVersion` を含むJSONを書き出す。`assets`（純資産の内訳）は2026-09より前の書き出しには含まれないため、古いファイルを読み込んでも資産は端末内の値を保つ。`maintenance` のない旧ファイルでは、現在の整備履歴と必要な車両を保持する。

3. **クラウド同期**（設定画面・任意）
   後述のスナップショット同期。機種変更やサイトデータ削除に耐える唯一の層。

端末を手放すときは、設定画面の「この端末からデータを完全に削除」で記録・控え・復元ポイントをまとめて消す。ログアウトだけでは端末内の記録は消えない。

## クラウド同期

既定では停止している。ログインして同期を有効にした端末だけが、記録をSupabaseへ保存する。未ログインの利用者はSupabase SDKも `/api/ranking-config` も読み込まない。

- 端末内の `localStorage` が引き続き正本で、保存操作の成否は端末内保存だけで決まる。オフラインでも入力・保存・集計はこれまでと変わらない。
- クラウドへは全量スナップショットを gzip 圧縮して送る。実データ（2,210日分・約1.19MB）で圧縮後およそ88KB。
- 端末間の食い違いはサーバー採番の `revision` で検出する。自動マージも自動上書きもせず、どちらを残すかを利用者に選ばせる。選ばれなかった側は必ず履歴へ退避する。
- 履歴は世代として保持し、設定画面から任意の世代へ戻せる。
- 共有端末対策として、前の利用者の記録が残ったまま別のアカウントでログインした場合は、この端末の内容をクラウドへ送る操作を提供しない。取り込みか、同期の停止だけを選べる。

### Supabase設定

1. SQL Editorで [`docs/sync-schema.sql`](sync-schema.sql) を実行する。ランキング用スキーマとは別に、機微データ用の `app_private` スキーマを作る。スクリプトは冪等なので、失敗しても最初から流し直せる。
2. `app_private` は PostgREST の Exposed schemas に**含めない**。読み書きは `public` に置いた security invoker のRPCだけを通す。
3. AuthenticationのRedirect URLsへ `https://okumeter.com/?screen=settings` を追加する。
4. 環境変数はランキングと共用（`SUPABASE_URL`、`SUPABASE_PUBLISHABLE_KEY`）。追加設定は不要。

`docs/sync-schema.sql` は `tests/sync-schema.test.js` が実際のPostgreSQL（WASM版のPGlite）へ適用して検証する。スキーマを変更したら `node --test tests\sync-schema.test.js` を実行し、権限・競合検出・行レベルの分離が壊れていないことを確かめてから本番へ流す。

Supabase JavaScript SDKは `public/vendor/supabase-js-<版数>.js` として同梱している。第三者CDNへ実行時に依存せず、オフラインでも動く。更新するときはファイルを差し替え、`public/supabase-client.js` の `SDK_URL` と `tests/ranking.spec.js` の差し替え対象を合わせる。

## 表示テーマ

2026-09-10に、記録・収益・整備画面をカード中心の構成へ更新した。ライトは淡い下地、ダークは濃紺の下地を使い、操作色の青を共通にする。「億り人を目指す配達員を応援する」を表示方針とし、売上と実際の純資産は引き続き別々に管理する。

2026-09-06のUI更新で、初回も説明ダイアログを挟まず記録画面を開くようにした。「今日を記録」で当日の入力へ移動でき、別日に未保存の入力がある場合は破棄確認を行う。日次の補助指標は「詳しい内訳」から開く。ホーム画面への追加・保存方法は設定画面から参照できる。

スマートフォンは下部、PCの広い画面は左側にナビゲーションを配置する。「税金」は従来の確定申告・納税見込み画面。共有ボタンは全画面共通の右上に置き、共有内容と流入元パラメーターは従来通りとする。

配色は `public/theme.css` のトークンだけで決まる。`styles.css` と `x-theme.css` は形と間隔を担当し、色は `var(--token)` で参照する（色リテラルを直接書かない）。

- 既定は端末（OS）の設定に追従する。設定画面から「ライト」「ダーク」を選ぶと `deli-theme-v1` に保存し、OSの設定より優先する。
- ダークは黒地（`#000000`）にカード面 `#16181c`、操作色はXの青 `#1d9bf0`。売上や資産の増減を示す緑・橙・赤は意味を持つ色として別に保つ。
- 文字と背景のコントラストはライト・ダークの両方でWCAG AAを満たすことを確認している。色を変更するときは両テーマで測り直す。

## アクセス状況

Vercel Web Analyticsの読込コードを公開ページに設置している。Vercelダッシュボードの対象プロジェクトでWeb Analyticsを有効化し、再デプロイすると、日時、ページビュー、国、端末種別、OS、ブラウザーなどの詳細をプロジェクト所有者が確認できる。

公開ページ下部には、Web Analyticsを有効化してからの「ページ閲覧」と「推定訪問者」の匿名集計だけを表示する。`/api/traffic` がVercel Web Analytics APIをサーバー側で読み、本番環境のトップページと後述する3つの流入分析用パスだけに絞って、ブラウザーへ2つの集計値を返す。Preview環境やそれ以外のパスの閲覧は公開値へ含めない。売上・経費などの入力内容は取得も公開もしない。

XとInstagramからの流入を分けて確認するときは、次の共有URLを使用する。アプリ内の「億メーターを共有」ボタンは共有元を自動付与する。

- X: `https://okumeter.com/?utm_source=x&utm_medium=social`
- Instagram: `https://okumeter.com/?utm_source=instagram&utm_medium=social`
- アプリ内共有: `https://okumeter.com/?utm_source=share&utm_medium=referral`

`public/referral.js` は `utm_source` を優先し、パラメーターがない場合は `t.co`、`x.com`、`twitter.com`、`instagram.com` の参照元から流入元を補完する。該当する初回ページビューだけを、Vercel Web Analytics上で `/referral/x`、`/referral/instagram`、`/referral/share` のいずれかとして匿名集計する。Vercelのプロジェクト画面で Analytics → Pages を開くと流入元を分けて確認できる。参照元を送らないアプリ内ブラウザーもあるため、SNSへ掲載するリンクには上記の `utm_source` を付ける。

公開ページ下部の合計値には、`/` に加えてこの3つの分析用パスも含める。分析用URLからクエリ文字列は除去し、売上・経費などの入力内容は送信しない。

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

## 検索エンジンへの公開

- `public/robots.txt` で公開ページのクロールを許可し、`https://okumeter.com/sitemap.xml` を案内する。
- `public/sitemap.xml` には検索結果へ出すcanonical URLだけを記載する。トップページを実質的に更新した日は `lastmod` も更新する。
- トップページにはcanonical、検索・SNS用メタ情報、WebSite／SoftwareApplication構造化データを置く。
- IndexNowの所有確認キーは `public/e3b6f2c8a1d94f70b54e8c7a29016d43.txt`。公開内容を更新したときだけ本番URLをIndexNowへ通知する。
- GoogleについてはGoogle Search Consoleで `okumeter.com` の所有権を確認し、`https://okumeter.com/sitemap.xml` を一度送信する。アカウントでの所有権確認が必要なため、コードのデプロイだけでは完了しない。

サイトマップやIndexNowはクロールの発見を助ける仕組みであり、掲載順位や即時のインデックス登録を保証しない。Search ConsoleのURL検査とページのインデックス登録状況を確認する。

参考:

- https://developers.google.com/search/docs/fundamentals/get-started-developers
- https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap
- https://www.indexnow.org/documentation

## 公開ランキング

ランキングは通常の売上・資産データ保存とは分離する。通常の記録は引き続き端末内だけに保存し、ユーザーがランキング画面でログインして「ランキングへの掲載に同意する」をチェックした場合だけ、次の自己申告値をSupabaseへ同期する。

- ランキング表示名
- 現在の純資産合計（資産合計から負債を引いた値）
- 直近30日の日付、配達件数、売上金額

メールアドレス、経費、稼働時間、車両、メモ、資産の内訳はランキングテーブルへ保存しない。チェックを外して保存するか、参加中に「自分のランキングデータを削除」を実行すると、そのユーザーのランキング用プロフィール、資産、日別売上を削除する。削除前には確認を表示し、端末内の配達記録とSupabase Authのログインアカウントは残す。ランキング値は自己申告であり、運営が証明した金額ではない。

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
