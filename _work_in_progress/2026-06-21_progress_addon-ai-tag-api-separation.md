# addon-ai-tag: API エンドポイント分離・AIHints Bearer 認証実装

## 目的

`develop` ブランチのデプロイ完了（ADR-0001）を受けて、`addon-ai-tag` ブランチで AIHints 込みの Worker を別エンドポイントとして分離・独立稼働させる。

- `develop` → `creationsdb-api`（公開、閲覧者向け、`/api/v1/*`）
- `addon-ai-tag` → `creationsdb-api-ai`（サークル関係者向け、`/api/ai/*`、AIHints エンドポイントに Bearer 認証）

## 変更点の要約

### `pkg/cloudflare/wrangler.toml`

- `name`: `creationsdb-api` → `creationsdb-api-ai`
- `routes[0].pattern`: `database.numbertales-radiann.net/api/v1/*` → `database.numbertales-radiann.net/api/ai/*`

### `pkg/cloudflare/worker.js`

- パスプレフィックス正規表現: `/^\/api\/v1(\/.*)?$/` → `/^\/api\/ai(\/.*)?$/`
- `checkAiAuth(request, env)` 関数を新設。AIHints エンドポイント (`/:work/:db/aihints` / `/:work/:db/aihints/:idx`) の先頭で呼び出し、`AI_ACCESS_TOKEN` と一致しない場合は 401 を返す
- `AI_ACCESS_TOKEN` 未設定時（`wrangler dev` 等）はバイパス
- `errorResponse()` に `extraHeaders` オプション引数を追加（401 で `WWW-Authenticate` を返すため）
- ファイルヘッダーコメントを `/api/ai/` に更新、認証仕様を追記

### `docs/aihints-spec.md`

- §3-0「認証」セクションを新設（Bearer トークン仕様・401 レスポンス・secret 設定コマンド）
- 全エンドポイント URL を `/api/v1/` → `/api/ai/` に更新
- Cloud Run 連携のサンプル URL も更新

### `docs/api-sw-spec.md`

- §0 API 三層構成表を更新（公開実 API `/api/v1/` / AI 実 API `/api/ai/` / 疑似 API）
- AIHints エンドポイント行の URL を `/api/ai/` に修正、Bearer 認証注記を追加
- `/api/ai/` に関する補足説明を追記

### `docs/deploy-howto.md`

- §1 疎通確認: ブランチ別 Worker の URL を明示（`/api/v1/works` vs `/api/ai/works`）
- GitHub Secrets 表に addon-ai-tag 向け補足（`AI_ACCESS_TOKEN` は Cloudflare Secret）を追記
- cf-api-sync.yml の対象ブランチ説明を `develop / addon-ai-tag` に更新
- §7-3 を AIHints Secret 設定手順に改稿、§7-4 に疎通確認 URL（`/api/ai/`）を追加

### `pkg/cloudflare/README.md`

- 冒頭にブランチ別 Worker の対応関係を補足
- Worker 名・全エンドポイント URL・使用例を `creationsdb-api-ai` / `/api/ai/` に統一更新
- バインディング表に `AI_ACCESS_TOKEN` Secret を追記
- AIHints エンドポイント行（Bearer 列付き）を追加
- セキュリティ欄に AIHints 認証仕様を追記
- ファイル構成に `d1-aihints.sql` / `migrate-aihints.mjs` を追記
- セットアップ §4 に `AI_ACCESS_TOKEN` Secret 設定手順を追加（旧 §4 は §5 に繰り下げ）

### `CHANGELOG.md`

- 上記変更の要約エントリを追加

## 影響範囲（編集ファイル）

| ファイル | 種別 |
|---------|------|
| `pkg/cloudflare/wrangler.toml` | 設定変更 |
| `pkg/cloudflare/worker.js` | コード変更 |
| `pkg/cloudflare/README.md` | ドキュメント更新 |
| `docs/aihints-spec.md` | ドキュメント更新 |
| `docs/api-sw-spec.md` | ドキュメント更新 |
| `docs/deploy-howto.md` | ドキュメント更新 |
| `CHANGELOG.md` | 変更履歴追記 |

## 未完了タスク

- なし（このセッションで全対応完了）

## 合意事項（ルール）

- `develop` → `addon-ai-tag` の一方向マージのみ行い、逆マージは行わない
- AIHints 関連コード・スキーマ・エンドポイントは `addon-ai-tag` ブランチで管理する（`develop` には含めない）
- Worker のパスプレフィックス: `develop` = `/api/v1/*`、`addon-ai-tag` = `/api/ai/*`
- `AI_ACCESS_TOKEN` は Cloudflare Secret で管理し、GitHub Secret には含めない

## 検証（確認観点）

- [x] `wrangler deploy` 成功（Version ID: `8d06ae94`、route `database.numbertales-radiann.net/api/ai/*`）
- [x] Bearer トークンなし → 401 `{"error":"Unauthorized","status":401}` を確認（ローカルテスト）
- [x] Bearer トークンあり → 200 で AIHints データを取得確認（ローカルテスト）
- [ ] 本番環境での疎通確認（実運用トークン設定後に実施）

## 参考リンク

- ADR-0001 実装記録: `_work_in_progress/2026-06-21_progress_cloudflare-api-adr.md`
- AIHints 仕様: `docs/aihints-spec.md`
- API 三層構成: `docs/api-sw-spec.md` §0
- デプロイ手順: `docs/deploy-howto.md`
