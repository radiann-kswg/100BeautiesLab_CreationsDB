# 2026-07-21 進捗: 複合インデックス（オブジェクト型 `$IndexDef`）の圧縮ロケータ対応

## 目的

User 報告の直リンク不具合 2 件を修正する。

1. `?c=FLInvestigator78/Primary/Card.SuitNum:16&lang=jp` → URL から `Suit` が抜ける
2. `?work=UnibyteLive&db=Primary&idx={"Letter":{"AlphaGen":"2","Alphabet":"S"}}&idxKey=__conditions__&lang=jp` → そもそも `c=` が使われない

## 背景・原因（調査結果）

両方とも「圧縮ロケータが複合（多フィールド）Index を表現できない」という単一の原因に行き着く。

- **①**: `getIndexIdentifierFromRecord()` が「単一キーで一意に引けたら打ち切り」。`Works_FLInvestigator78/db_Primary.json` は現状 Major アルカナ + Dealer のみで `SuitNum:16` がたまたま一意になるため、分類キーである `Suit` が URL から落ちていた。
  - `db_UnprocessedDealer.json`（小アルカナ 55 件）では `SuitNum:1〜14` が 4 スートぶん重複しており、スート抜きでは原理的に特定できない。
- **②**: `Letter` は `Alphabet` + `AlphaGen` の 2 要素で、単独では絶対に一意にならない（S は gen1 / gen2 の 2 人）。必ず複合条件（`__conditions__`）へ落ちるが、`buildViewerQueryString()` が複合条件を旧形式へ逃がしていた。
  - 実測: `__conditions__` フォールバックは **UnibyteLive の 44 レコード**（`Primary` 33 + `PrimaryPerformer` 11）。他のオブジェクト型 Index 作品（FLInvestigator78 / PastDivers / ShouArRiders / UnauthedLogica）は 0 件。

## 合意事項（User 判断）

- **載せる範囲**: カテゴリキー（`#IndexListKey`）を常に載せ、一意にならない場合だけ他のサブフィールドを追加する。
- **記法**: カンマ区切り。
- **root 省略**: 複合条件のときだけ主 Index の root（`Card` / `Letter`）を落とす（`$IndexDef` は 1 レコード 1 オブジェクト前提で root に識別情報が無いため）。単一キーは従来どおり root 付き（`Card.Num:7`）。
  - 最終形: `?c=FLInvestigator78/Primary/Suit:Major,SuitNum:16` / `?c=UnibyteLive/Primary/Alphabet:S,AlphaGen:2`
- 副作用として 2026-07-15 の Dealer 短縮化（`Card.Num:79`）は `Suit:Dealer,Num:79` へ戻る。分類キーを落とさないことを優先。

## User によるデータ修正（2026-07-21、本作業と並行）

調査で挙げた「識別子を作れない / 一意にならない」ケースを User がデータ側で解消。

- `Works_UnibyteLive/db_Primary.json`: 重複していた `{Alphabet:"A", AlphaGen:1}` の 2 件目を `AlphaGen:2` へ。
- `Works_UnauthedLogica`: `ModelSeries: null` → `"notModel"`（`dict_ModelSeries.json` に `ModelSeries_JP/_EN: null` の行を追加）、`Num: null` → `"Q"`。`Works_SinisterChangingGirls` 側の `_DBLink` 参照も追従。
- 結果、実データ 1,286 件で「往復して一意にならない」ケースは **0 件**。

## 変更点の要約

- **URL 文法拡張**（`pages/characters.js`）: `IdxToken = <値> | <条件>[,<条件>]*`。複合トークンは `idx`（JSON 条件）+ `idxKey=__conditions__` へ正規化し、既存の subset match 経路へ合流（解決ロジックは再実装しない）。
- **root 省略の実装位置**: root を落とすのは `$IndexDef` を知っている `getIndexIdentifierFromRecord()`（`buildIndexIdentifier(entries, rootKey)`）だけに限定した。`buildIdxToken()` で機械的に「単一トップレベルキー」を剥がす案は、`_DBLink` 由来の `{"LogicAlt": {...}}` が `Logic` に化けるため採らない。
- **サブ Index（エイリアス）の root 抜き参照**（`getIndexRootCandidates()` 新設）: 解決側は「完全一致 → 主 Index の root 配下 → サブ Index の root 配下」の順に照合する。単一キー・複合の双方に適用され、`?c=UnauthedLogica/PrimaryMobs/Num:141` が `LogicAlt.Num:141` と同じレコードへ解決する。
  - 生成側は不変（サブ Index は root 付きで出力）。読み取り側の許容範囲を広げるだけなので URL の見た目は変わらない。
  - 同名サブキーが複数 Index にある場合は主 Index 優先。値まで重複する指定（`LogicSeries:74x` = 4 件一致）は一意にならないが、生成側は一意性を検証済みのためその形は出力されない。
  - 新規ヘルパ: `assignByKeyPath()` / `parseIndexConditionToken()` / `flattenIndexConditions()`、定数 `INDEX_CONDITION_SEPARATOR` / `INDEX_CONDITIONS_KEY`。
  - 複合と見なすのは全パートが `キーパス:値` のときだけ（`Name:9,10` のような値内カンマを壊さない）。
  - 往復できない条件のみ旧形式（個別キー）へ退避。`%2C` も復元して可読性維持。
- **識別子生成**（`getIndexIdentifierFromRecord()`）: `getIndexCategoryKeyPaths()` / `buildIndexIdentifier()` を追加し、カテゴリキー起点で一意になるまで条件を足す方式へ。カテゴリキーが無い Index は従来動作。
- **曖昧リンクの修正**: 一覧チップ（`renderList`）と詳細ヒーローの Index グループピルが主Index でも単一サブフィールドでリンクしていた（UnibyteLive では `Letter.AlphaGen:2` = 別キャラへ飛ぶ）。主Index はレコード識別子を使うよう変更（エイリアス Index は従来どおり）。
- **テストフック追加**: `__recordMatchesIndexQueryForTest()`。

## 影響範囲（編集したファイル）

- `pages/characters.js`
- `pages/characters.html`（`asset-version` → `2026.07.21.1`）
- `tests/pages.characters.url-params.test.js`
- `tests/pages.characters.ui-output.test.js`
- `docs/viewer-guide.md` / `CLAUDE.md` / `.github/copilot-instructions.md` / `CHANGELOG.md`

## 検証

- 実データ **1,286 レコード**（全 9 作品 / 全 DB。DB スコープ付き `$IndexDef_<Db>` も解決）で「識別子生成 → URL 生成 → 解釈 → 一致レコード 1 件」の往復を確認。
  - **旧形式へ退避 0 件 / 往復で一意にならない 0 件**。
  - 識別子を作れないのは `Works_DestinyFoxRecords/db_temp.json` の 1 件のみ（作業用一時 DB）。
- `npm test`: 41 ファイル / 全件成功（下記 3 件を除く）。
- 失敗 3 件はいずれも**本変更前から失敗している既存分**（`git stash` して確認済み）。
  - `tests/data.field-order.test.js` × 2: `data/Works_NumberTales/DataBases/db_SelfSecondary.json` のキー順未整列（`npm run data:order:write` 案件）
  - `tests/pages.characters.ui-output.test.js` × 1: 二次創作メタ「二次創作分類」が出ない
- **データ更新に伴うテスト追従**: `tests/enrich.index-alias-dict.test.js` の「`ModelSeries: null` のレコードが存在する」前提を `notModel`（辞書ラベル null）へ更新。

## 未完了・申し送り

- **エイリアス Index の宣言方法（User 提案・未着手）**: `LogicAlt` のようなエイリアス Index を、現在の推論（`#Index` 型で主 Index の root 以外）ではなく宣言で表す案。
  - 案B `#IndexAlt` 型を追加（推奨）。ラベル（`hashTag_JP`）と安定した直リンク（`LogicAlt.Num:141`）を保ったまま宣言化できる。
    ただしエイリアス性は DB コンテキスト依存（`Logic` は `PrimaryMobs` では主 Index）なので、`#Index` の文脈依存挙動は残し、`#IndexAlt` は「常にエイリアス」の追加宣言として扱う必要がある。
    影響: `data/db_type.json` の `$slot`/`$slotMatch` / `lib/data-common.js` の `#Index` 判定 / `pages/characters.js`（`getWorkIndexAliasDefs` 他）/ `docs/schema-meta-processing.md` / キー順テスト。`/#Index\b/` は `#IndexAlt` にマッチしないため判定の明示的拡張が必要。
  - 案C `#Index[]` で `Logic` / `LogicAlt` を 1 フィールドへ統合。構造は綺麗だが、要素ごとのラベルが持てず（要素内に判別子が必要）、参照が添字ベースになって直リンクの安定性を失うため非推奨。
  - いずれも SW/enrich/検索/キー順スロットまで波及するため、本 URL 修正とは分けて実施する。
- 既存失敗 3 件は別件として未着手。
