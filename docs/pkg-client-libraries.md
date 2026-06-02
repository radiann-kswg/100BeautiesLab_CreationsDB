# pkg/ クライアントライブラリ解説

100BeautiesLab_CreationsDB をサブモジュールとして別リポジトリに導入する際に利用できるクライアントパッケージ群の設計・使い方を説明します。

---

## 概要

`pkg/` 配下には以下の 5 種類のパッケージが含まれます。

| パッケージ             | パス              | 用途                                                |
| ---------------------- | ----------------- | --------------------------------------------------- |
| **Node.js ライブラリ** | `pkg/nodejs/`     | Node.js / Vue.js SSR / Nuxt / Vite SSR など         |
| **Python モジュール**  | `pkg/python/`     | Python スクリプト / Jupyter Notebook / FastAPI など |
| **C# クライアント**    | `pkg/csharp/`     | Unity / .NET アプリケーション                       |
| **Cloudflare Workers** | `pkg/cloudflare/` | サーバーサイド HTTP API（Service Worker 代替）      |
| **MCP サーバー**       | `pkg/mcp/`        | GitHub Copilot Agent / LLM ツールとの連携           |

---

## 設計方針

### 非破壊・独立原則

`pkg/` のクライアントは既存の `lib/sw-common.js` / `pages/` / `api/` / `svc/` に依存しません。
Service Worker グローバル（`self`）やブラウザ API を使わず、ファイルシステム I/O（Node.js `fs` / Python `pathlib` / C# `System.IO`）でデータを直接読み込みます。

### セキュリティ

すべての workId / dbName はエントリーポイントで英数字＋アンダースコアのみ許可するトークン検証を行います。不正な値は即 `null` / 例外 / 400 相当のエラーとして処理します。

---

## リポジトリルートの自動解決

`pkg/` のクライアントはコンストラクタの引数を**省略できます**。サブモジュールとして配置すれば、追加設定なしに動作します。

### 解決の仕組み

各クライアントは自ファイルの位置を起点にリポジトリルートを算出します。

```
<repo root>/
├── data/
│   └── db_meta.json        ← C# の FindRepoRoot() がこのファイルの存在を目印にする
└── pkg/
    ├── nodejs/
    │   └── index.mjs       ← ここから 2 階層上 = repo root
    ├── python/
    │   └── creationsdb/
    │       └── client.py   ← ここから 4 階層上 = repo root
    ├── csharp/
    │   └── CreationsDBClient.cs  ← アセンブリ位置から上方探索
    └── mcp/
        └── server.mjs      ← ここから 2 階層上 = repo root
```

### Node.js

```js
// pkg/nodejs/index.mjs 内での定義
const _DEFAULT_REPO_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../..",
);
```

省略形（推奨）:

```js
import { CreationsDBClient } from "./submodules/100BeautiesLab_CreationsDB/pkg/nodejs/index.mjs";
const db = new CreationsDBClient();
```

明示指定（任意のパスを使う場合）:

```js
const db = new CreationsDBClient("/path/to/100BeautiesLab_CreationsDB");
```

### Python

```python
# pkg/python/creationsdb/client.py 内での定義
_DEFAULT_REPO_ROOT = str(Path(__file__).resolve().parent.parent.parent.parent)
```

省略形（推奨）:

```python
from creationsdb import CreationsDBClient
db = CreationsDBClient()
```

明示指定（任意のパスを使う場合）:

```python
db = CreationsDBClient('/path/to/100BeautiesLab_CreationsDB')
```

### C#

```csharp
// CreationsDBClient.cs 内での定義
public static string? FindRepoRoot()
{
    // アセンブリ位置 → 実行ベースディレクトリ → カレントディレクトリ の順に
    // 上位フォルダをたどり、data/db_meta.json が存在するフォルダを返す
}
```

省略形（推奨）:

```csharp
using CreationsDB;
var db = new CreationsDBClient();  // FindRepoRoot() で自動探索
```

明示指定（Unity など明示したい場合）:

```csharp
var db = new CreationsDBClient(
    Path.Combine(Application.dataPath, "Submodules/100BeautiesLab_CreationsDB")
);
```

### MCP サーバー

MCP サーバーはコマンドライン引数 → 環境変数 → ファイル位置の順で解決します。

```sh
# 省略形（サブモジュール配置時）
node pkg/mcp/server.mjs

# 明示指定
node pkg/mcp/server.mjs --repo-root /path/to/100BeautiesLab_CreationsDB
# または
CREATIONSDB_REPO_ROOT=/path/to/100BeautiesLab_CreationsDB node pkg/mcp/server.mjs
```

---

## API サーフェス

Node.js / Python / C# の 3 クライアントは同じ API サーフェスを持ちます（命名規則は各言語の慣習に従う）。

### メソッド対応表

| 機能               | Node.js                                        | Python                                              | C#                                                  |
| ------------------ | ---------------------------------------------- | --------------------------------------------------- | --------------------------------------------------- |
| グローバルメタ取得 | `getMeta()`                                    | `get_meta()`                                        | `GetMetaAsync()`                                    |
| 作品一覧           | `listWorks()`                                  | `list_works()`                                      | `ListWorksAsync()`                                  |
| 作品別メタ取得     | `getWorkMeta(workId)`                          | `get_work_meta(work_id)`                            | `GetWorkMetaAsync(workId)`                          |
| DB 一覧            | `listDBs(workId)`                              | `list_dbs(work_id)`                                 | `ListDbsAsync(workId)`                              |
| レコード一覧       | `getRecords(workId, dbName)`                   | `get_records(work_id, db_name)`                     | `GetRecordsAsync(workId, dbName)`                   |
| レコード 1 件      | `getRecord(workId, dbName, idxValue, idxKey?)` | `get_record(work_id, db_name, idx_value, idx_key?)` | `GetRecordAsync(workId, dbName, idxValue, idxKey?)` |
| DB 内検索          | `search(workId, dbName, query)`                | `search(work_id, db_name, query)`                   | `SearchAsync(workId, dbName, query)`                |
| 作品横断検索       | `searchAll(workId, query)`                     | `search_all(work_id, query)`                        | `SearchAllAsync(workId, query)`                     |

### 共通オプション

| オプション       | 既定    | 説明                                   |
| ---------------- | ------- | -------------------------------------- |
| `includePrivate` | `false` | `isPrivate: true` のレコードを含めるか |

---

## Cloudflare Workers API

ファイルシステムが使えない環境向けに、GitHub Pages の静的 JSON を `fetch` で取得するサーバーサイド API です。
Service Worker 版と同等のエンドポイント仕様を提供します。

```
GET /api/v1/meta
GET /api/v1/works
GET /api/v1/:work/meta
GET /api/v1/:work/dbs
GET /api/v1/:work/:db/records
GET /api/v1/:work/:db/records/:idx?idxKey=X
GET /api/v1/:work/:db/search?q=キーワード
GET /api/v1/:work/search?q=キーワード
```

詳細は `pkg/cloudflare/README.md` を参照してください。

---

## MCP サーバー

GitHub Copilot Agent モードや他の LLM ツールに公開するツール一覧:

| ツール名             | 説明                              |
| -------------------- | --------------------------------- |
| `list_works`         | 作品一覧の取得                    |
| `list_dbs`           | DB 一覧の取得                     |
| `get_records`        | レコード一覧の取得                |
| `get_record`         | インデックス値でレコード 1 件取得 |
| `search_records`     | DB 内全文検索                     |
| `search_all_records` | 作品横断全文検索                  |

詳細は `pkg/mcp/README.md` を参照してください。

---

## サブモジュールとして使う手順

```sh
# 親リポジトリに追加
git submodule add https://github.com/radiann-kswg/100BeautiesLab_CreationsDB submodules/100BeautiesLab_CreationsDB

# サブモジュールを最新化
git submodule update --remote
```

---

## 更新履歴

| 日付       | 内容                                                                                 |
| ---------- | ------------------------------------------------------------------------------------ |
| 2026-06-02 | `pkg/` 全 5 パッケージを新規実装（Node.js / Python / C# / Cloudflare Workers / MCP） |
| 2026-06-02 | コンストラクタの `repoRoot` 引数を省略可能化（サブモジュール配置時に自動解決）       |
