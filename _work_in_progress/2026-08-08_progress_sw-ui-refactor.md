# API / SW / UI リファクタリング（2026-08-08）

- **ブランチ**: `refactor/sw-ui-cleanup`（`develop` から作成）
- **ローカル環境**: `main`（本体ローカル）
- **状態**: 実装・自動テスト完了。**ブラウザ実地確認が未実施**（下記「未完了タスク」）

> **担当分けについて**: `README.LOCAL.md` の `## 作業分担`（2026-08-02 更新）では `main` は
> 「相関図ページの実装」担当。本作業は担当外にあたるため User の合意を得て着手した。
> 着手時点で `feature/relations-tri-grid` は `develop` と差分ゼロ（`git rev-list --left-right --count` が `0 0`）で、
> 相関図作業との衝突は無い状態だった。

---

## 目的

`lib/` `pages/` `api/` `svc/` の JS を対象に、**機能追加ではなく削除・統合で解消できる負債**を処理する。
挙動変更は 404 バグの修正 1 点のみで、それ以外は純粋な構造整理。

---

## 変更点の要約

### Phase 1 — デッドコード削除（-631 行）

| ファイル | 実態 |
| --- | --- |
| `lib/frontend-common.js` | 619 行。`ServiceWorkerManager` / `ApiClient` / `DOMUtils` / `URLUtils` / `DebounceManager` / `StorageManager` を `window` へ生やすが、**リポジトリ全体で import 元ゼロ**。ロード時に `console.log` する副作用付き |
| `pages/characters_final.js` | 12 行。どの HTML からも読まれておらず、モジュールスコープに存在しない `main()` を呼ぶ壊れた残骸 |

`AGENTS.md` のディレクトリ図からも `characters_final.js` を除去し、`npm run agents:build` で
`.github/copilot-instructions.md` を再生成した。

### Phase 2 — SW 入口 3 本の統合と 404 バグ修正

`api/sw.js` と `svc/sw.js` は、識別子を正規化した diff で**コメントとラベル文字列以外に差が無かった**。
`pages/sw.js` もルート表が同一で、実際の差は 3 点のみ。

実装を `lib/sw-common.js` の **`StandardServiceWorker`** へ集約した。

- `api/sw.js` 150 → **29 行**
- `svc/sw.js` 151 → **29 行**
- `pages/sw.js` 245 → **115 行**（`/pages/v1/enrich` のみ残る）

**bugfix（唯一の挙動変更）**: `StandardEndpointHandlers.handleAdvancedEndpoints()` は未処理時に `null` を返すが、
`api/sw.js` / `svc/sw.js` はそれをそのまま return していたため `event.respondWith(null)` となり、
未知パスが **404 JSON ではなくネットワークエラー**になっていた。共通ルート表の末尾で
`ResponseUtils.notFound()` へフォールバックさせて解消。

あわせて `handleWorkVarsdefEndpoint()` の不正 `works` 400 検証を共通側へ引き上げた
（従来は `pages/sw.js` の override 側にしか無く、api/svc は `workId = null` のまま進んでいた）。

### Phase 3 — `replaceChildren()` の native 化

`pages/relations.js` の手書き DOM ループを native の `Element.replaceChildren()` へ委譲。
native は文字列を自動でテキストノード化するため `createTextNode` は不要。
呼び出し側が `cond ? el(...) : null` を渡すのでフィルタだけ残した。

### Phase 4 — `formatValueForDisplay` の分解（1211 → 792 行）

内部クロージャのうち **モジュールスコープへ移せるもの 18 本** を巻き上げ、
呼び出し側には 1 行のアダプタだけを残した（内部の呼び出し箇所は無改修）。

- **純粋（外部状態を一切参照しない）10 本**: `toEnglishOrdinal` / `schemaTypeIncludes` /
  `pickEnumNameFromSchemaType` / `findNestedKey` / `normalizeEnumFormat` / `formatSearchPairs` /
  `pickAboutByLang` / `formatEnumCodeWithAbout` / `readListLinkDisplayOpt` / `applyDisplayUnit`
- **文脈を引数化した 8 本**: `listAvailableEnumNamesOf` / `resolveEnumKeyFromDefType` /
  `resolveListLinkItemFromMeta` / `pickEnumFormat` / `formatJumpValue` / `formatMaskedValue` /
  `formatRankValue` / `extractEnumValueParts`

**デッドコード（約 90 行）**:

- `extractRankParts` … 参照ゼロ。`extractEnumParts` と同一ロジックで、返すプロパティ名が
  `rank` か `code` かだけの違いだった
- `resolveTypeDefEntries → getRoleEntries → getRoleRawValues → pickRoleRawValue` …
  互いにしか参照されない閉じた連鎖で、外部の利用者が居ない
- 内部の `isPlainObject` … L463 のモジュール版と同一（同 L463 の注釈自体が
  「トップレベル helper でも使うため、関数ローカルではなく共通位置に置く」と宣言している）

### Phase 5 — `renderDetail` の前段抽出（2066 → 1950 行）

**切る位置は「境界を跨ぐ変数の数」を実測して決めた。**

| 境界 | 跨ぐ変数 | 扱い |
| --- | --- | --- |
| メタ/typedef 読込 + map 構築 の直後 | **12** | 抽出した |
| 画像セクション の直後 | **14** | 抽出した |
| 和英/alt 整形 の直後 | 20 | 据え置き |
| タイトル行 の直後 | 21 | 据え置き |
| basicFields 解決 の直後 | 27 | 据え置き |
| schema 解決ヘルパー の直後 | 38 | 据え置き |
| バケット分類 の直後 | 32 | 据え置き |
| セクション renderer の直後 | 20 | 据え置き |

薄い継ぎ目は前半 2 箇所だけだったため、そこだけを抽出した。

- `loadDetailRenderContext()` … typedef / meta の並列取得、`DB_Layer` の shared / work-local 合流、
  `metaForLookup` 合成、label / type / display マップ構築。**DOM に触れない**ので描画順に依存せず単体で追える
- `buildDetailImageSection()` … ポスター + 画像ギャラリーの組み立て

**デッドコード**: `normalizedBasicFieldKeySet` / `schemaKeySet`（構築のみで参照ゼロ）、
`otherRows`（行を組んだあと DOM へ入れていなかった。`AGENTS.md`「表示完結の原則」により
schema 外項目は自動表示しないのが正なので、受け皿の `sectionBuckets.other` は残し、
捨てられる行の構築だけを削除）、`isPlainObject` ×3 と `schemaTypeIncludes` ×1 の shadow 定義。

---

## 合意事項・判断の記録

### 撤回した見立て（重要）

計画段階で「クロージャの毎回再生成が一覧描画のボトルネック」と書いたが、**これは誤りだったので撤回する**。
最大 DB（`db_UnprocessedSecondary.json` = 795 レコード）の一覧描画 1 回相当（795 × 約 3 呼び出し = 2400 回）で
クロージャ生成コストを実測したところ **約 0.43ms** にすぎず、DOM 描画に対して無視できる
（`.cache/bench-closures.mjs`）。よって本リファクタの目的は**可読性に限定**し、
密結合部の機械的な分解は行わなかった。

### 「統合しない」と判断したもの

計画では `lib/dom-common.js` を新設して統合する予定だったが、調査の結果いずれも見送った。

- **`el()`** … `characters.js` 版は `TRUSTED_EL_NODES` による XSS ガードを持ち、`el()` 生成物以外の
  Node を意図的に append しない。`relations.js` 版は許容側。どちらへ寄せても
  「**ガードを外す**」か「**ノードが黙って消える**」かのどちらかになる。相関図は実装が進行中でもあり触らない
- **`isSecondaryDbName()`** … `characters.js` は部分一致 + `semiprimary` 除外、`relations.js` は
  3 名の完全一致（`SECONDARY_DB_RE`）。現行データでは同結果だが意味論が異なる
- **言語ヘルパー** … 別の localStorage キーと別の別名許容範囲（`characters.js` は `ja`/`jpn`/`eng`/`bilingual` も受ける）
  を持つ。統合は仕様判断が要る
- **`isPlainObject()` の 8 実装** … いずれも 1〜3 行。共有モジュールを新設しても純減しない

### 触らないと確認したもの

- **`lib/sw-common.js` と `lib/data-common.js` の同名関数 4 個**
  （`resolveWorkDirName` / `isPublicRecord` / `filterPublicRecords` / `getCharacterValueWrapperRegistry`）。
  `data-common.js` は 10 本以上のテストから**単体 import** されるため自己完結が必要で、
  `tests/legacy-work-alias.test.js` が「importScripts 順により data-common 側が後勝ちする」挙動を
  明文化している。統合すると Node 単体実行が壊れる

---

## 影響範囲（編集したファイル）

**コード**

- `lib/sw-common.js`（`StandardServiceWorker` 追加 / 404 フォールバック / 400 検証の引き上げ）
- `api/sw.js` / `svc/sw.js` / `pages/sw.js`
- `pages/characters.js`
- `pages/relations.js`
- 削除: `lib/frontend-common.js` / `pages/characters_final.js`

**テスト**

- 新規 `tests/sw.routing.test.js`（8 件）
- 新規 `tests/pages.characters.value-format.test.js`（27 件）
- `tests/faction.render.test.js`（下記「作業前に見つかった既存の赤」）

**ドキュメント / メタ**

- `AGENTS.md`（ディレクトリ図）→ `npm run agents:build` で `.github/copilot-instructions.md` 再生成
- `docs/api-sw-spec.md` §1.1 新設
- `docs/implementation-playbook.md` §2.2 に入口ファイルの判断基準を追記
- `CHANGELOG.md`
- `pages/characters.html` / `pages/relations.html` の `asset-version` → `2026.08.08.1`
- `_work_in_progress/2026-08-02_progress_relations-graph.md`（`frontend-common.js` の項目を解決済みへ）

---

## 作業前に見つかった既存の赤（本作業とは無関係）

着手時のベースラインで `tests/faction.render.test.js` が 1 件落ちていた（1115/1116）。

- **原因**: 本作業の直前のコミット `9938762`「DB推敲(辞書解説周り)」（同日 11:37）が
  `data/Dictionaries/dict_Faction.json` の **管理主** 行から `BaseAreaAbout_JP` / `BaseAreaAbout_EN` を
  意図的に削除したが、テスト側が旧値を期待したままだった。描画ロジックは正しく動いている
- **対応**: `AGENTS.md`「データ更新時のテスト追従」に沿ってテストをデータへ追従させた。
  ただし期待値を消すとテストの意図（辞書行の補足解決）ごと消えるため、**補足が残っている
  デウスマキナ 行へ対象を差し替え**てカバレッジを維持した

---

## 検証

### 自動テスト（実施済み）

```
npm.cmd test              → 65 ファイル / 1151 件すべて成功
npm.cmd run agents:check  → 緑
npm.cmd run data:order:check → 緑
```

内訳の変化: 着手時 63 ファイル / 1116 件（うち 1 件が既存の赤）→ 65 ファイル / 1151 件（赤ゼロ）。

### 404 バグ修正の裏取り（実施済み）

`tests/sw.routing.test.js` を一時的に旧挙動（`handleAdvancedEndpoints()` の結果をそのまま return）へ
戻して実行し、**3 件が落ちる**ことを確認したうえで修正版へ戻した。テストが実際にバグを捕まえる状態になっている。

---

## 未完了タスク

**ブラウザ実地確認が未実施。** 自動テストは jsdom 上の `renderDetail()` までで、
Service Worker の実登録とブラウザ描画は検証できていない。ローカル HTTP サーバー
（例: `python -m http.server` / Live Server）で以下を確認すること。

### SW / API

```
/pages/v1/works        /svc/v1/works        /api/v1/works
/pages/v1/works/NumberTales/db/Primary?enrich=1
/api/v1/works/NumberTales/db/Primary            → enrich なし（opt-in）であること
/api/v1/bogus                                    → 404 JSON が返ること（修正点）
/api/v1/works/bad-name!/varsdef                  → 400 が返ること（検証の引き上げ）
```

3 スコープとも SW が再登録されること（`CACHE_NAME` は変更していないが、
入口ファイルのバイト列が変わるためブラウザは更新を検知するはず）。

### キャラシート

```
?c=NumberTales/Primary/Num:57
?c=FLInvestigator78/Primary/Card.Num:7        # 複合 Index
?c=SinisterChangingGirls/Primary/Drc:SW       # Calling 表示
?c=NumberTales/Primary&q=狐                    # 検索経路
```

基本情報テーブル・画像ギャラリー・各セクション・相関表示に回帰が無いこと。
言語切替（jp / en / mix）の往復も確認すること
（Phase 4 で単位付与・enum 表示形式・hideText 解決の実装位置を動かしているため）。

### 相関図

`pages/relations.html` を開き、`replaceChildren()` の native 化でインスペクタ・
パンくず・統計・診断パネルの描画が壊れていないこと。

---

## 参考リンク

- [`docs/api-sw-spec.md`](../docs/api-sw-spec.md) §1.1 — `StandardServiceWorker` とスコープ差
- [`docs/implementation-playbook.md`](../docs/implementation-playbook.md) §2.2 — API / SW 修正の判断基準
- [`AGENTS.md`](../AGENTS.md) — 正典（SSOT）
- [`2026-08-02_progress_relations-graph.md`](./2026-08-02_progress_relations-graph.md) — `frontend-common.js` の初出
