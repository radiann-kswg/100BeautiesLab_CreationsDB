-- d1-aihints.sql — AIHints 専用テーブルスキーマ
-- 既存の creationsdb-d1 に追加適用する。
-- 実行: npx wrangler d1 execute creationsdb-d1 --file="pkg/cloudflare/schema/d1-aihints.sql" --remote --yes

-- ─────────────────────────────────────────────────────────────────────────────
-- aihints テーブル
--   キャラクターレコードの AIHints フィールドを専用テーブルに正規化して格納する。
--   common / forms を JSON カラムに展開することで、
--   画像生成バックエンド（Cloud Run）や外部クライアントが
--   軽量に AI ヒントだけを取得できる。
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS aihints (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  work_key    TEXT    NOT NULL,               -- 例: Works_NumberTales
  db_name     TEXT    NOT NULL,               -- 例: Primary
  idx_key     TEXT    NOT NULL DEFAULT 'Num', -- インデックスキー (records テーブルと同一)
  idx_value   TEXT    NOT NULL,               -- インデックス値   例: 1, 15
  forms       TEXT,                           -- 利用可能な形態名をカンマ区切り 例: corefolder,humanoid
  common_json TEXT,                           -- AIHints.common の JSON
  forms_json  TEXT,                           -- AIHints.forms  の JSON
  data_json   TEXT    NOT NULL                -- AIHints オブジェクト全体の JSON
);

-- キャラクター単位の高速検索用インデックス
CREATE UNIQUE INDEX IF NOT EXISTS idx_aihints_lookup
  ON aihints (work_key, db_name, idx_key, idx_value);

-- 作品/DB 一覧取得用インデックス
CREATE INDEX IF NOT EXISTS idx_aihints_list
  ON aihints (work_key, db_name);
