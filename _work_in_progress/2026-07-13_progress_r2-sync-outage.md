# Cloudflare R2 が本番へ一度も同期されていなかった問題 (2026-07-13)

## 目的

`isPrivate` フィルタ順序の修正（`2026-07-13_progress_pkg-sync.md` 参照）が**本番 Cloudflare 実 API で実際に効いているか**を検証する。

## 結論

**効いていなかった。** 検証の過程で、R2 が稼働開始以来一度も本番へ同期されていないという、より深刻な障害を発見した。

## 発見の経緯（本番 API を実際に叩いて確認）

```
GET /api/v1/NumberTales/Secondary/records
  → 38 件。非公開のはずの 0xFF(エフエフ) が含まれる（漏洩）

GET /api/v1/meta
  → {"error":"Global meta unavailable","status":503}

GET /api/v1/NumberTales/meta
  → {"key":"#Works_NumberTales"}   ← db_meta.json の中身が無い
```

R2 依存のエンドポイントだけが全滅し、D1 依存（`works` / `dbs` / `records`）は正常だった。

レコードの中身を見ると、`_Secondaries[]._Commons` が注入するはずのフィールドが欠落していた:

| フィールド | 本番値 | 判定 |
| ---------- | ------ | ---- |
| `Progress` | `"accepted\nremadeReleased"` | レコード自身が持つ値 |
| `Belonging` / `RaceType` / `isTriple` | `undefined` | **`_Commons` 未適用** |
| `isPrivate` | `undefined` | 注入されず → **漏洩** |

→ **Cloudflare 実 API では `_Commons` / `_Secondaries` が一度も適用されていなかった**。

## 根本原因

`pkg/cloudflare/scripts/migrate.mjs` の R2 アップロードに **`--remote` が付いていなかった**。

```js
// 修正前
"r2", "object", "put", `${BUCKET}/${rel}`, "--file", rel, "--content-type", "application/json"
//                                                                    ↑ --remote が無い
```

- **wrangler v4 の `r2 object put` は既定でローカルシミュレータ（`.wrangler/state`）へ書き込む**
  （`wrangler r2 object put --help` → `--local: Interact with local storage` / `--remote: Interact with remote storage`）
- CI は 160 個の JSON を GitHub Actions ランナー内の一時領域に書き、ジョブ終了とともに破棄していた
- D1 側（`d1 execute`）には元から `--remote` が付いており、**R2 だけ欠落**していた

### なぜ気付けなかったか

1. **`migrate.mjs` が R2 アップロード失敗を握り潰していた**（`console.error` するだけでジョブは成功扱い）。
   ただし今回はローカル put が「成功」していたため、そもそも失敗ログすら出ず `[R2] ✓` が 160 件並んでいた。
2. **`worker.js` の `fetchJsonFromR2()` が全例外を無言で `null` に変換していた**。
   呼び出し元（`getWorkMeta()`）は「メタが無い」as-if で処理を続け、`_Commons` 未適用のまま応答していた。
3. CI は常に緑。R2 が空でも `/api/v1/:work/:db/records` は D1 から返るため、一見動いて見えた。

### 検証コマンド（再現手順）

```sh
npx wrangler r2 object get creationsdb-data/data/db_meta.json --file /tmp/x.json --remote
# → X [ERROR] The specified key does not exist.   （バケットは空）
```

## 実施した修正

- **`pkg/cloudflare/scripts/migrate.mjs`**
  - `r2 object put` に `--remote` を追加（根本修正）
  - R2 アップロードに 1 件でも失敗したら `process.exit(1)` で CI を落とす（silent failure の再発防止）
- **`pkg/cloudflare/worker.js`**
  - `fetchJsonFromR2()`: オブジェクト不在は `console.warn`、例外は `console.error` でログに残す
    （`wrangler tail` / Workers Logs で追えるようにする）
- **`.github/workflows/cf-api-sync.yml`**
  - `sync-r2-d1` が **`data/**` の変更時にしか走らない**穴を是正。新しく `migrate` フィルタ
    （`pkg/cloudflare/scripts/**` / `schema/**` / `worker.js`）を追加し、migration ロジックの変更でも
    再同期を実行する
    - `worker.js` を含める理由: `migrate.mjs` が `applyCommons()` / `isPublicRecord()` を worker.js から
      import しており、その変更が D1 の `is_private` 算出結果を変えるため
  - `workflow_dispatch`（`both` / `sync-only` / `deploy-only`）を追加。`data/**` を変更しなくても
    手動で強制再同期できる

## 反映手順

本コミットを `develop` へ push すると、`worker.js` / `scripts/**` の変更により `sync-r2-d1` と
`deploy-worker` の両方が実行され、**R2 の初回投入**と **D1 の `is_private` 是正**が同時に行われる。

手動実行したい場合は Actions →「Cloudflare API 自動更新」→ Run workflow（`target: both`）。

### 反映後に確認すべきこと

```sh
# R2 が復活したか（503 が解消するか）
curl -s https://database.numbertales-radiann.net/api/v1/meta | head -c 80

# _Commons が適用されるか（Belonging / RaceType / isTriple が入るか）
# 非公開レコード 0xFF(エフエフ) が消えるか（38 件 → 37 件）
curl -s https://database.numbertales-radiann.net/api/v1/NumberTales/Secondary/records
```

## 検証

- `npm test` 全件成功（30 ファイル / 301 件）
- R2 バケットが空であることを `wrangler r2 object get --remote` で確認（複数キーで `The specified key does not exist`）
- `--remote` がリモートストレージ操作に必要であることを `wrangler r2 object put --help` で確認
- ワークフロー YAML をパースし、`if` 条件・フィルタ・`workflow_dispatch` inputs を検証

## 未完了 / 既知の制限

- **本番への反映は未実施**（push / workflow_dispatch は User の操作を待つ）。
  反映するまで `/api/v1` は `_Commons` 未適用のままで、非公開レコード `0xFF(エフエフ)` も公開され続ける。
- R2 アップロードはファイル 1 件ごとに `npx wrangler` を起動するため 160 ファイルで数分かかる。
  `--remote` 追加により実際のネットワーク転送が発生するので、さらに時間が延びる可能性がある
  （現状の同期ジョブ実行時間は約 9 分）。バッチ化・並列化は本件のスコープ外。
- GitHub Pages 側の Service Worker（`/pages/v1/`）は R2 を使わずローカル JSON を直接読むため、
  本障害の影響を受けていない（`_Commons` は正常に適用されている）。

## 参考

- `_work_in_progress/2026-07-13_progress_pkg-sync.md` — `isPrivate` 順序バグの発見と修正
- `docs/api-sw-spec.md` — `isPrivate` 除外は `_Commons` 適用の「後」に行う規則
