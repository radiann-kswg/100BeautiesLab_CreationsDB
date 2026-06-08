# AIHints ハーネス汚染除去 (2026-06-08)

## 目的

15(トウゴ)固有のハーネス（安全装置）設定が `patch-aihints.mjs` の structural default として
全キャラに誤って伝播していた問題を修正する。

## 背景・問題

- `15(トウゴ)` はコアフォルダ形態で背中に**安全装置（ハーネス）**を装着するという固有設定を持つ。
- `patch-aihints.mjs --upgrade-schema` 実装時に以下がstructural default として誤って登録された：
  - `COREFOLDER_DEFAULT_SILHOUETTE_NOTES` に `"core body suspended in place by a belt-like safety device harness"`
  - `COREFOLDER_DEFAULT_IMMUTABLE_CONSTRAINTS` に `"head must remain attached and protruding from the core body via the safety harness"`
  - `buildNegativeVisuals` の humanoid ブランチに `negatives.push('safety device harness')`
- その結果、`--upgrade-schema` 実行済みの全キャラ（99体中AIHints付与済みのもの）に
  ハーネス関連記述が混入していた。

## 変更点の要約

### 1. `data/Works_NumberTales/DataBases/db_Primary.json`

スクリプト (`.cache/fix-harness-contamination.mjs`) により以下を除去：

| 対象フィールド | 操作 | 件数 |
|---|---|---|
| `forms.corefolder.silhouette_notes` | `"...safety device harness..."` 行を削除 | 89 行 |
| `forms.corefolder.immutable_constraints` | `"head must remain attached...via the safety harness"` を削除 | 88 行 |
| `forms.humanoid.negative_visuals` | `"safety device harness"` を削除 | 17 件 |
| `forms.humanoid.negative_prompt_export` | `"safety device harness"` を除去 | 17 件 |
| `forms.humanoid.outfit_features` | `"no corefolder harness or ..."` → `"no corefolder ..."` | 2 件 (char1, char7) |
| `forms.humanoid.natural_language_description` | `"and harness."` 等を除去 | 2 件 (char1, char7) |
| `common.immutable_traits` (char1固有) | `"front harness belt"` → `"front of the sphere body"` | 1 件 |

追加で手動修正：
- char3: `"all-yellow palette with no harness or accessory"` → `"all-yellow palette with no accessory"`
- char10: `"white belly with no harness or collar accessory"` → `"white belly with no collar accessory"`
- char28: TODO例示から `"or harness shape"` を除去

**Num:15 (トウゴ) のハーネス設定はすべて保持。**

### 2. `tools/patch-aihints.mjs`

- `COREFOLDER_DEFAULT_SILHOUETTE_NOTES` から `"core body suspended in place by a belt-like safety device harness"` を削除（1行）
- `COREFOLDER_DEFAULT_IMMUTABLE_CONSTRAINTS` から `"head must remain attached and protruding from the core body via the safety harness"` を削除（1行）
- `buildNegativeVisuals` の humanoid ブランチから `negatives.push('safety device harness')` を削除（1行）
- ドキュメントコメント「1〜2行」→「1行」に更新

### 3. `docs/ai-hints-usage.md`

- `immutable_constraints` の説明から harness 項目を削除し、3項目が標準であること・harness保持は15固有であることを明記
- `silhouette_notes` の説明からハーネスの structural default 言及を削除
- structural default 一覧表 (`forms.*.silhouette_notes` / `forms.*.immutable_constraints`) を実態に合わせ更新

## 影響範囲（編集ファイル）

- `data/Works_NumberTales/DataBases/db_Primary.json`
- `tools/patch-aihints.mjs`
- `docs/ai-hints-usage.md`
- `.cache/fix-harness-contamination.mjs`（一時スクリプト、Git管轄外）

## 検証

- `npm test` (data.sanity.test.js + aihints.schema.test.js): **13 passed / 0 failed**
- スクリプト実行後、Num:15以外の全レコードに `harness` 文字列が残存しないことを確認済み
- Num:15 のハーネス設定は変更なし

## 未完了タスク

- `--upgrade-schema` 以外のモードで今後ハーネスが再混入しないか、リグレッション追加を検討する

## 運用ルール（今後）

- ハーネス形状は `copilot-instructions.md` にも記載の通り**キャラ固有スロット**扱い。
  structural default に含めず、15固有の設定として `db_Primary.json` で直接管理する。
- `patch-aihints.mjs --upgrade-schema` 実行時は 15 のハーネス設定を上書きしないこと（`!('field' in obj)` ガード済み）。
