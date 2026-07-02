# 2026-07-02 進捗: `_Jump` + `$Def_DBLinkRef` 対応（フィールド単位の参照先明示）

## 目的

PastDivers/SemiPrimary の 六花 ルノ で、`BirthDay: { "_Jump": { "hashTag": "BirthDay" } }` が
未解決のままキャラシートに露出していた。原因はレコードルートの `_DBLink`（旧形式・マージ用）が
存在せず、`_Jump` の解決足場が無かったため。

対応方針として、`_Jump` の中に `$Def_DBLinkRef` 形式の `_DBLink` を明示できるようにした
（A案: 明示型。User 承認済み。B案の「レコード内 `*_DBLink` suffix の暗黙参照」は不採用）。

## 変更点の要約

### `lib/data-common.js`

- `EnrichmentProcessor.resolveJumpsWithDbLinkRefs()` を新規追加:
  - `{ "_Jump": { "hashTag", "_DBLink": { "_Work", "_DB", "<IndexKey>": <IndexValue> }, "_Search"? } }` を解決
  - 参照先特定は `resolveDbLinkSuffixRef()`（`$Def_DBLinkRef` 解決）を再利用（`isPrivate` 除外・ネストインデックス対応も共通）
  - `_DBLink` を除いた sanitized wrapper を `resolveJumpsInAny()` に渡して既存の置換ロジック（1件一致のみ採用）を再利用
  - 解決失敗時は元の `_Jump` ラッパーを維持（誤置換しない）
- `enrichRecords()` ステップ 1.75 として組み込み（ルート `_DBLink` 解決＝ステップ2 より前）
- `resolveJumpsInAny()` の `resolveJumpWrapper`: `jump._DBLink` を持つ wrapper はスキップ（ルート `_DBLink` パスでの二重解決・誤参照防止）

### `data/Works_PastDivers/DataBases/db_SemiPrimary.json`（六花 ルノ）

- `BirthDay._Jump` に `"_DBLink": { "_Work": "SinisterChangingGirls", "_DB": "Primary", "Drc": "E" }` を明示
- `AnotherRegions_DBLink` のインデックスキー誤り `"Num": "E"` → `"Drc": "E"` を修正
  （SinisterChangingGirls/Primary のインデックスは `Drc`。旧記述では suffix 解決が常に失敗していた）

### ドキュメント

- `docs/api-sw-spec.md` §8: enrich 順序に「自前 `_DBLink` 付き `_Jump` の解決」を追加、§8.1 を新設
- `docs/db-update-guidelines.md` §6: フィールド単位の参照先明示について追記
- `CHANGELOG.md`: 先頭にエントリ追加

## 影響範囲（編集したファイル）

- `lib/data-common.js`
- `data/Works_PastDivers/DataBases/db_SemiPrimary.json`
- `tests/enrich.dblink.jump.merge.test.js`（テスト2件追加）
- `docs/api-sw-spec.md` / `docs/db-update-guidelines.md` / `CHANGELOG.md`

## 検証

- `npm test`: 21 files / 154 tests passed（新規2件含む）
  - 成功系: 実データ（SinisterChangingGirls/Primary `Drc: "E"` の `BirthDay: { Day: { Month: 4, DayOfMonth: 7 } }`）への参照解決
  - 失敗系: 存在しないインデックス指定時に `_Jump` ラッパーを維持すること
- ブラウザ実機: `pages/characters.html?work=Works_PastDivers&db=SemiPrimary&idx=Junius.II&idxKey=Chronos.Lunar` で誕生日表示を確認

## 未完了タスク

- なし（`pkg/nodejs` には `_Jump` 実装自体が無いため同期不要）

---

# 追記（同日）: `$enrich` の null 入りネストインデックス対応

## 目的

SinisterChangingGirls/Primary「六花 雙葉」（Drc: `S`）の `AnotherRegions_DBLink` で
`$enrich` マージが機能していなかった。参照先 UnauthedLogica/Primary の雙葉レコードは
インデックスが `Model: { "LogicSeries": null, "Num": null }`（型番未確定）で、
`dbLinkSubsetMatch()` が null 値を一切マッチさせないため解決不能だった。

## 変更点の要約

- `lib/data-common.js`:
  - `dbLinkSubsetMatch()`: クエリ側 null を「レコード側も null/undefined」の明示マッチに変更
  - `dbLinkIndexHasNull()` 新規（ネスト対応の null 検出）
  - `resolveDbLinkSuffixRef()`: null 入りインデックスは 1 件一致のみ採用（曖昧一致・0件はスキップ）
- `data/Works_UnauthedLogica/DataBases/db_Primary.json`:
  - `AnotherRegions_DBLink` のインデックスキー誤り `"Num": "N"` / `"Num": "S"` → `"Drc": ...` を修正（2件）
- `tests/enrich.dblink.jump.merge.test.js`: 成功系＋曖昧一致スキップの2件追加
- `docs/api-sw-spec.md` §8.2 新設、`CHANGELOG.md` 追記

## 検証

- `npm test`: 21 files / 156 tests passed
- 実データで `Height_cm: 155` 等が雙葉（SCG側）へマージされ、既存値（`Age: 27`）は維持されることを確認

## 参考

- `docs/api-sw-spec.md` §8.2

## 参考

- `docs/api-sw-spec.md` §8.1
- 旧形式ルート `_DBLink` + `_Jump` の既存契約は維持（`tests/enrich.dblink.jump.merge.test.js` の既存テストで担保）

---

## 追記3（同日）: `*_DBLink` タグへのクロスワーク創作名併記

### 目的

`AnotherRegions_DBLink` 等の `*_DBLink` タグは「⇒ キャラ名」リンクのみで、
どの作品への参照か判別できなかった。参照先の創作名（作品タイトル）を併記する。

### 合意事項

- 併記は **クロスワーク参照のときのみ**（同一作品内の参照はノイズになるため出さない。User 選択）
- 和英モード対応: `lang=jp` → `Title_JP` 優先（全角括弧）、`lang=en` → `Title_EN` 優先（半角括弧）

### 変更点

- `pages/characters.js`: `relationApi.getWorkTitle(workKey, lang)` を追加
  （`fetchGlobalMeta()` キャッシュ経由で `CreationWorks.#Works_*.Title_JP/EN` を参照）
- `lib/section-renders/dblink.js`: render 内で `targetWork !== normalizeWorkKey(currentWorkId)` の
  場合のみ `.dblink-work` span を追加し、タイトルを非同期 hydrate（取得失敗時は無表示のまま）
- `pages/characters.sass` / `.css`: `.tag .dblink-work`（muted・11px）追加
- `pages/characters.html`: `asset-version` → `2026.07.02.1`

### 検証

- `npm test`: 21 files / 156 tests 全パス（回帰なし）
- CHANGELOG.md へエントリ追加済み
