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
- 本番の「後」計測は **デプロイ後に実施**（Playwright のルーティングで SW の `importScripts` を差し替える方法は固まるため断念）

### 本番での見込み（デプロイ前の机上）

- 10 分以内の再訪: `data/**` は全部ディスクキャッシュ → ローカル実測に近い **0.6〜0.9 秒**の見込み
- 10 分を超えた再訪: ユニーク約 57 ファイルの条件付き要求（304）が直列深さ 15〜20 往復 → **1.5〜2 秒**の見込み。
  この経路で 1 秒を切るには Q2 **(B)**（Cache API の stale-while-revalidate）が要る

## 未完了タスク

- [ ] **デプロイ後の本番実測**（Q5 の受け入れ基準: `?c=NumberTales/Primary` と `relations.html`、2 回目以降で `🎉 ... < 1000ms`）。10 分以内・10 分超の両方を取る
- [ ] 10 分超の再訪で 1 秒を超えるなら **Q2 (B)** へ昇格（`DataFetcher._fetchTextShared` の内側に Cache API を挟む。キャッシュ名は `CACHE_NAME` と分けてバージョン付与）
- [ ] 初回訪問の実測（目標 2 秒前後）。SW 登録後の API 3 本が各 4 秒だった件は (A) で辞書の重複が消えるので改善見込みだが未確認

## 参考

- `docs/api-sw-spec.md` §2.1（リクエストスコープのメモ化）/ §2.2（本件）
- 計測用の一時出力は `.cache/perf-probe*.txt` / `.cache/test_*.txt`（Git 管轄外）
