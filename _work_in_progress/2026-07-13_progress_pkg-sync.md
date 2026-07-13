# pkg/ FS クライアントの本体 DB 機構追従 (2026-07-13)

## 目的

`pkg/` 配下のクライアントが、最近実装された DB 機能へ追従できているかを調査し、漏れを解消する。

## 背景・課題

`pkg/` は `lib/sw-common.js` / `lib/data-common.js` の**移植版**であり、本体側の変更に自動追従しない設計（`docs/pkg-client-libraries.md`）。
その前提に対し、追従漏れを検出する仕組み（テスト）が**1 本も存在しなかった**ため、実際に長期の追従漏れが発生していた。

最終更新日の調査結果:

| パッケージ       | 最終更新   | 状態                     |
| ---------------- | ---------- | ------------------------ |
| `pkg/cloudflare` | 2026-07-11 | 追従済み                 |
| `pkg/nodejs`     | 2026-06-22 | 3 週間の追従漏れ         |
| `pkg/python`     | 2026-06-02 | 6 週間の追従漏れ         |
| `pkg/csharp`     | 2026-06-02 | 6 週間の追従漏れ         |
| `pkg/mcp`        | 2026-06-02 | 6 週間の追従漏れ         |

## 検出した不具合（すべて実行して再現を確認）

### 1. 非公開制御のバイパス（実害あり）

`DB_Hidden: true` の DB が、一覧からは除外されるのに直接アクセスでは素通りしていた。

```
listDBs(FLInvestigator78)                        → Primary, PrimaryDealer   （隠しDBは除外 OK）
getRecords(FLInvestigator78, 'UnprocessedDealer') → 55 recs 取得できてしまう ✗
```

`docs/api-sw-spec.md` §5.3 / §5.4 は「リストと**直接アクセスの両方**から 404」が仕様。`Works_Hidden` も同じ穴だった。

### 2. `isPrivate` フィルタ順序（実害あり・**本体 SW にも同じ問題あり**）

`isPrivate` の除外が `_Commons` 適用**より前**に走っていたため、`_Secondaries[]._Commons.isPrivate: true` で
シリーズ単位に非公開指定されたレコードが公開されていた。

- 該当: NumberTales / Secondary の `0xFF(エフエフ)`（シリーズ「ヘキサデミカル・テールズ」）1 件
- レコード自身は `isPrivate` を宣言していないため、注入された値が誰にも読まれない状態だった
- `db_meta.json` 側では `_Secondaries[1]` / `_Secondaries[2]` の `_Commons.isPrivate: true` として非公開指定済み

### 3. JP/EN 命名の未追従（実害あり）

2026-06-22 の命名標準化（`Title` → `Title_JP`）が `pkg/nodejs` にしか入っておらず、
`pkg/python` / `pkg/csharp` の `list_works()` がタイトル・概要とも**空文字**を返していた。

### 4. `Works_Dir` オーバーライド未対応（2026-07-11 の共通資料）

`#Works_CommonReferences` が `listWorks()` には現れるのに、レコードを一切取得できなかった。

### 5. `$IndexDef` 未対応

`getRecord()` の索引キーが `'Num'` 決め打ちで、`Num` を持たない作品では常に `null` を返していた。

```
getRecord(FLInvestigator78, 'Primary', '1') → null  ✗（実際の索引は Card.Suit）
getRecord(ShouArRiders,     'Primary', '1') → null  ✗（実際の索引は BeastType.Beast）
```

## 実施した変更

- `pkg/nodejs/index.mjs` — コア実装。上記 1〜5 をすべて対応。`getIndexKey()` / `getWorkType()` / `CreationsDBNotFoundError` / `includeHidden` を新設
- `pkg/python/creationsdb/client.py` — 同等の API サーフェスへ追従（`__init__.py` の export も更新）
- `pkg/csharp/CreationsDBClient.cs` — 同上。`WorkDirResolver` を新設して `Works_Dir` 解決を集約
- `pkg/mcp/server.mjs` — Node.js クライアントを内部利用するため大半は自動追従。`idxKey` 既定値の撤廃と `get_index_key` ツール新設のみ
- `tests/pkg.nodejs.test.js`（新規、18 件）— 追従漏れを回帰として検出する網
- `docs/pkg-client-libraries.md` / `CHANGELOG.md` — 仕様と対応状況を反映

## 検証

- `npm test` 全件成功（29 ファイル / 289 件）。既存テストの退行なし
- Node.js / Python / C# の 3 クライアントが同一データに対し**同一結果**を返すことを実行確認
  - `includePrivate: false → 37 件 / true → 38 件`（3 クライアント一致）
  - インデックスキー解決も 3 クライアント一致（`Card.Suit` / `BeastType.Beast` / `Generation` / `Logic.LogicSeries`）
- C# は Newtonsoft.Json / System.Text.Json の**両バックエンドでビルド検証**（`.cache/csharp-verify/` に使い捨てプロジェクトを作成）
- MCP は SDK 未インストールのため構文チェックのみ（ハンドラは検証済みの Node.js クライアントへ委譲するだけ）

## 追記: 本体 SW / Cloudflare Workers も修正（User 判断により実施、2026-07-13）

上記「未完了 / User 判断待ち」として記録していた本体側の同一バグについて、User の判断（データ側の
`isPrivate: true` 宣言を尊重する = 選択肢 1）により修正を実施した。調査の過程で、当初の想定より
影響範囲が広いことが判明した。

### 追加で判明した問題

**`handleBootstrapEndpoint()` は非公開フィルタを一度も呼んでいなかった**（順序の問題ですらなかった）。

- `pages/sw.js:108` がこのエンドポイントを `includeRecords=true` の既定で呼ぶため、
  キャラシート UI が叩く `/pages/v1/bootstrap` は、レコード自身が `isPrivate: true` を
  宣言していても**全件そのまま配信**していた（VirtuesUs / SemiPrimary の 2 件が該当）
- 合計で 3 件（`_Commons` 由来 1 件 + 自己宣言 2 件）が公開されていた

**Cloudflare Workers 側の根本原因は `migrate.mjs` にあった**。

- `migrate.mjs:429` が D1 の `is_private` 列を**生レコード**から算出していた（`rec?.isPrivate ? 1 : 0`）
- そのため `_Commons` 由来の非公開指定が取りこぼされ、`records` の SQL フィルタ（`is_private = 0`）と
  **FTS5 検索インデックスの両方**に公開レコードとして投入されていた
- `worker.js` の `isPublicRecord()` は定義だけで**どこからも呼ばれていないデッドコード**だった
  （フィルタは完全に D1 のカラム頼み）

### 実施した修正

- **`lib/sw-common.js`**: 3 経路すべてで `filterPublicRecords()` を `applyCommonsToRecords()` の後へ。
  `handleBootstrapEndpoint()` にはフィルタを新規追加。メタ欠損時も自己宣言の `isPrivate` は
  尊重されるよう try/catch の外へ配置。
- **`pkg/cloudflare/scripts/migrate.mjs`**: `is_private` を `applyCommons()` 適用後の値から算出（根本修正）。
  実データで `is_private=1` が 2 件 → 3 件に是正。
- **`pkg/cloudflare/worker.js`**: `applyCommons()` / `isPublicRecord()` を named export 化して
  migrate.mjs から再利用（ロジックの二重実装を回避）。レコードを返す 4 経路すべてに
  post-commons フィルタを追加（古い D1 が残っていても漏らさない多層防御）。
  検索 2 経路が `_Commons` を適用していなかった不整合も是正。
- **`tests/private-commons-order.test.js`（新規、10 件）**: 修正前のコードへ戻すと 8 件が失敗することを
  確認済み（空テストでないことの検証）。

### 運用上の注意

Cloudflare 実 API へ反映するには **`scripts/migrate.mjs` の再実行（D1 再投入）が必要**。
再実行しなくても Worker 側の多層防御により非公開レコードは返らないが、FTS 検索インデックスには
残るため再実行を推奨する。

確認: `npm test` 全件成功（30 ファイル / 301 件）。`migrate.mjs --dry-run` 完走（475 件）。

## 未完了タスク / 既知の制限

- **`pkg/cloudflare/worker.js` の `_Secondaries` マッチャは簡略版のまま**（`sec_SeriesTitle` の
  完全一致のみ）。`lib/sw-common.js` と `pkg/` の FS クライアントは `sec_Category` / `sec_DesignedBy` を
  追加条件とするスコアリング方式に揃っているため、**ロジックが乖離している**。
  現行データでは非公開指定の 2 シリーズがいずれも `sec_SeriesTitle` を主キーとしているため
  今回の修正には影響しないが、将来 `sec_Category` 等で `_Commons` を分岐させると
  Workers 側だけ挙動が変わる。要追従（本件のスコープ外として未対応）。
- `pkg/python` / `pkg/csharp` には自動テストが無い（Vitest 管轄外）。同一 API サーフェスの担保は
  現状 `tests/pkg.nodejs.test.js` の期待値に対する**手動追従**に依存している
- `_DBLink` / `_Jump` の参照解決 enrich は引き続き未対応（Cloudflare Workers 版と同じスコープ。次フェーズ）

## 参考

- `docs/pkg-client-libraries.md` — 対応する DB 機構の一覧（今回追記）
- `docs/api-sw-spec.md` §5.3 / §5.4 — `Works_Hidden` / `DB_Hidden` の仕様
- `pkg/cloudflare/scripts/migrate.mjs` の `resolveIdxKey()` — インデックスキー導出規則の正典
