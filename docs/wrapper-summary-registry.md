# wrapper summary registry メモ

このドキュメントは、2026-05-11 セッションと同日コミット群で進めた `Day` / `Era` / `StoryEra` 周辺の wrapper 化、および SW / enrich 連携の現状を、今後の実装で再参照しやすい形にまとめた技術メモです。

対象:

- `lib/wrapper-common.js` を拡張したい人
- `pages/characters.js` の特殊整形をさらに削減したい人
- `lib/sw-common.js` / `lib/data-common.js` で wrapper summary を再利用したい人
- `db_type.json` の `$display.role` / `$display.wrapper` をどう使うか確認したい人

---

## 1. 先に結論

2026-05-11 時点の方針は次の通りです。

1. `Day` / `Era` / `StoryEra` の特殊 summary は、可能な限り `lib/wrapper-common.js` の shared wrapper registry で扱う
2. schema 側は `db_type.json` の `$display.role` と `$display.wrapper` で「どの値を読むか」「どの wrapper を使うか」を宣言する
3. UI は wrapper を先に試し、値が返らない場合だけ generic fallback へ戻る
4. SW / enrich 側も同じ registry を使い、DB カタログ summary や `_enrichment.wrapperSummaries` を生成する

つまり、**個別 field 名に依存した if を main code へ増やすのではなく、schema 宣言 + shared wrapper registry へ寄せる**のが現在の正です。

---

## 2. 現在の実装配置

### 2.1 wrapper 実装の中心

- `lib/wrapper-common.js`

ここに、shared な特殊整形 handler を登録します。

現時点の built-in wrapper:

- `daySummary`
- `eraSummary`
- `storyEraSummary`

### 2.2 schema 側の宣言

- `data/db_type.json`

現在の割り当て:

- `$VarsDef.$Def_Day.$display.wrapper = daySummary`
- `$MetaType.$Def_StoryEra.$display.wrapper = eraSummary`
- `$MetaType.$Def_StoryEraCatalog.$display.wrapper = storyEraSummary`

### 2.3 UI 側の利用

- `pages/characters.js`

`formatValueForDisplay()` は object 値を整形するときに wrapper registry を先に試します。

- `schemaType`
- `defName`
- `typeSources`

を渡して wrapper 解決を行い、文字列が返ればそれを採用します。

### 2.4 SW / enrich 側の利用

- `lib/sw-common.js`
- `lib/data-common.js`

現時点の利用箇所:

- works/{work}/db の DB カタログ応答に `StoryEraSummary` を付与
- enrich 結果に `_enrichment.wrapperSummaries` を付与

---

## 3. wrapper handler の最小シグネチャ

handler シグネチャは次で固定しています。

```js
format(value, context);
```

`context` の主要項目:

- `schemaType`
- `defName`
- `fieldKey`
- `typeSources`
- `helpers`

`helpers` に含むもの:

- `isPlainObject`
- `splitSchemaTypeTokens`
- `schemaTypeIncludes`
- `resolveTypeDefContainer`
- `resolveTypeDefEntries`
- `getRoleEntries`
- `getRoleRawValues`
- `pickRoleRawValue`
- `pickAboutText`

ルール:

- wrapper は非空の文字列を返したときだけ採用される
- 空文字を返した場合は呼び出し側が fallback を継続する
- handler 内で field 名を直接固定するより、可能な限り `role` を使って値を読む

---

## 4. `Era` 主体での整理

### 4.1 現在の考え方

`StoryEra` は単体 formatter ではなく、**`Era` 単点 formatter の合成結果**として扱います。

実装上は次の役割分担です。

- `eraSummary`
  - 単点年代の整形を担当
  - `EraGen`, `YearInEra`, `byRealYear`, `about_*` を読む
- `storyEraSummary`
  - `InEra`, `FromEra`, `ToEra` を見て、内部で `eraSummary` 相当の整形を並べて summary を作る

### 4.2 この構成にした理由

- `Era` 単点ロジックを 1 か所に閉じられる
- `StoryEra` / `FromEra` / `ToEra` / `InEra` の挙動差分を catalog 側の組み立てへ限定できる
- 将来 `Era` が standalone field として top-level に現れても同じ handler を流用できる

---

## 5. SW / enrich 側の summary 露出

### 5.1 DB カタログ応答

- `lib/sw-common.js`
- works/{work}/db, bootstrap 系

現状:

- raw の `StoryEra` を返す
- さらに `StoryEraSummary` を返す

重要:

- `StoryEraSummary` は `lib/sw-common.js` の個別ハードコードではなく、`$MetaType.$Def_DatabaseCatalog.$DefType` を見て wrapper 解決できる field から `${hashTag}Summary` を自動生成する
- 現時点では `StoryEra` がその対象なので `StoryEraSummary` が生成される

### 5.2 enrich 出力

- `lib/data-common.js`
- `EnrichmentProcessor.enrichRecords()`

現状:

- `_enrichment.wrapperSummaries` を追加
- wrapper 解決できる top-level field の summary を保持

例:

```json
{
  "_enrichment": {
    "wrapperSummaries": {
      "BirthDay": "8/15（誕生日）",
      "StoryEra": "第9創世紀3年 / 西暦2050年"
    }
  }
}
```

この summary は UI が raw 構造を再解釈せずに利用したいときの再利用ポイントです。

---

## 6. 今後の判断基準

### 6.1 新しい特殊 summary 型を追加したいとき

先に確認する順:

1. 既存 typedef に `$display.role` を足せば済まないか
2. 既存 wrapper の合成で済まないか
3. それでも足りない場合だけ `lib/wrapper-common.js` に新 wrapper を追加する

### 6.2 main code に if を足したくなったとき

まず次を確認します。

- schema に `$display.wrapper` を付けられないか
- `helpers.pickRoleRawValue()` で値を読めないか
- DB カタログや enrich 側なら generic な summary 集約へ寄せられないか

### 6.3 docs 同期先

wrapper 周辺を触ったら、最低限次を確認します。

- `docs/schema-meta-processing.md`
- `docs/api-sw-spec.md`
- `docs/implementation-playbook.md`
- `.github/copilot-instructions.md`
- `_work_in_progress/2026-05-11_progress_storyera-schema.md`
- `CHANGELOG.md`

---

## 7. 代表テスト

wrapper 周辺を触ったときに優先して回すテスト:

- `tests/wrapper-common.test.js`
- `tests/enrich.wrapper-summaries.test.js`
- `tests/sw.work-meta-info.test.js`
- `tests/pages.characters.ui-output.test.js`
- `tests/pages.characters.syntax.test.js`
- 必要に応じて `tests/meta.catalog.schema.test.js`

---

## 8. 関連資料

- `docs/schema-meta-processing.md`
- `docs/api-sw-spec.md`
- `docs/implementation-playbook.md`
- `.github/copilot-instructions.md`
- `_work_in_progress/2026-05-11_progress_storyera-schema.md`
