# 2026-07-13 進捗: 詳細ピルの Index ルート単位集約表示

## 目的

複数サブフィールドを typedef している Index（例: アンオースドロジカ `Logic` / `LogicAlt`、運命線探偵78 `Card`）の詳細ヒーローピルが、サブフィールドごとに個別のピルへ分裂して視認性が悪かったため、「Index ルートごとに 1 ピル」へ集約する（User リクエスト）。

## 変更点の要約

- `pages/characters.js`
  - `collectIndexEntries()` の各エントリ（サブフィールド/ null キー/ スカラー/ エイリアス）へ `rootKey` を追加。
  - エイリアスIndex エントリには、ルートラベル接頭辞を付ける前の per-item テキストを `groupText` として保持（グループ表示ではルートラベルを別枠で 1 回だけ出すため）。
  - 詳細ヒーローのピル生成（`renderDetail` 内 titleRow）を `rootKey` 単位のグループ描画に変更:
    - 複数エントリのグループ → `.pill.pill--index-group`（`pill__group-label`＝`getFieldLabel(rootKey, ...)` で `$DefType` の `hashTag_JP/EN` を解決 + `pill__group-items` 内に `pill__group-item` を列挙）
    - サブフィールドの表示順は `$IndexDef` の typedef 宣言順（`$display.index.order` が有限値ならそちらを優先）。直リンク対象の選択は従来どおり優先度順（`collectIndexEntries` のソート結果の先頭 link 可能エントリ）。
    - フィールド情報は `.pill__group-items`（inline-flex + wrap）の 1 ユニットにまとめ、折り返し時の改行は「ルートラベルとフィールド情報の間」が優先される（ユニット単体でも収まらない場合のみ内部 wrap）。
    - グループ内の直リンク可能エントリ（優先度順の先頭、例: `Logic.Num`）でピル全体を `<a>` 化（`idx`/`idxKey`/`num` は従来と同一）
    - 1 エントリのみのグループ（NumberTales の `Num` などスカラー Index）→ 従来どおりの単一ピル表示を維持
  - `asset-version`: `2026.07.13.1` → `2026.07.13.3`
- `pages/characters.sass` / `pages/characters.css`
  - `.pill--index-group`（wrap 対応）/ `.pill__group-label`（右ボーダー区切り）/ `.pill__group-items`（フィールド情報の折り返しユニット）/ `.pill__group-item`（隣接項目間は「・」）を追加。
- `tests/pages.characters.ui-output.test.js`
  - UnauthedLogica ニッキー: `Logic` / `LogicAlt` が 2 グループピルに集約され、ラベル・宣言順（LogicSeries → Num）・`.pill__group-items` ユニット・直リンク keyPath（`Logic.Num` / `LogicAlt.Num`）が正しいことを検証。
  - NumberTales 1: スカラー Index はグループ化されず従来の単一ピル（`番号: 1`）のままであることを検証。

## 影響範囲（編集したファイル）

- `pages/characters.js`
- `pages/characters.sass` / `pages/characters.css`
- `pages/characters.html`（asset-version のみ）
- `tests/pages.characters.ui-output.test.js`
- `CHANGELOG.md`

## 非影響（変更なし）

- 一覧チップ（`list` コンテキスト。主要サブフィールドのみの表示は従来どおり）
- 直リンク照合ロジック（`recordMatchesIndexQuery` / composite 識別子）
- enrich / `_DBLink` / `_Jump` の解決レイヤー

## 検証

- `npm test` 全件成功（28ファイル / 273件。新規 2 件を含む）
- 実ブラウザ（Live Server）で確認:
  - UnauthedLogica PrimaryMobs ニッキー: `論理/ロジック｜ロジック系統: キリルシリーズ ・ロジック番号: 55ID1` + `互換論理/互換ロジック｜ロジック系統: 7400シリーズ ・ロジック番号: 141` の 2 ピル（幅不足時はラベル直後で改行されることを確認）
  - FLInvestigator78 フェニクス: `Card` のサブフィールドが 1 ピルに集約
  - NumberTales 1(ハジメ): `番号: 1` の単一ピル（従来表示のまま）

## 未完了タスク

- なし（EN モードの表示確認は目視未実施。ラベル解決は `getFieldLabel` / `getIndexLabel` の既存言語フォールバックに依存するため回帰リスクは低い）
