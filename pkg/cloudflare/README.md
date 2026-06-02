# CreationsDB — Cloudflare Workers API

100BeautiesLab_CreationsDB の**真のサーバーサイド API**。
Cloudflare Workers 上で動作し、GitHub Pages で配信されている静的 JSON を fetch して Service Worker 版と同等のルーティングを提供します。Service Worker が使えないクライアント（curl / Python requests / モバイルアプリ等）からも直接アクセスできます。

---

## 動作要件

| 条件       | 詳細                                   |
| ---------- | -------------------------------------- |
| ランタイム | Cloudflare Workers (V8 Isolate)        |
| Node.js    | Wrangler 実行用 Node.js 18+ (ローカル) |
| 外部依存   | **なし** (Web API のみ使用)            |

---

## セットアップ

### 1. Wrangler のインストール

```sh
npm install -g wrangler
# または
npx wrangler --version
```

### 2. Cloudflare ログイン

```sh
npx wrangler login
```

### 3. デプロイ

```sh
cd pkg/cloudflare
npx wrangler deploy
# → 本番環境へデプロイ
```

### 4. ローカル開発

```sh
npx wrangler dev
# → http://localhost:8787 で起動
```

---

## 環境変数

`wrangler.toml` の `[vars]` または Cloudflare Dashboard の **Settings → Variables** で設定します。

| 変数名          | 既定値                                                      | 説明                                            |
| --------------- | ----------------------------------------------------------- | ----------------------------------------------- |
| `REPO_BASE_URL` | `https://radiann-kswg.github.io/100BeautiesLab_CreationsDB` | GitHub Pages のベース URL（末尾スラッシュなし） |

> **注意**: ローカルテスト用に `.dev.vars` ファイルを使うこともできます（Git 管理対象外）：
>
> ```env
> REPO_BASE_URL=http://localhost:8080
> ```

---

## エンドポイント一覧

| メソッド | パス                                      | 説明                                             |
| -------- | ----------------------------------------- | ------------------------------------------------ |
| `GET`    | `/api/v1/meta`                            | グローバルメタデータ                             |
| `GET`    | `/api/v1/works`                           | 作品一覧                                         |
| `GET`    | `/api/v1/:work/meta`                      | 作品別メタデータ                                 |
| `GET`    | `/api/v1/:work/dbs`                       | DB 一覧                                          |
| `GET`    | `/api/v1/:work/:db/records`               | レコード一覧（\_Commons 補完・非公開除外）       |
| `GET`    | `/api/v1/:work/:db/records/:idx`          | インデックス値でレコード 1 件取得（既定: `Num`） |
| `GET`    | `/api/v1/:work/:db/records/:idx?idxKey=X` | インデックスキー指定                             |
| `GET`    | `/api/v1/:work/:db/search?q=キーワード`   | DB 内全文検索                                    |
| `GET`    | `/api/v1/:work/search?q=キーワード`       | 作品内横断検索                                   |

---

## 使用例

```sh
# 作品一覧
curl https://creationsdb-api.your-worker.workers.dev/api/v1/works

# NumberTales Primary の全レコード
curl https://creationsdb-api.your-worker.workers.dev/api/v1/NumberTales/Primary/records

# インデックス検索（Num = "1"）
curl "https://creationsdb-api.your-worker.workers.dev/api/v1/NumberTales/Primary/records/1"

# ドット記法インデックス
curl "https://creationsdb-api.your-worker.workers.dev/api/v1/FLInvestigator78/Primary/records/0?idxKey=Card.Num"

# 全文検索
curl "https://creationsdb-api.your-worker.workers.dev/api/v1/NumberTales/Primary/search?q=たぬき"

# 作品横断検索
curl "https://creationsdb-api.your-worker.workers.dev/api/v1/NumberTales/search?q=狼"
```

---

## work / db の指定形式

以下はすべて同じ作品・DB を指します：

```
/api/v1/NumberTales/Primary/records
/api/v1/Works_NumberTales/Primary/records
/api/v1/#Works_NumberTales/Primary/records   ← URL エンコード推奨: %23Works_NumberTales
```

---

## キャッシュ動作

- Cloudflare のエッジキャッシュ (`Cache-Control: public, max-age=300`) を使用
- 同一 URL への重複リクエストは Cloudflare Cache API でメモ化（1 Worker インスタンス内）
- キャッシュを無効化したい場合は Cloudflare Dashboard の「Purge Cache」を使用

---

## Service Worker 版との違い

| 比較項目         | Service Worker 版                | Cloudflare Workers 版                     |
| ---------------- | -------------------------------- | ----------------------------------------- |
| 実行場所         | ブラウザ内                       | Cloudflare エッジ                         |
| 利用クライアント | 同一オリジンのブラウザのみ       | 任意（curl / iOS / Android / Node.js 等） |
| キャッシュ       | Cache Storage (ブラウザ)         | Cloudflare エッジキャッシュ               |
| enrich 処理      | data-common.js による完全 enrich | \_Commons 適用のみ（軽量版）              |
| 運用             | コード変更不要 (SW 自動更新)     | Wrangler で deploy が必要                 |

---

## セキュリティ

- `work` / `db` パラメータは英数字・アンダースコアのみ許可（`isSafeToken`）
- `Works_Hidden: true` / `DB_Hidden: true` は 404 を返す
- `isPrivate: true` のレコードは既定で除外
- CORS: `Access-Control-Allow-Origin: *`（読み取り専用 API のため）
