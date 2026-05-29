# 進捗レポート: AIHints フィールド追加 — NumberTales #1〜#40

**日付**: 2026-05-15
**対象**: `data/Works_NumberTales/DataBases/db_Primary.json`

---

## 目的

AI 画像生成補助用の `AIHints` フィールドを NumberTales 一次創作キャラクター DB の #1〜#40 に追加する。

---

## 変更点の要約

### スキーマ追加（前セッション完了）

- `data/db_type.json` の `$DefType` に `AIHints` の型定義を追加
- 構造: `ai_tags`, `silhouette_features`, `immutable_traits`, `negative_visuals`, `expression_tendency`, `age_appearance`, `palette_priority`（`motif_rendering`/`distinguish_from` は将来拡張用として予約）

### データ追加

| 範囲                | 件数 | 状態                    |
| ------------------- | ---- | ----------------------- |
| #1〜#20             | 20件 | ✅ 完了（前セッション） |
| #21〜#40（#38除く） | 19件 | ✅ 完了（本セッション） |
| 合計                | 39件 | ✅ 全完了               |

> ※ #38（サタハ）は `"Progress": "notProceeded"` のため AIHints 追加をスキップ

---

## 影響範囲（編集ファイル）

- `data/db_type.json`（前セッション: AIHints スキーマ追加）
- `data/Works_NumberTales/DataBases/db_Primary.json`（本セッション: #21〜#40 の AIHints 追加、#37 のみ再試行で補完）

---

## 実装上の注意点

- **#22 フジ**: 尾はサソリ型（スコーピオン型）2本・各11節。通常の fox tail とは異なるため `negative_visuals` に「NO regular fox tails」を記載
- **#30 ツノ / #40 ヨソ**: 通常型の尾（枝分かれなし）。`silhouette_features` に「NOT branching type」と明記
- **#39 サク**: NumberTales 中で珍しい男性個体。`ai_tags` に「fox BOY (male character)」と明記
- **#37 サナ**: バッチ2での一括置換で1件失敗（原因不明）。個別に `replace_string_in_file` を再実行して補完

---

## 検証

- `npm test`（`data.sanity.test.js`）: ✅ 3/3 パス（JSON 構文エラーなし）
- `grep_search "AIHints"`: **39件**（期待値 39件）一致確認

---

## 未完了タスク

- ⬜ #41〜#60 の AIHints 追加（次セッション以降）
- ⬜ 完了後のログを `.completed/` に退避（ユーザー依頼時）

---

## 参考

- AIHints スキーマ: `data/db_type.json` → `$DefType.$Def_AIHints`
- 対象 DB: `data/Works_NumberTales/DataBases/db_Primary.json`
