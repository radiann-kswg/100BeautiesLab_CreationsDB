# 和英対応フィールド（bilingual wrapper）API/SW 対応

## 目的

`Works_UnibyteLive` で新設された bilingual wrapper パターン
（`$type` が `_JP`/`_EN` ペアの配列）を API/SW 側が正しく識別・メタ情報付与できるように対応。

対象フィールド例:

- `StreamingActivity.StreamingGreeting` — `$type: "#String_JP_withAbout[]"` ペア
- `StreamingActivity.ListenerNickname` — `$type: "#String_JP"` ペア

---

## 変更点の要約

### `lib/data-common.js`

#### 新規メソッド（`TypeDefUtils` クラスに追加）

| メソッド                                        | 役割                                                                                                                                                                   |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `stripLangSuffixFromTypeStr(typeStr)`           | `#String_JP_withAbout[]` → `#String_withAbout[]` のように `_JP`/`_EN` サフィックスを除去してベース型を返す。union 型（`\|`区切り）の各トークンに個別に適用する。       |
| `detectBilingualWrapper(typeArray, display)`    | `$type` 配列の全子要素が `_JP`/`_EN` ペアで構成されている場合に「bilingual wrapper」と判定。`langMode`・`primaryChildKey`・`altChildKey`・`effectiveBaseType` を返す。 |
| `collectBilingualWrapperPaths(entries, prefix)` | `$DefType` エントリを再帰走査して、bilingual wrapper フィールドのすべてのドットパスを収集する（ネスト済みフィールドを含む）。                                          |

#### 変更メソッド

- **`TypeDefUtils.pickDisplaySection(entry)`**
  - `$type` が配列の場合（= 旧来は `typeStr = ''` で `basic` に誤分類）、`detectBilingualWrapper` を呼び出して有効ベース型を `typeStr` として使用するよう修正。
  - これにより `StreamingGreeting`（`#String_withAbout[]` 相当）が profile 判定しないことも確認できる。

- **`EnrichmentProcessor.enrichRecords()`**
  - ステップ 5.5 として `collectBilingualWrapperPaths` を呼び出し、結果を `_enrichment.bilingualWrapperFields` に追加。
  - UI 側はこのメタを参照することで、有効ベース型・`langMode`・主従子キーを取得できる。

#### `TypeDefUtils` の `globalThis` 公開

- `self` / `window` / `globalThis` の各環境向けに `TypeDefUtils` を追加。
- Vitest テストで `globalThis.TypeDefUtils` が参照できるようになった。

---

### `tests/bilingual-fields.test.js`

既存の検索エイリアステストに加え、以下のテストスイートを追加:

| テストスイート                                              | 検証内容                                                                             |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `TypeDefUtils.stripLangSuffixFromTypeStr`                   | 言語サフィックス除去（各ケース・union 型）                                           |
| `TypeDefUtils.detectBilingualWrapper`                       | ペア検出・langMode 解釈・primaryChildKey 選択・non-bilingual 判定                    |
| `TypeDefUtils.collectBilingualWrapperPaths`                 | トップレベル収集・ネスト走査・複合パターン                                           |
| `TypeDefUtils.pickDisplaySection with bilingual wrapper`    | bilingual wrapper entry に対するセクション分類                                       |
| `EnrichmentProcessor.enrichRecords: bilingualWrapperFields` | `_enrichment.bilingualWrapperFields` 生成（`StreamingGreeting`・`ListenerNickname`） |

---

## 影響範囲

| ファイル                         | 変更種別                                |
| -------------------------------- | --------------------------------------- |
| `lib/data-common.js`             | メソッド追加・修正・globalThis 公開追加 |
| `tests/bilingual-fields.test.js` | テストケース追加                        |

---

## テスト結果

- `bilingual-fields.test.js`: **18 / 18 passed** ✅
- `data.sanity.test.js` / `sw.enrich.basic.test.js` / `enrich.dblink.jump.merge.test.js` の回帰確認: 今回の変更による新規失敗なし
  - `data.shape.test.js` 2件・`enrich.dblink.jump.merge.test.js` 1件は変更前から存在する既存の失敗

---

## 未完了タスク

- `pages/characters.js` の UI 表示対応（`_enrichment.bilingualWrapperFields` を利用した JP/EN 列分割描画）は今回スコープ外。
  - `bilingualWrapperFields` メタが出力されているため、UI 対応時の実装基盤は整っている。

---

## 参考

- `docs/schema-meta-processing.md` — typedef 処理フロー
- `docs/wrapper-summary-registry.md` — wrapper/section renderer 規約
- `docs/api-sw-spec.md` — API/SW 仕様
