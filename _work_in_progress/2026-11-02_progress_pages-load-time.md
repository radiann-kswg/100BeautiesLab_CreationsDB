# 2026-11-02 GitHub Pages のページロード時間短縮（約 5 秒 → 1 秒未満を目標）

> 作業環境: `main`（本体ローカル）/ ブランチは着手時のものを継続。`/ponytail` + `/grilling` で要件を詰めて合意済み。

## 目的

本番（`database.numbertales-radiann.net`）のキャラシートが 1 ページ約 5 秒かかっていたのを、
**2 回目以降（SW がページを制御している通常状態）で 1 秒未満**にする。
初回訪問は SW の登録・install・claim が構造的に入るため「できるだけ短く（目標 2 秒前後）」のベストエフォート。

## 合意事項（`/grilling` ラウンド 1・2026-11-02）

| # | 決定 |
| --- | --- |
| Q1 | 必達は「2 回目以降」。デプロイ直後はそれに準じる。初回はベストエフォート |
| Q2 | **(A)** ブラウザ HTTP キャッシュに従う（`no-store` をやめる）＋ SW 内の同一 URL 同時要求の束ね。push 後最大 10 分の旧データ表示は許容（HTML / JS と同じルール）。1 秒を切れなければ **(B)** Cache API の stale-while-revalidate へ段階昇格 |
| Q3 | `ensureApiSW()` の `reg.update()` を await しない（初回短縮）。SW を介さない直読み経路は作らない |
| Q4 | `characters.html` / `relations.html` の両方が対象。修正は共通 `lib/sw-common.js` に入るので 3 SW 全部に効く |
| Q5 | 受け入れ基準: 本番 `?c=NumberTales/Primary`（公開 DB で最重量）と `relations.html`、2 回目以降、コンソール `🎉 Application initialization complete in Nms` が **1000ms 未満**。回帰防止は Vitest（同一ロード内で同じ `data/**` JSON を SW が 2 回以上取りに行かない） |
| Q6 | JS モジュールの bundle 化はしない（YAGNI。キャッシュ済みなら 300ms 以下） |
| Q7 | Cloudflare エッジキャッシュ（Cache Rule）は今回スコープ外。(A) で足りないときの控え |

残っていた細則の既定（User へ提示済み・異議なし）:
リセットボタンは SW・Cache API のみ消去（HTTP キャッシュは JS から消せないため「最大 10 分で自然更新」を docs に明記）／
束ねるのは **レスポンス本文の文字列**まで（レコード本体の `_Commons` in-place 適用が混ざらないよう利用側ごとに `JSON.parse`）／
in-memory TTL（`WORK_CTX_TTL_MS` 15 秒）は延長しない。

## 着手前の実測（本番・修正前）

| シナリオ | 所要時間 | 内訳 |
| --- | --- | --- |
| 初回訪問（SW 未登録） | **17 秒** | SW 登録 4.4s（`reg.update()` 待ち含む）＋ API 3 本が各約 4 秒 |
| 2 回目以降・`NumberTales/SemiPrimary`（60 件） | **1.5 秒** | API 直列 3 本 = 300 / 590 / 600ms |
| 2 回目以降・`NumberTales/Primary`（105 件） | **4〜11 秒** | SW 発ネットワーク要求 **149〜158 本** |
| ローカル（`127.0.0.1:5500`・Live Server） | 0.8 秒 | 参考値 |

149 本の内訳: 辞書 21 ファイル × 各 4 回、`db_Primary.json`（1.6MB / gzip 387KB）× 3 回、`data/db_meta.json` × 4 回。
根本原因は `DataFetcher.fetchJSON()` / `fileExists()` の `cache: 'no-store'` と、メモ化が 1 API リクエスト内に閉じていたこと。
GitHub Pages 側は `Cache-Control: max-age=600` + ETag + gzip を返しているのに、全部捨てていた。
`renderList()` の描画・JS モジュール 41 本の配信はボトルネックではなかった。

## 変更点の要約

- `lib/sw-common.js`
  - モジュールレベル `INFLIGHT_FETCH`（url → Promise<{ok, status, text}>）を追加
  - `DataFetcher._fetchTextShared(url)`: `fetch` の `cache` モードを既定に戻し、進行中の同一 URL を 1 本へ束ねる。本文文字列だけを共有
  - `fetchJSON()` は `_fetchTextShared` 経由で `JSON.parse`、`fileExists()` の HEAD からも `no-store` を外す
- `lib/page-api-bridge.js`: `ensureApiSW()` の 3 経路すべてで `reg.update()` を await せず投げっぱなしに
- `pages/characters.js`: `page-api-bridge.js?v=2026.11.02.1`／`pages/characters.html`: `asset-version` を `2026.11.02.1`
- `tests/sw.datafetcher-memo.test.js`: モックを `text()` 経由へ、スコープ跨ぎの束ね・本体別オブジェクト・`no-store` 不使用の 3 テスト追加
- `docs/api-sw-spec.md` §2.2 新設、`CHANGELOG.md` 追記

## 検証

- `npm test`（Vitest）: **77 ファイル / 1427 件すべて成功**（2026-11-02 09:30）
- ローカル（Live Server・修正後 SW）: 初期化 **0.53 秒**（warm）。Live Server は `max-age=0` で毎回 304 再検証になるため、
  これは「全ファイルがキャッシュ命中したときの CPU 側コスト」の近似値
- Playwright のルーティングで SW の `importScripts` を差し替えるデプロイ前計測は固まるため断念（本番はデプロイ後に実測）

### 本番実測（修正後・2026-11-02 09:58〜10:05 JST デプロイ直後）

| シナリオ | 修正前 | 修正後 |
| --- | --- | --- |
| `characters.html?c=NumberTales/Primary` 初回訪問（SW 未登録） | 17 秒 | **2.4 秒**（SW 登録 1.46s ＋ API 266 / 279 / 323ms） |
| 同・2 回目以降（10 分以内） | 4〜11 秒 | **`🎉 Application initialization complete in 855〜896ms`**（3 回計測）。SW 発 135〜227 応答はすべて 15ms 未満＝HTTP キャッシュ命中 |
| `relations.html?r=NTS` 2 回目以降（10 分以内） | 未計測（SW 発 359 要求が全部ネットワークだったので数秒〜十数秒と推定） | **1.3〜1.4 秒**。うち `/pages/v1/bootstrap` が 1.0〜1.1 秒。359 応答は全部キャッシュ命中なので残りは SW 内の CPU（全作品 × 全 DB の JSON パース・`_DBLink` 解決） |

- 受け入れ基準（Q5）: **characters は達成**（< 1000ms）。**relations は未達**（1.3s）。relations の残りはネットワークではなく
  `handleBootstrapEndpoint()` の CPU コストで、`resolveCache` が DB ごとのループ内で作り直されている既知の課題
  （`docs/api-sw-spec.md` §2.1 末尾）に由来する。別タスクとして扱う
- 副産物: URL を `https://database.numbertales-radiann.net//pages/characters.html`（スラッシュ 2 連）で開くと
  `new URL('./', location.href).pathname` が `//pages/` になり、SW の scope が `https://pages` と解釈されて
  `SecurityError` で登録失敗する（本件とは無関係の既存挙動。修正するなら scope / sw.js URL の連続スラッシュ正規化）

### 10 分超の再訪（(A) のみ・本番 01:10 UTC）→ **10.1 秒に逆戻り**

最初のキャッシュ充填（00:58 UTC）から 10 分待って再訪したところ、`/works` 4398ms・`/db/Primary` 1818ms・合計 **10.1 秒**。
`max-age=600` が切れると SW が条件付き要求（304）を**直列に 45 本以上**出すため、HTTP キャッシュ任せでは 10 分以内しか効かない。
机上見込み（1.5〜2 秒）より悪かったのは、`/works` が作品ごとにメタ読み → HEAD と直列に回る構造のため。

→ 合意済みの段階昇格どおり **Q2 (B)** を実装。

## フェーズ 2: Cache API の stale-while-revalidate（Q2 (B)・2026-11-02 10:10〜）

- `lib/sw-common.js` `DataFetcher`
  - `_fetchTextShared()`: Cache API（既存の `CACHE_NAME` = `100bl-api-v1`。`precache()` の `db_meta.json` と同じ箱）に本文があれば即返し、
    無ければネットワーク → 200 を保存（404 は保存しない）
  - `_revalidateInBackground()`: 命中時に裏で `fetch(url, { cache: 'no-cache' })` → 差し替え。SW 生存中は URL ごとに 1 回（`REVALIDATED_URLS`）。
    `no-cache` にしたのは、既定モードだと `max-age` 内の HTTP キャッシュの旧コピーを保存し直して push 後の反映が遅れるため
  - `fileExists()`: 本文がキャッシュ済みなら HEAD を省く
  - `_openDataCache()`: `caches` が無い環境（Node / Vitest）では null → 従来どおりネットワークだけ
- `tests/sw.datafetcher-memo.test.js`: Cache API の最小フェイク（`match` / `put`）を注入し、未命中→保存 / 404 非保存 / 命中→即返し＋裏で 1 回だけ再取得（`no-cache`）/ HEAD 省略の 5 ケース追加
- `docs/api-sw-spec.md` §2.2 を 3 層（in-flight 束ね → Cache API SWR → HTTP キャッシュ）の説明に書き換え。`CHANGELOG.md` に別エントリ追加

### 検証（フェーズ 2）

- `npm test`: **77 ファイル / 1432 件すべて成功**（10:17）
- 開発環境（Live Server・127.0.0.1:5500、User が本番と並べて起動）:

| ロード | JSON GET | JSON HEAD | 備考 |
| --- | --- | --- | --- |
| cold（SW 登録 + Cache API 空） | 57 | 8 | Cache API に 55 件保存されることを `caches.open().keys()` で確認 |
| warm（2 回目以降） | **0** | 5 | HEAD 5 本は本文未キャッシュの DB（SemiPrimary 等）の存在確認。残り 96 本は一覧サムネイル画像（SW の画像フォールバック経路。初期化をブロックしない） |
| ページ内から `/pages/v1/works` を叩き直し | 0 | 0 | 36ms で応答（(A) 時点は 70〜110ms） |

- Cache API に本文がある限り経過時間に関係なく JSON のネットワーク要求は 0 なので、「10 分超の再訪」も warm と同じ経路になる
- SW 再起動後の裏再取得（`REVALIDATED_URLS` が空に戻る経路）は 45 秒待っても SW が落ちず観測できなかった（Playwright 接続中は Chrome が SW を生かし続ける模様）。ロジックは単体テストで固定

## フェーズ 3: CPU コスト削減（2026-11-02 10:25〜）

(B) デプロイ後、ネットワークがゼロになった状態の残り時間を CPU プロファイル（ページ側: CDP `Profiler`、SW 側: `.cache/bench-bootstrap.mjs` で lib 一式を Node vm に読み `--cpu-prof`）で追った。

| 見つかった重さ | 対処 |
| --- | --- |
| 一覧描画 814ms のうち、`findNestedKey` 160ms + `findDictNameInSchema` 85ms（レコード × field の回数だけスキーマ木を再帰探索） | `lib/basic-renders/type-common.js` で IIFE スコープへ出し、探索ルート × キーで `WeakMap` メモ化 |
| `getWorkIndexAliasDefs` 71ms + `RegExp #Index\b` 32ms（レコードごと） | 直近 1 件メモ（indexDef / 両 typedef の同一性） |
| `getQS` 36ms + `URLSearchParams` 32ms（言語判定のたびに呼ばれる） | `location.search` 単位でメモ化（戻り値は浅いコピー） |
| SW `bootstrap` 1.0s: `JSON.parse` 約 420ms（`db_Primary.json` 1.6MB を 8 回）+ `resolveAllInAny` の await 付き深いコピー | `DataFetcher.readDBShared()`（読み取り専用・スコープ内メモ）を参照先ルックアップに使い、取り出した 1 件は `cloneLinkedRecord()` で切り離す。`resolveAllInAny()` は参照キーが無ければそのまま返す（実データに `#` 始まり × 文字列値のキーは 0 件） |

### 検証（フェーズ 3・開発環境・キャッシュ全命中）

| ページ | 前 | 後 |
| --- | --- | --- |
| `characters.html?c=NumberTales/Primary` 初期化（`🎉`） | 1243ms（一覧描画 814ms） | **525ms**（一覧描画 270ms） |
| `relations.html?r=NTS` 表示まで | 1384ms（`bootstrap` 1056ms） | **673ms**（`bootstrap` 374〜425ms） |
| Node 計測 `bootstrap` | 1046ms（DB 各ファイル 3〜9 回パース） | 543ms（各 2 回 = 主読込 + 共有 1 回） |

- `npm test`: **78 ファイル / 1435 件成功**（`tests/data-common.reference-resolver.test.js` 新規）
- 途中、Live Server がファイル書き込み途中の `data-common.js` を SW へ配った瞬間に `db/Primary` が 1 回 500 を返した（再現せず。直後の 4 回連続呼び出しは全て 200）

### 観測した配信上の注意（Cloudflare）

- 本番 `lib/*.js` は Cloudflare エッジでキャッシュされ（`cf-cache-status: HIT`）、ブラウザ向け `Cache-Control` も `max-age=14400`（4 時間）に書き換わっている。
  origin（GitHub Pages）は `max-age=600`。SW が `importScripts` する `lib/` は URL に `?v=` が付かないため、**デプロイした SW コードが利用者に届くまで最大 4 時間**（エッジ TTL + ブラウザ TTL）かかり得る。
  `?v=` 付きで読む `characters.js` / `page-api-bridge.js` は即時。対策はインフラ側（Cache Rule で `/lib/*` の TTL を origin 追従にする、またはデプロイ後にパージ）。Q7 のスコープ外として申し送り

## 未完了タスク

- [ ] **(B)+(フェーズ 3) のデプロイ後の本番実測**: cold（SW 登録し直し）→ 10 分以上空けて warm で `🎉 ... < 1000ms` を確認。`relations.html` も同条件で
- [ ] Cloudflare のエッジ / ブラウザ TTL（`/lib/*.js` 4 時間）の扱い（User 判断。インフラ設定）
- [ ] 連続スラッシュ URL（`//pages/characters.html`）で SW scope が `https://pages` になり登録失敗する既存挙動。直すなら `ensureApiSW()` で scope / sw.js URL を正規化（別タスク・要否は User 判断）

## 参考

- `docs/api-sw-spec.md` §2.1（リクエストスコープのメモ化）/ §2.2（本件）
- 計測用の一時出力は `.cache/perf-probe*.txt` / `.cache/test_*.txt`（Git 管轄外）

## 下流への波及（2026-11-02）

- 中流 `JsonCharacterDB-Framework`: `sync:update`（`e0dd24f` → `2663133`。10/28 の相関図 `$alt` 対応 3 件を同梱）→ merge。
  コンフリクト 0 / 52 files 776 tests green
- 下流 `RadianNs_SecondaryWorksDB`: 中流ローカル `develop`（`786d268`）を `--no-fetch --ref` で同期 → merge。
  6 件（高速化分のみ）/ コンフリクト 0 / 28 files 251 tests green
- 両リポジトリとも `git push origin develop` 済み（中流 → 下流の順。中流は Dependabot 更新 6 件を先に merge）。
  GitHub 基準の `sync:check` は両方 0 件。詳細は各リポジトリの `_work_in_progress/2026-11-02_upstream-sync.md`
- **その2**（上流 `b9197d8`・stale-while-revalidate）: 中流 `2663133` → `b9197d8`（3 件 / 781 件 green）、下流は中流 `9e64272` 基準（3 件 / 256 件 green）。
  push と GitHub 基準の `sync:check` 0 件まで済み。
