# AIHints 仕様メモ（addon-ai-tag ブランチ）

> `AIHints` フィールドのデータ構造、D1 テーブル仕様、Worker エンドポイント、
> および移行スクリプトの設計をまとめた技術メモです。

---

## 1. AIHints フィールドの構造

キャラクターレコード（`data/Works_*/DataBases/db_*.json`）の `AIHints` フィールドは以下の二層構造を持つ。

```json
{
  "AIHints": {
    "common": {
      "base_prompt": "...",
      "negative_prompt": "..."
    },
    "forms": {
      "corefolder": {
        "form_tags": ["..."],
        "outfit_features": ["..."],
        "ai_tags": ["..."],
        "prompt_export": "...",
        "negative_prompt_export": "..."
      },
      "humanoid": {
        "form_tags": ["..."],
        "outfit_features": ["..."],
        "ai_tags": ["..."],
        "prompt_export": "...",
        "negative_prompt_export": "..."
      }
    }
  }
}
```

| キー | 型 | 説明 |
|-----|-----|------|
| `common` | object | 全形態共通のプロンプト・タグ |
| `forms` | object | 形態ごとのプロンプト定義。キーが形態名（例: `corefolder`, `humanoid`） |
| `forms.*.form_tags` | string[] | 形態を区別するタグ群 |
| `forms.*.outfit_features` | string[] | 衣装・外見の特徴 |
| `forms.*.ai_tags` | string[] | 画像生成 AI へのプロンプトタグ |
| `forms.*.prompt_export` | string | 生成 AI へ渡すプロンプト文字列（展開済み） |
| `forms.*.negative_prompt_export` | string | ネガティブプロンプト文字列 |

---

## 2. D1 aihints テーブル

### スキーマ

```sql
CREATE TABLE IF NOT EXISTS aihints (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  work_key    TEXT    NOT NULL,               -- 例: #Works_NumberTales
  db_name     TEXT    NOT NULL,               -- 例: Primary
  idx_key     TEXT    NOT NULL DEFAULT 'Num', -- インデックスキー
  idx_value   TEXT    NOT NULL,               -- インデックス値 (例: 1, 15)
  forms       TEXT,                           -- 利用可能な形態名のカンマ区切り
  common_json TEXT,                           -- AIHints.common の JSON
  forms_json  TEXT,                           -- AIHints.forms  の JSON
  data_json   TEXT    NOT NULL                -- AIHints オブジェクト全体の JSON
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_aihints_lookup
  ON aihints (work_key, db_name, idx_key, idx_value);

CREATE INDEX IF NOT EXISTS idx_aihints_list
  ON aihints (work_key, db_name);
```

スキーマファイル: `pkg/cloudflare/schema/d1-aihints.sql`

### カラム設計の意図

| カラム | 設計意図 |
|-------|---------|
| `forms` | カンマ区切り文字列。利用可能な形態を D1 クエリ結果だけで把握できるようにする |
| `common_json` | `forms_json` と分離することで、`common` のみを軽量取得できる |
| `forms_json` | 形態ごとの詳細データを一括取得できる |
| `data_json` | `AIHints` 全体。Cloud Run 等が完全なデータを一発で取得できるようにする |
| UNIQUE INDEX | `INSERT OR REPLACE` によるupsert を有効にするために必須 |

---

## 3. Worker エンドポイント

`pkg/cloudflare/worker.js` に実装済み（addon-ai-tag ブランチ）。

ベース URL: `https://database.numbertales-radiann.net/api/ai/`

> **addon-ai-tag ブランチのルーティングについて**:
> `develop` ブランチの公開 Worker は `/api/v1/*`（閲覧者向け）。
> `addon-ai-tag` の AI Worker は `/api/ai/*`（サークル関係者向け）。
> AIHints エンドポイント（`/aihints`）は Bearer トークン認証が必要。

### 3-0. 認証

AIHints エンドポイントへのリクエストには `Authorization` ヘッダーが必要。

```
Authorization: Bearer <AI_ACCESS_TOKEN>
```

| 認証結果 | レスポンス |
|---------|----------|
| トークン一致 | 200（通常レスポンス） |
| トークン不一致・ヘッダーなし | 401 `{"error":"Unauthorized","status":401}` |
| `AI_ACCESS_TOKEN` 未設定（ローカル開発） | 認証バイパス（全リクエスト通過） |

トークンは Cloudflare Secret で管理: `npx wrangler secret put AI_ACCESS_TOKEN`

### 3-1. AIHints 一覧取得

```
GET /api/ai/:work/:db/aihints
```

| パラメータ | 説明 |
|----------|------|
| `:work` | 作品キー（大文字小文字不問, 例: `works_numbertales`） |
| `:db` | DB 名（例: `primary`） |

レスポンス例:

```json
[
  {
    "work_key": "#Works_NumberTales",
    "db_name": "Primary",
    "idx_key": "Num",
    "idx_value": "1",
    "forms": "corefolder,humanoid",
    "common_json": "{...}",
    "forms_json": "{...}",
    "data_json": "{...}"
  }
]
```

### 3-2. 1 件取得

```
GET /api/ai/:work/:db/aihints/:idx
```

| パラメータ | 説明 |
|----------|------|
| `:idx` | インデックス値（例: `1`, `15`） |
| `?form=<form>` | 任意。指定した形態の `forms_json` のみを `form_data` キーで付加して返す |

レスポンス例（`?form=humanoid`）:

```json
{
  "work_key": "#Works_NumberTales",
  "db_name": "Primary",
  "idx_key": "Num",
  "idx_value": "1",
  "forms": "corefolder,humanoid",
  "common_json": "{...}",
  "forms_json": "{...}",
  "data_json": "{...}",
  "form_data": {
    "form_tags": ["..."],
    "ai_tags": ["..."],
    "prompt_export": "..."
  }
}
```

`?form` が指定されていない場合は `form_data` キーなしで返す。
指定した形態が存在しない場合も `form_data` キーなし（エラーにしない）。

---

## 4. 移行スクリプト（migrate-aihints.mjs）

`pkg/cloudflare/scripts/migrate-aihints.mjs`

### コマンドオプション

| オプション | 説明 |
|----------|------|
| `--repo-root <path>` | リポジトリルート（省略時は自動解決） |
| `--dry-run` | 実際の投入はせず処理内容だけ表示 |
| `--clean` | 投入前に `DELETE FROM aihints` を実行（全件再投入。CI / 再投入推奨） |
| `--db-id <uuid>` | D1 DB ID（省略時: `b8bf7187-1966-4831-88d2-2b8906cfa745`） |

### 動作仕様

1. `data/db_meta.json` → `CreationWorks` から作品一覧を取得
2. 各作品の `DataBases/db_meta.json` → DB 一覧を取得（`DB_Hidden=true` をスキップ）
3. `db_type.json` → `$IndexDef` からインデックスキーを解決
4. `db_*.json` を読み込み、`AIHints` フィールドを持つレコードのみ抽出
5. 10件ずつ SQL ファイルに書き出し、`wrangler d1 execute --remote --yes` で投入
   - 1レコード1 INSERT 文方式（D1 の 100KB/statement 制限を回避）
   - `INSERT OR REPLACE` + UNIQUE INDEX によりupsert として動作

### バッチサイズの制約

D1 は 1 SQL 文あたり最大約 100KB の制限がある。AIHints の `data_json` は 1 レコードあたり最大
数十KB になり得るため、multi-VALUES INSERT は `SQLITE_TOOBIG` エラーになる。
スクリプトは 1 レコード 1 INSERT 文 × 10 件/ファイルで分割投入する（`D1_BATCH_SIZE = 10`）。

---

## 5. GitHub Actions での自動同期

`.github/workflows/cf-api-sync.yml` の `sync-r2-d1` ジョブが
`develop` OR `addon-ai-tag` への `data/**` 変更 push 時に以下を自動実行する:

1. **D1 スキーマ適用**（idempotent）
   - `d1-init.sql`（基本テーブル）
   - `d1-aihints.sql`（AIHints テーブル）
2. **R2 + D1 データ同期**（`migrate.mjs --clean`）
3. **AIHints D1 同期**（`migrate-aihints.mjs --clean`）

---

## 6. Cloud Run との連携（ADR-0002 / 将来予定）

画像生成バックエンド（Cloud Run: `numbertales-imagegen`）は `aihints` エンドポイントを参照して
`AIHints.forms.*.prompt_export` / `negative_prompt_export` を取得し、画像生成ジョブを実行する予定。

```
Cloud Run POST /generate
  → GET /api/ai/:work/:db/aihints/:idx?form=<form>
  → Stable Diffusion / SDXL へプロンプト送信
  → 生成画像を R2 / GCS へ保存
```

設計詳細: `_work_in_progress/2026-06-21_progress_cloudflare-api-adr2-gcloud.md`

---

## 参考

| 対象 | 参照先 |
|------|--------|
| aihints テーブルスキーマ | `pkg/cloudflare/schema/d1-aihints.sql` |
| 移行スクリプト | `pkg/cloudflare/scripts/migrate-aihints.mjs` |
| Worker 実装 | `pkg/cloudflare/worker.js`（`getAihintsFromD1` / `getAihintFromD1`） |
| 基本 API 仕様 | `docs/api-sw-spec.md` §0 |
| デプロイ手順 | `docs/deploy-howto.md` §7 |
