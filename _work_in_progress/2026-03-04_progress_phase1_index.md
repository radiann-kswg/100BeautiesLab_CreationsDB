# 2026-03-04 進捗ログ: 希望タスク フェーズ1（#Index 型の段階導入）

## 目的

- 中小-1「`db_type.json` で `$type: "#Index"` と宣言されたフィールドを、作品別 typedef の `$IndexDef` と同型として扱う」ための第一歩として、**UI 側での解釈と動線**を先に整える。
- 併せて、`NumberTales` の `Relation`（関係キャラ）で **番号から該当キャラへジャンプ**できる状態を作り、照合の足場にする。

## 変更点の要約

- UI: `#Index` 型の値を `$IndexDef` に基づき整形表示できるようにした（値のラベル・ネスト型対応の土台）。
- UI: 一覧/詳細の `#Index` 表示（チップ/ピル/テーブル値）を直リンク（`idx/idxKey`）としてリンク化し、共有しやすくした。
- UI: `Relation` の `Num` をクリックすると、同一作品・同一DB内で該当キャラを開けるようにした（該当レコードが見つかる場合）。
- 仕様整理（Breaking）: `$Index` 互換を削除し、`#Index` に統一。
- typedef: `Works_NumberTales` の `Relation` 定義で `Num` の型宣言を `#Index` に統一。

- Data（typedef）: 各作品の index ルートキー（例: `Num` / `Card` / `BeastType` / `Drc` / `Unit` / `Generation` / `Model`）を、作品別 `db_type.json($DefType)` に `"$type":"#Index"` として明示し、typedef 駆動で同一の扱いに寄せた。

- API（SW共通）: `EnrichmentProcessor.searchRecords()` に `hashTag:'#Index'` の解釈を追加し、作品別 index 定義（typedef の `$IndexDef`）に従って実フィールドへ展開して検索できるようにした。
  - スカラー index（例: `key: 1`）
  - ネスト index（例: `key: { Stoat: 'Major', Num: 0 }`）※ AND 条件として展開
- Data（Breaking）: index 定義（表示名/ネスト構造）を作品別 typedef（`db_type.json.$IndexDef`）へ集約し、`data/db_meta.json(CreationWorks.*.$DefType_Index / $Def_Index)` から削除。
- 回帰修正: index 子要素が `#Number|#String` のような union の場合に数値比較をしてしまうと、`'0'` が `'000'` 等へ誤一致して複数ヒット扱いになり参照解決がスキップされ得るため、union に `#String` を含む場合は数値比較を抑止して厳密一致に寄せた。
- 回帰修正: ネスト index のサブキーに `null` を含める検索（例: `{ LogicSeries: null, Num: 62 }`）で一致判定が常に不一致になっていたため、検索キーが `null` の場合は `val===null` を一致扱いにした（明示的に null を検索したいケース向け）。
- Test: `#Index` 検索（スカラー/ネスト）を回帰テストで検証（typedef の `$IndexDef` を使用）。

## 影響範囲（編集したファイル）

- `pages/characters.js`
- `CHANGELOG.md`
- `data/Works_NumberTales/DataBases/db_type.json`

- `lib/data-common.js`
- `tests/enrich.dblink.jump.merge.test.js`

- `data/Works_NumberTales/DataBases/db_type.json`
- `data/Works_FLInvestigator78/DataBases/db_type.json`
- `data/Works_ShouArRiders/DataBases/db_type.json`
- `data/Works_SinisterChangingGirls/DataBases/db_type.json`
- `data/Works_DestinyFoxsRecords/DataBases/db_type.json`
- `data/Works_Proxies/DataBases/db_type.json`
- `data/Works_UnauthedLogica/DataBases/db_type.json`
- `data/Works_PastDivers/DataBases/db_type.json`

- `data/db_meta.json`

## 検証（観点）

- `npm test`（Vitest）が通ること
- UI（手動確認）
  - `NumberTales / Primary` の任意キャラ詳細で「関係」セクションの `→ <番号>` がリンクになり、クリックで該当キャラが開くこと
  - 該当が存在しない場合はリンクにならず、表示が崩れないこと

## 検証（結果）

- Vitest: 全テスト通過（`#Index` 検索の回帰テスト追加を含む）

## 未完了タスク

- `#Index` の運用整理（DB/typedef/メタの責務分担、ネスト index の扱い方針など）
