# 2026-06-12 進捗レポート：ページ全体 JP/EN 切替トグル導入

## 目的

英訳フィールド拡充に合わせて、`pages/characters` の表示を
「和英併記固定」ではなく、ボタン操作で **JP / EN をページ全体で切替**できるようにする。

---

## 変更概要

### 1. UI トグル追加

- `pages/characters.html`
  - コントロール行に `#btn-lang-toggle` を追加
  - 文言差し替え用に主要テキストへ ID を追加（作品/DB/検索ラベル、メタ見出し、一覧見出しなど）
  - `asset-version` を `2026.06.12.1` へ更新

- `pages/characters.sass`
  - 言語切替ボタン（`.lang-toggle`）の最小スタイルを追加

### 2. 言語状態管理

- `pages/characters.js`
  - `lang` クエリ（`?lang=jp|en`）と `localStorage`（`100bl.characters.pageLang`）を導入
  - 実行時状態 `window.__CHAR_STATE__.pageLang` を保持
  - 初期値は互換維持のため `mix`（既存の和英併記）

### 3. 文言・表示の言語反映

- `pages/characters.js`
  - `applyStaticTextLanguage()` で画面固定文言（タイトル、ラベル、ボタン等）を JP/EN 切替
  - `getDbDisplayLabel()` / `humanWorkLabel()` / `renderSelectionMeta()` を言語対応
  - `getRecordPrimaryTitle()` など一覧/詳細の見出し生成を言語対応
  - `formatBilingualLabel()` をページ言語モードに追従（`raw/code` は従来優先）

### 4. ラベル解決の互換維持

- `buildFieldLabelMap()` は既存互換のため **JP 文字列マップを維持**
- EN ラベルは `__en__<key>` の並行キーとして保持
- `getFieldLabel()` で EN モード時に `__en__` を参照

### 5. 追加修正（最新要求対応の先行分）

- `pages/characters.js`
  - `formatBilingualLabel()` の言語分岐を厳格化
    - `lang=jp`: 日本語（`*_JP` または日本語本文）だけ表示
    - `lang=en`: 英語（`*_EN`）があるときだけ表示
    - `lang=mix`: 従来どおり和英併記
  - `formatBilingualGroup()` のグループ描画でも同じ規則を適用
    - JP で英語フォールバックしない
    - EN で日本語フォールバックしない
  - `matchFilter()` の検索対象をハードコード列挙から再帰収集へ変更
    - schema/データ拡張に追従しやすい汎用実装に置換
    - 内部補助キー（`_` 始まり）は除外

### 6. ConversationPattern 表示不具合の修正

- 症状
  - `?lang=jp` でも `ConversationPattern` が英語本文で表示されるケースがあった
  - 特に `Works_Proxies` の `Generation=3` で再現
- 原因
  - 言語状態解決で runtime state が URL クエリより優先され、`lang=jp` 指定が効かない経路があった
  - `ConversationPattern` のような「子 field 定義を持つ object」を、wrapper-like 判定が誤って structured 展開対象外にしていた
- 対応
  - `getCurrentPageLanguage()` を `query -> state -> localStorage` の優先順に修正
  - object 展開時に `*_JP/*_EN` 子キーをページ言語に応じてフィルタ
    - `jp`: `_EN` を除外
    - `en`: `_JP` を除外し、同名ベースに `_EN` がある場合はベース側も除外
  - schema wrapper 判定を調整し、`$type` が「child hashTag 配列」の構造を wrapper と誤判定しないよう修正
  - ブラウザ実測で `?lang=jp&idx=3&idxKey=Generation` の `ConversationPattern` が日本語表示へ戻ることを確認

---

## 影響範囲

- `pages/characters.html`
- `pages/characters.sass`
- `pages/characters.js`

---

## テスト

### 実行済み

- `tests/pages.characters.syntax.test.js` ✅
- `tests/bilingual-fields.test.js` ✅
- `tests/pages.characters.syntax.test.js`（再実行） ✅
- `tests/bilingual-fields.test.js`（再実行） ✅
- `tests/pages.characters.ui-output.test.js` ⚠️ 一部失敗
- `tests/pages.characters.ui-output.test.js`（再実行） ⚠️ 既知2件のみ失敗

### 7. hashTag_EN 追記への追随（UI / API-SW）

- `pages/characters.js`
  - `getIndexLabel()` をページ言語依存で解決し、EN では `hashTagName_EN/hashTag_EN` を優先
  - `extractTopLevelSchemaFields()` のラベル解決で `hashTag_EN` をフォールバック追加
  - `extractImageFields()` で画像項目ラベルを `labelJP/labelEN` の両方保持
  - `buildImageGallery()` でページ言語に応じて画像キャプション/alt を切替
  - `createGalleryImageItem()` の拡大ヒントを JP/EN で切替
  - `SecondaryInfo` 見出しを `hashTag_EN` 対応
- `lib/data-common.js`
  - `TypeDefUtils.pickLabel()` に `hashTag_EN/hashtag_EN` フォールバックを追加
  - SW/API 側の typedef ラベル抽出が JP 欠損時でも空にならないよう調整

確認:

- `?lang=jp` / `?lang=en` で Proxies(Generation=3) の構成崩れがないことをブラウザ確認
- 画像ギャラリーの表示要素（見出し・拡大ヒント）は言語状態に追従
- `tests/sw.enrich.basic.test.js` ✅
- `tests/sw.deftype.merge.test.js` ✅

### 8. ENページで Summary_EN が表示されない不具合の修正

- 症状
  - `?lang=en` でも `Profile` セクションの `Summary` 本文が日本語のまま表示される
- 原因
  - `pages/characters.js` の `profileSection` が `rec.Summary` を固定参照しており、
    言語状態に応じた `Summary_EN` への切替が未実装だった
- 対応
  - `profileSummaryText` を導入し、ページ言語で本文キーを切替
    - `lang=en`: `Summary_EN` 優先（欠損時は `Summary`）
    - `lang=jp`: `Summary` 優先（欠損時は `Summary_EN`）
  - `preWrapText(rec.Summary)` を `preWrapText(profileSummaryText)` に変更

### 9. ENラベル補完の強化（BasicInfo など）

- `pages/characters.js`
  - `buildFieldLabelMap()` に逆引き補完を追加
    - `hashTag_EN` 未定義の base key でも、`<base>_EN` 側の EN ラベルを `__en__<base>` へ補完
  - これにより `FormalName` / `CodeName` / `Summary` などで EN ラベル解決を安定化
- `data/db_type.json`
  - `ModelNumber` に `hashTag_EN: "Model Number"` を追記（兄弟 `_EN` 項目が無いため個別対応）

確認:

- ENページ（NumberTales / Num=9）で以下をブラウザ確認
  - BasicInfo ラベル: `Formal Name`, `Model Name`, `Model Number`, `Code Name` へ切替
  - Profile の `Summary` ラベルは英語表示、本文は `Summary_EN` の英語本文を表示
- API応答確認（`/pages/v1/works/Works_NumberTales/db/Primary?resolve=1`）
  - `Num=9` レコードに `Summary` / `Summary_EN` の両方が含まれることを確認

追加テスト:

- `tests/pages.characters.syntax.test.js` ✅
- `tests/bilingual-fields.test.js` ✅

### 失敗（2件）

- `tests/pages.characters.ui-output.test.js`
  - `prioritizes declared subFields order over basic/profile/relation fallback routes`
    - `NumerospecAbout` セクション順序の期待不一致
  - `renders enum-link alphaLabel values as bilingual code labels`
    - 期待タグ `能力レベル: S+（かなり強力 / Quite Powerful）` が取得できない

※ 上記 2 件は今回変更の影響切り分けが未完了。

---

## 未完了タスク

- 上記 2 件の UI 出力回帰テストの詳細切り分け
- `lang=en` 指定時の目視確認（一覧・詳細・メタパネル）
- 必要なら `tests/pages.characters.ui-output.test.js` への言語モード別期待値追加

---

## 参考

- `_work_in_progress/2026-06-11_progress_english-fields-addition.md`
- `_work_in_progress/2026-06-01_remaining-task.md`
- `docs/schema-meta-processing.md`
- `docs/wrapper-summary-registry.md`
