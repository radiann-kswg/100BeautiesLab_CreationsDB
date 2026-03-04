# 2026-03-04 進捗ログ: 希望タスク フェーズ1（#Index 型の段階導入）

## 目的

- 中小-1「`db_type.json` で `$type: "#Index"` と宣言されたフィールドを、作品ごとの `data/db_meta.json` の `$DefType_Index` と同型として扱う」ための第一歩として、**UI 側での解釈と動線**を先に整える。
- 併せて、`NumberTales` の `Relation`（関係キャラ）で **番号から該当キャラへジャンプ**できる状態を作り、照合の足場にする。

## 変更点の要約

- UI: `#Index/$Index` 型の値を `$DefType_Index` に基づき整形表示できるようにした（値のラベル・ネスト型対応の土台）。
- UI: `Relation` の `Num` をクリックすると、同一作品・同一DB内で該当キャラを開けるようにした（該当レコードが見つかる場合）。
- typedef: `Works_NumberTales` の `Relation` 定義で `Num` の型宣言を `$Index` → `#Index` に更新。

- API（SW共通）: `EnrichmentProcessor.searchRecords()` に `hashTag:'#Index'`（互換として `'$Index'`）の解釈を追加し、作品別 index 定義（`data/db_meta.json(CreationWorks.<work>.$DefType_Index)`）に従って実フィールドへ展開して検索できるようにした。
  - スカラー index（例: `key: 1`）
  - ネスト index（例: `key: { Stoat: 'Major', Num: 0 }`）※ AND 条件として展開
- 回帰修正: index 子要素が `#Number|#String` のような union の場合に数値比較をしてしまうと、`'0'` が `'000'` 等へ誤一致して複数ヒット扱いになり参照解決がスキップされ得るため、union に `#String` を含む場合は数値比較を抑止して厳密一致に寄せた。
- Test: `#Index` 検索（スカラー/ネスト）の回帰テストを追加。

## 影響範囲（編集したファイル）

- `pages/characters.js`
- `data/Works_NumberTales/DataBases/db_type.json`

- `lib/data-common.js`
- `tests/enrich.dblink.jump.merge.test.js`

## 検証（観点）

- `npm test`（Vitest）が通ること
- UI（手動確認）
  - `NumberTales / Primary` の任意キャラ詳細で「関係」セクションの `→ <番号>` がリンクになり、クリックで該当キャラが開くこと
  - 該当が存在しない場合はリンクにならず、表示が崩れないこと

## 検証（結果）

- Vitest: 全テスト通過（`#Index` 検索の回帰テスト追加を含む）

## 未完了タスク

- `#Index` の利用箇所を他作品にも広げるか（`$Index` 互換の整理方針含む）
- `#Index` の利用箇所を他作品にも広げるか（特にネスト index の実運用）
