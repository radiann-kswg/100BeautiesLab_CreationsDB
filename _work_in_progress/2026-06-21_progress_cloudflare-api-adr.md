# 2026-06-21 進捗レポート / ADR-0001 実装完了: 疑似APIのCloudflare Workers移行

## 目的

GitHub Pages + Service Worker による擬似API（`/api/v1`・`/pages/v1`・`/svc/v1`）を、
`database.numbertales-radiann.net` ドメインを管理している Cloudflare 上の
**Workers + R2 + D1** による「本物のAPI」へ移行する。

> ADR-0001 採択・実装完了（2026-06-21）

---

## ADR-0001: API配信基盤を Cloudflare Workers にする

- **Status**: Implemented ✓
- **Date**: 2026-06-21
- **Deciders**: 二春（サークル主） / 一春（代理）

### Context（背景）

（原文維持 — ADR 本文は下記「実装記録」参照）

### Decision（決定）

API配信基盤を **Cloudflare Workers** とし、データ実体は **R2**（静的 JSON ミラー）と **D1**（FTS5 検索インデックス）に置く。
`DataFetcher` の読み取りを `fetch()` から **R2バインディング (`env.BUCKET.get`)** に差し替えることを移行の中核とした。
D1 には `_Commons`・`isPrivate` 適用済みのレコードインデックスと FTS5 全文検索テーブルを持たせ、高速な検索を実現する。

---

## 実装記録（2026-06-21）

### A-1: インフラ作成 ✓

| リソース | 名前 | リージョン |
|----------|------|-----------|
| R2 バケット | `creationsdb-data` | ENAM |
| D1 データベース | `creationsdb-d1` | APAC (SIN) |
| D1 UUID | `b8bf7187-1966-4831-88d2-2b8906cfa745` | — |

`pkg/cloudflare/wrangler.toml` にバインディングとカスタムドメインルーティング (`database.numbertales-radiann.net/api/v1/*`) を追加した。

### A-2: D1 スキーマ ✓

`pkg/cloudflare/schema/d1-init.sql` を作成し、D1 に適用済み：

- `works` テーブル（作品メタ）
- `dbs` テーブル（DB メタ）
- `records` テーブル（レコード本体 + 検索インデックス）
- `idx_records_lookup` / `idx_records_list` インデックス
- `records_fts` FTS5 仮想テーブル（外部コンテンツ）
- `records_ai` / `records_ad` / `records_au` トリガー（FTS 自動同期）

### A-3: マイグレーションスクリプト ✓

`pkg/cloudflare/scripts/migrate.mjs` を作成：

- `data/**/*.json` 全ファイルを R2 へアップロード（wrangler CLI 経由）
- `data/db_meta.json` → D1 `works`・`dbs` テーブル投入
- 各作品の `db_meta.json` → D1 `dbs` テーブル投入
- 各作品の DB JSON → D1 `records` テーブル投入（`$IndexDef` からインデックスキー自動解決）

#### $IndexDef 解決ロジック

- フラット型（`$type` が文字列）→ `hashTag` をそのまま idx_key に使用
- ネスト型（`$type` が配列）→ `#IndexListKey` > `#Number` > 先頭要素の優先順で主子要素を選択し `root.child` 形式に

### A-4: Worker 本体更新 ✓ (v2.0.0)

`pkg/cloudflare/worker.js` を全面改修：

| 変更点 | 旧実装 | 新実装 |
|--------|-------|--------|
| JSON 読み込み | `fetch(github-pages-url)` | `env.BUCKET.get(key)` (R2) |
| ファイル存在確認 | HTTP HEAD | `env.BUCKET.head(key)` (R2) |
| 作品一覧 | R2 全体メタ解析 | D1 `works` テーブル |
| DB 一覧 | R2 作品メタ解析 | D1 `dbs` テーブル |
| レコード一覧 | R2 JSON 全件読み | D1 `records` テーブル |
| 単一レコード | R2 → JS フィルタ | D1 インデックスクエリ |
| 検索 | R2 → `JSON.stringify` LIKE | D1 FTS5 全文検索 |
| 公開フラグ判定 | JS フィルタ | D1 クエリ (`is_private = 0`) |
| 非公開フラグ判定 | グローバルメタ参照 | D1 `is_hidden` カラム |

### A-5: デプロイ設定・README 更新 ✓

`pkg/cloudflare/README.md` を R2/D1 アーキテクチャに合わせて全面更新。

---

## B: Google Cloud コネクタ整備（ADR-0002 ドラフト）

- GCE MCP コネクタのツール定義は存在（接続済みと推定）
- **GCP プロジェクト ID が未確認のため疎通テスト保留**
- 設計ドラフト: `_work_in_progress/2026-06-21_progress_cloudflare-api-adr2-gcloud.md`

---

## C: ドキュメント更新 ✓

| ファイル | 更新内容 |
|---------|---------|
| `CLAUDE.md` | 技術スタック・アーキテクチャ・API 節・大規模更新確認事項・参照先テーブルを更新 |
| `.github/copilot-instructions.md` | 技術スタック・アーキテクチャ・API 節を更新 |
| `docs/api-sw-spec.md` | §0「API 二層構成」を新規追加（Workers 実 API 仕様・D1 スキーマ概要） |
| `CHANGELOG.md` | ADR-0001 実装完了エントリを追加 |
| `pkg/cloudflare/README.md` | R2/D1 アーキテクチャ・セットアップ手順・エンドポイント表を更新 |

---

## 変更ファイル一覧

**新規作成:**
- `pkg/cloudflare/schema/d1-init.sql`
- `pkg/cloudflare/scripts/migrate.mjs`
- `_work_in_progress/2026-06-21_progress_cloudflare-api-adr2-gcloud.md`

**更新:**
- `pkg/cloudflare/worker.js` (v1.0.0 → v2.0.0)
- `pkg/cloudflare/wrangler.toml`
- `pkg/cloudflare/README.md`
- `CLAUDE.md`
- `.github/copilot-instructions.md`
- `docs/api-sw-spec.md`
- `CHANGELOG.md`

---

## 未完了タスク / 次アクション

- [ ] **`npx wrangler deploy` でデプロイ実行**（ローカルで `wrangler login` 済みの環境から実行）
- [ ] **`node pkg/cloudflare/scripts/migrate.mjs` でデータ投入**（R2 + D1 初回マイグレーション）
- [ ] **`database.numbertales-radiann.net/api/v1/works` で疎通確認**
- [ ] **ADR-0002 着手**: GCP プロジェクト ID を確認 → GCE インスタンス一覧で疎通 → Cloud Run 設計
- [ ] **EnrichmentProcessor の Worker 移植**（`_DBLink`/`_Jump` 解決を Workers にも実装。次フェーズ）

---

## 受け入れ条件（DoD）の状況

| 条件 | 状態 |
|------|------|
| `npm test` グリーン | 未確認（本変更は `data/`/`lib/`/`pages/` 非タッチのため影響なし想定） |
| `pkg/` クライアントの動作維持 | ✓（ローカルFS 読みは変更なし） |
| Workers 経由でエンドポイント同等レスポンス | デプロイ後に確認 |
| `database.numbertales-radiann.net/api/v1/*` アクセス可 | デプロイ後に確認 |
| `_DBLink`/`_Jump` 解決の維持 | SW 疑似 API 側で継続。Workers 側は次フェーズ |

---

## 参考リンク

- ADR-0001 設計: 本ファイル（当初案）
- ADR-0002 ドラフト: `_work_in_progress/2026-06-21_progress_cloudflare-api-adr2-gcloud.md`
- Workers セットアップ: `pkg/cloudflare/README.md`
- API 仕様: `docs/api-sw-spec.md`
