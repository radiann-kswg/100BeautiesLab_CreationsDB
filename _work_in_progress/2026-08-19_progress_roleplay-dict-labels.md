# 2026-08-19 進捗: キー順整列の追従とロールプレイ生成の辞書ラベル解決

## 目的

直近の DB 更新（`3bd3eb5` DB構想追加 / `8829fae` DB構造整備 bugfix）で発生した 2 件を解消する。

1. `tests/data.field-order.test.js` の 4 件失敗（レコードのキー順が `$DefType` 正準順からズレた）
2. ロールプレイプロンプト生成物への「浸食」（辞書ラベルが未解決のまま出ていた）

## 変更点の要約

### 1. キー順整列（ツール実行のみ、コード変更なし）

- `data/db_type.json` の宣言順は `sec_SeriesTitle` → `sec_Category` → `sec_DesignedBy`。
  実データ 6 レコード（`db_Secondary.json` 4 / `db_SelfSecondary.json` 2）が逆順だった。
- `npm run data:order:write` で整列。順序の正は typedef 側なのでデータを追従させる形（テスト期待値は変えない）。

### 2. ロールプレイ生成の辞書ラベル解決（実バグ 2 件）

| 現象 | 原因 | 修正 |
| --- | --- | --- |
| `1桁番(ユニデジッツ)` → `1桁番` と読みが落ちる | `dict_Class.json` がコード（`Class`）と表示名（`Class_JP`）を分離したのに、テンプレが `{{Class}}`（レコードの生値）を直出ししていた | 合成変数 `@Class` を追加し、テンプレ 3 件を `{{@Class}}` へ |
| 所属 2 件が `セブンティエイト特殊探偵団,第三県立技巧美術女子高校` になる | `TypeResolver.resolveVarsDefLabel()` はスカラ専用（内部で `String(rawValue)`）。配列を渡すと `Array.prototype.toString()` で `"A,B"` という辞書に無いコードになり、未解決のまま通る | `resolveDictLabels()` を build 側へ追加し、1 要素ずつ解決して `、` 連結 |

副次的な差分（意図的）:

- 複数 `Class` の連結が ASCII `, ` → `、` へ統一（`render.mjs` の配列 join を経由しなくなったため）。
- 辞書を引くようになったことで `最高経営所長` → `CEO(最高経営所長)` のような表示名も反映される。

**修正対象外（意図して手を入れていない）**: 呼称 DSL の出力（`キミ,名前呼び` 等）と
DB の自由記述内の ASCII カンマは従来からの表記で、今回のリグレッションとは無関係のためそのまま。

## 影響範囲

- `tools/build-roleplay-prompts.mjs` … `buildVars()` へ `resolveDictLabels()` を追加、`vars.Belonging` を差し替え、`vars.Class` を新設
- `data/Works_{NumberTales,FLInvestigator78,DestinyFoxRecords}/RoleplayPrompts/roleplay-prompt.tpl.md` … `{{Class}}` → `{{@Class}}`
- `data/Works_NumberTales/DataBases/db_{Secondary,SelfSecondary}.json` … キー順整列（6 レコード）
- 生成物 `data/Works_*/RoleplayPrompts/**/roleplay-prompt-*.md` … 26 件を再生成（見出しアンカーマージ）
- `tests/data.roleplay-prompts.test.js` … 回帰テスト `describe('辞書コードのラベル解決')` を追加
- `docs/roleplay-prompt-generation.md` / `CHANGELOG.md` … 仕様を同期

## 検証

- `npm test` … 69 files / 1243 tests 全パス
- `npm run data:order:check` … 差分 0
- `npm run roleplay:plan` … 再実行で `changed=0`（冪等）
- 回帰テストの実効性確認 … 修正前の実装へ戻すと 2 件とも failすることを確認済み

## 未完了タスク

- なし（`--lang=en` の英語生成は従来どおりフェーズ4の未着手項目）。

## 参考

- `docs/roleplay-prompt-generation.md`（合成変数・辞書ラベル解決の節）
- `docs/schema-meta-processing.md`（`$VarsDef` 合成 / `$dict` 宣言）
