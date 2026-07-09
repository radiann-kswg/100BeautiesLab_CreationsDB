# 2026-07-09 progress: cross-work DBLink explicit-empty audit

## 目的

cross-work の `_DBLink` / `*_DBLink` 参照について、参照元レコードが空配列・`null`・空文字を**明示**しているフィールドを、参照先の値で意図せず補完していないかを全作品横断で監査する。

## 変更点の要約

- `lib/data-common.js` の `mergeFromLinkedRecord()` を調整。
- cross-work マージ時、参照元レコードが明示的に持つ primary フィールドは、値が空でも参照元を優先するよう維持。
- さらに `$alt` で primary にぶら下がる代替キー（例: `CodeName_*` に対する `SPCodeName_*`）も、primary 側が明示されている場合は cross-work から持ち込まないようにした。
- cross-work マージ時、`isForSecondary` が現在の DB 文脈と合わない field は取り込まないまま維持。
- `data/Works_FLInvestigator78/DataBases/db_meta.json` は User 側の差し戻し状態を尊重し、`#DB_PrimaryDealer._Commons` への追加は残していない。
- 監査用に `.cache/audit-crosswork-dblinkref.cjs` を作成し、全作品・全DBを対象に「明示空値が enrich 後に変化するケース」を再走査した。

## 監査結果

### 修正前に検出して解消したケース

- `Works_FLInvestigator78 / PrimaryDealer`
  - 錦野舞 / 錦野歌嫁の `Class: []` が cross-work `AnotherRegions_DBLink` に引っ張られ、意図しない表示につながるケース。
  - `RelationTo_Primary` のような文脈不一致 field が混入するケース。
- `Works_UnauthedLogica / Primary`
  - 千歳 玲 / 千歳 励の `CodeName_JP: null`, `CodeName_EN: null` が、cross-work 先の `SPCodeName_*` から `$alt` 経由で補完されるケース。

### 修正後の横断結果

- 全作品・全DBを対象に再監査し、**該当 0 件**を確認。
- 監査条件:
  - cross-work 参照を持つレコード
  - 参照元が top-level に `null` / `""` / `[]` を明示しているキー
  - enrich 後にそのキーの値が変化したもの

## 影響範囲

- `lib/data-common.js`
- `tests/enrich.dblink.jump.merge.test.js`
- `._cache/audit-crosswork-dblinkref.cjs`（監査補助・Git 管理外想定）

## 検証

- `tests/enrich.dblink.jump.merge.test.js` : 22 passed
- `.cache/audit-crosswork-dblinkref.cjs` : `count = 0`
- ブラウザ表示確認:
  - FLInvestigator78 / PrimaryDealer / 錦野舞
  - `原作との関係` 非表示
  - `Class: []` は空のまま扱われ、追加補完なし

## 未完了タスク

- 現時点ではなし。
- 今後、明示空値の対象を top-level 以外（ネスト object 内の field）まで広げて監査したい場合は、監査スクリプトを拡張する。

## 参考リンク

- `docs/api-sw-spec.md`
- `docs/implementation-playbook.md`
- `tests/enrich.dblink.jump.merge.test.js`
