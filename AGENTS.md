# デリログ リポジトリ運用ルール

## 対象範囲

このファイルはリポジトリ全体に適用する。

## 構成

- `public/`: Vercelで公開する静的Webアプリ。公開URL直下へ配信される。
- `tests/`: Node.js単体テストとPlaywrightブラウザテスト。
- `tools/`: データ変換など、公開しない開発補助コード。
- `docs/`: 運用、設計、ロードマップなどの説明資料。
- `data/`: 個人の売上・経費データとバックアップ。GitやVercelへ含めない。
- ルート: `vercel.json`、ignoreファイル、`AGENTS.md` などのリポジトリ設定だけを置く。

## 重要な制約

- `data/` の実データ、メールアドレス、認証情報、トークン、アクセスログをコミットしない。
- ブラウザーへ配信される `public/` に秘密情報を置かない。
- アプリはVercelで利用する。ローカル起動専用のバッチやサーバーを追加しない。
- 現在の入力データはブラウザーの `localStorage` に端末別保存される。クラウド同期済みと誤解させる表示や説明を追加しない。
- 認証やクラウド保存を追加するときは、ユーザー単位の認可と行レベルのアクセス制御を必須とする。
- 税額は概算である。法令や税率を変更するときは、対象年と一次情報を確認し、根拠を `docs/` に残す。
- ユーザーの既存変更を保持し、無関係なファイルを復元・削除しない。

## 変更時の確認

最低限、次を実行する。

```powershell
Get-ChildItem public -Filter *.js | ForEach-Object { node --check $_.FullName }
node --test tests\tax-calculator.test.js
```

画面を変更した場合は、可能ならPlaywrightテストも実行する。Service Workerの配信内容を変更した場合は `public/service-worker.js` のキャッシュ名を更新する。

## デプロイ

- GitHubの `main` をコードの正本とし、Vercelプロジェクト `delilog` と同じ内容に保つ。
- 本番URLは `https://delilog.vercel.app`。
- 本番反映はテスト後に行い、トップページ、主要アセット、PWAファイルのHTTP 200を確認する。
- 認証・課金・データ移行を伴う変更は、互換性とロールバック方法を先に文書化する。
