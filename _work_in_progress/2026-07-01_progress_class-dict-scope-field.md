# Belonging別Class辞書の参照解決（辞書行スコープタグ `scopeField`）

## 目的

`Belonging[]` の値に応じて `Class[]` の参照先辞書を切り替えられるようにする。
きっかけは NumberTales「錦野 舞」の `Class: ["開発者", "ベヴストザイン課 D-Vines開発部"]` の後者要素が、
所属（`Belonging: ["シンフォニー.XVI(ゼクズィン)"]`）専用の `data/Dictionaries/dict_SymphonyXVI.json` に
定義があるにもかかわらず、既存実装では常に未解決（生文字列表示）になっていたこと。

## 調査で判明した既存の不具合

- `data/Works_NumberTales/Dictionaries/dict_Class.json`（work-local, 汎用クラス辞書）と
  `data/Dictionaries/dict_SymphonyXVI.json`（global, シンフォニー.XVI専用）が、
  どちらも `compatListKey: "#List_Class"` を名乗っていた。
- `pages/characters.js` の `metaForLookup` 構築処理（`renderList`/`renderDetail` 内、2箇所）が
  `{ ...gmVars, ...wmVars }`（単純 object spread = 後勝ち上書き）で global/work の `$VarsDef` を合成していたため、
  work-local の `#List_Class` が global の `#List_Class` を**丸ごと上書きして消していた**。
  → global 側の `#Dict_SymphonyXVI` が実質参照不能になっていた（既存のデータ不整合ではなく実装側の不具合）。
- `Dictionaries` カタログ自体（`gm.Dictionaries` / `wm.Dictionaries`）も同様に「後勝ち丸ごと上書き」されていた。

## 実装方針（最終版・辞書ファイル単位のスコープ条件）

最初は「辞書1本のまま各行に手書きタグ」（案B）で実装したが、User から
「`scopeField` 自体にフィールド名も値も持たせて、辞書ファイル1本まるごとが
その条件のキャラクター向けとして機能するようにしたい（行ごとのタグ付けは不要にしたい）」
という追加要望があり、設計を以下へ変更した。

- `scopeField` はカタログ側で `{ "Belonging": "シンフォニー.XVI(ゼクズィン)" }` のような
  **フィールド名→値のオブジェクト**を持つ（複数キー指定でAND条件、将来の拡張にも対応）。
- 辞書本体（`dict_*.json`）側には行ごとのタグを書かない。読み込み時（3箇所のローダー）に
  `scopeField` の内容を辞書の全行へ自動合成することで、以降の行単位マッチングロジック
  （`resolveVarsDefLabelPack()` 内）はそのまま使い回せる。

## 変更点（最終版）

- `data/Dictionaries/db_meta.json`: `Dictionaries.#Dict_SymphonyXVI` に
  `"scopeField": { "Belonging": "シンフォニー.XVI(ゼクズィン)" }` を追加（フィールド名・値の両方を1箇所で宣言）。
- `data/Dictionaries/dict_SymphonyXVI.json`: 行ごとのタグは無し（Class/Class_EN のみ）。
- `lib/sw-common.js` の `readDictionaryBundle()` / `pages/characters.js` の `fetchDirectDictionaryBundle()`
  （SW未応答時の直fetchフォールバック） / `tests/pages.characters.ui-output.test.js` の `loadDictionaryBundle()`
  （テストフィクスチャ）: 辞書ファイル読み込み時に `info.scopeField`（オブジェクト）を全行へ `{ ...scopeField, ...row }`
  の形で合成するよう統一（行側の値があれば行を優先）。
- `pages/characters.js`:
  - `findDictScopeCondition(dictionariesCatalog, listKeyCandidates)`（旧 `findDictScopeField`）: カタログから
    `scopeField` 条件オブジェクト（またはnull）を取得。
  - `resolveVarsDefLabelPack()` に第6引数 `recordContext` を追加。`scopeCondition` の全キーが同一レコードの
    対応フィールド値と一致する行（`rowMatchesRecordScope()`）を優先解決し、一致が無ければ `scopeField` を
    持たない共通行（`rowHasScopeTag()` が false）へフォールバック。`recordContext` 省略時は従来通り
    スコープ無視（後方互換）。
  - `mergeVarsDefLayers(...sources)` 新設: 配列は連結・objectは浅いマージで $VarsDef / Dictionaries カタログを合成。
    `renderList` / `renderDetail` 双方の `metaForLookup` 構築処理をこれに置き換え（object spread の丸ごと上書きを解消）。
  - `formatValueForDisplay()` の `opt.recordContext` を経由して、詳細テーブル・一覧chip・関連キャラプレビュー等の
    主要呼び出し箇所（十数カ所）へ配線。配列フィールド（`Class[]` 等）は同じ `opt` を子要素にも再利用するため、
    トップレベルの呼び出し元だけに `recordContext` を足せば子要素にも伝播する。
- `docs/schema-meta-processing.md`: §3.4.1 に最終版の `scopeField` 仕様・`mergeVarsDefLayers()` の合成方針を追記。
- `CHANGELOG.md`: 上記をまとめて追記（設計変更に合わせて内容を上書き更新）。
- `tests/pages.characters.ui-output.test.js`: 新規テスト
  `resolves Class values via a Belonging-scoped dictionary (scopeField)` を追加。
  実データ（NumberTales「錦野 舞」）を `__applyCharactersCommonsForTest()` で `_Commons` 適用し、
  `Belonging` が注入された状態で `Class` の1要素が SymphonyXVI 辞書経由でJP/EN解決されることを確認。
  （元レコードは `_Commons` 経由で `isPrivate: true` が付くため、辞書解決の検証に限定してテスト内でのみ上書き）

## 影響範囲（編集ファイル）

- `data/Dictionaries/db_meta.json`
- `data/Dictionaries/dict_SymphonyXVI.json`
- `lib/sw-common.js`
- `pages/characters.js`
- `docs/schema-meta-processing.md`
- `CHANGELOG.md`
- `tests/pages.characters.ui-output.test.js`

## 検証

- `node --check pages/characters.js`: 構文OK
  （途中、追加したJSDocコメント内の `#List_*/#Dict_*` という表記が `*/` としてコメント終端に誤解釈され、
  一時的に構文エラーになる事故があった → `#List_* / #Dict_*` とスペースを挟んで解消）
- `npm test`（Vitest）: 135 passed / 2 failed（既知の無関係な既存失敗のみ）。
  - 失敗2件（`renders references layer records with shared references typedef labels` /
    `renders glossary and reference list cards using Term and Title fallbacks`）は、
    本セッション開始前から作業ツリーに存在した未コミット差分（`data/Works_FLInvestigator78/References/ref_Vocabulary.json` 等、
    本タスクと無関係）が原因。`git stash` で本変更（`pages/characters.js`）を退避した状態でも同じ2件が失敗することを確認済みのため、
    今回の変更によるリグレッションではない。
- 新規テスト（scopeField）: pass。
- 設計変更後（`scopeField` をオブジェクト化・辞書ファイル単位のスコープへ変更）に再度 `node --check` / `npm test` を実行し、
  同じ結果（135 passed / 既知の無関係な2件のみ失敗、新規テストも pass）を確認済み。

## 追記: `dict_Mikhail.json` 追加後の「ページが読めなくなった」障害調査

User が `data/Dictionaries/dict_Mikhail.json`（`scopeField: { Belonging: '国際情報広報機関『ミハイル』' }`）を
追加し、Copilot に修正を依頼した後に開発環境ページ（`pages/characters.html?work=Works_SinisterChangingGirls&...`）が
表示できなくなったと報告。調査内容:

- Copilot 側の修正で、`lib/sw-common.js` の `readDictionaryBundle()` / `pages/characters.js` の
  `fetchDirectDictionaryBundle()` / `tests/pages.characters.ui-output.test.js` の `loadDictionaryBundle()` の
  3箇所すべてで、同一 `compatListKey`（`#List_Class`）を持つ辞書（`#Dict_SymphonyXVI` と `#Dict_Mikhail`）を
  **先勝ちで上書きせず配列連結する**よう修正済みであることを確認（当方が前回実装した `mergeVarsDefLayers()` は
  レイヤー間＝global/work間のマージのみ対応しており、同一フォルダ内の複数辞書間の連結は別途必要だった箇所）。
- Playwright（headless Chromium, 新規プロファイル）でリポジトリを一時的にローカル配信し、User 指定の URL を
  そのまま検証。**コンソールエラー・ネットワーク失敗（4xx/5xx）は0件、ページは正常に描画**。対象キャラクター
  「Lamill.NuXV」（Belonging: `国際情報広報機関『ミハイル』` + `シンフォニー.XVI(ゼクズィン)`）の Class 2要素とも
  正しい辞書（Mikhail辞書／SymphonyXVI辞書）からJP/EN解決されて表示されることを確認。`node --check` / `npm test`
  も従来通り 135 passed（既知の無関係2件のみ失敗）。
- 結論: **現在のコード自体には不具合なし**。User 側で報告された「ページが読めなくなった」症状は、
  `lib/sw-common.js`（Service Worker 本体が import する共通ライブラリ）を編集中に発生しやすい
  **ブラウザ側の Service Worker / キャッシュの陳腐化**が濃厚（新しい SW がインストールされても
  `skipWaiting`/`clients.claim()` を使っていないため、タブを閉じ直すかキャッシュを明示的にクリアするまで
  旧 SW が制御を握り続けることがある）。
- 対応: `pages/characters.html` の `<meta name="asset-version">` を `2026.06.28.2` → `2026.07.01.1` に更新
  （`characters.css`/`characters.js` の `?v=` キャッシュバスターとして機能。CLAUDE.md 記載の既定手順）。
  `CACHE_NAME`（`lib/sw-common.js`）は `.github/copilot-instructions.md` に「一定のネームスペース」と明記された
  設計のため据え置き。User には、ページ内の既存「Reset Cache/SW」ボタン（全キャッシュ削除＋全SW登録解除＋
  リロードを一括実行）の使用を案内。

## 追記2: 「Belongingが英語モードでも和文表示のまま」の調査・修正

上記のページ復旧確認後、User から「`lang=en` でも `Belonging` だけ和文のまま」と再報告。調査の結果、
**今回の `scopeField` 実装とは無関係の、既存の別バグ**と判明:

- `lib/sw-common.js` の `ApiEndpointHandlers.mergeMetaAndTypeVars()` が `db_type.json` の `$VarsDef`/`$MetaType` は
  合流するが、**`$DefType`（`hashTag`/`$dict` 宣言の配列）を結果へコピーしていなかった**。
- そのため `/pages/v1/deftype/global`（`globalDefType` の実体）から `$DefType` が丸ごと欠落し、
  `pages/characters.js` の `findDictNameInSchema()` が「フィールド名→辞書名」（`Belonging`→`Faction` のように
  フィールド名と辞書名が異なるケース）を解決できず、辞書引き自体が失敗していた。
- `Class` はフィールド名＝辞書名（`$dict: "Class"`）なので `fn`/`keyBase` 経由のフォールバックで偶然救われており、
  `Class` は正しく英訳される一方 `Belonging` だけ壊れて見える、という非対称な症状になっていた
  （Mikhail/SymphonyXVI関連の値に限らず、`百花繚乱研究所` のような全く無関係な既存Belonging値でも再現した）。
- 修正: `mergeMetaAndTypeVars()` に `type.$DefType` が配列なら `result.$DefType` へコピーする分岐を追加。
- 検証: Playwright実描画で `Belonging: 百花繚乱研究所`（修正前・生JP） → `Belonging: HundredBeauties Laboratory`
  （修正後・正しく英訳）を確認。Mikhail/SymphonyXVI関連レコードでも同様に修正を確認。`npm test` 135 passed（既知の
  無関係2件のみ失敗）で回帰なし。

## 未完了タスク

- 特になし（User 依頼範囲は完了）。ただし以下は将来の拡張候補として残る:
  - クロスDB参照プレビュー（`pages/characters.js` 内の `_DBLink`/`_Jump` 結果表示、旧 line ~7683 付近）は
    `workMeta` のみを参照しており `globalMeta` と合流していないため、global辞書由来の `scopeField` 宣言は
    そのままでは効かない（`recordContext` は配線済みだが、メタソース自体が限定的）。今回は対象外として維持。
  - `data/Works_FLInvestigator78/References/ref_Vocabulary.json` 等、本タスク開始前からの未コミット差分（原因不明の既存2件のテスト失敗）は
    本タスクの対象外のため未着手。User に状況共有が必要な場合は別途確認要。

## 参考リンク

- `docs/schema-meta-processing.md` §3.4 / §3.4.1
- `pages/characters.js`: `mergeVarsDefLayers()`, `findDictScopeField()`, `resolveVarsDefLabelPack()`
