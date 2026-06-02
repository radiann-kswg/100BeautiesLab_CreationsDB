# 進捗ログ: pkg/ ライブラリ・API 拡張実装

- **開始日**: 2026-06-02
- **担当**: GitHub Copilot (Agent モード)

---

## 目的

現行の Service Worker 疑似 API を応用・拡張し、以下 2 つの機能を **非破壊** で追加する。

1. **ローカル環境/サブモジュール向けライブラリパッケージ** (`pkg/nodejs/`, `pkg/python/`, `pkg/csharp/`)
2. **真の意味での API 機能** (`pkg/cloudflare/` Cloudflare Workers, `pkg/mcp/` MCP サーバー)

すべて `pkg/` 以下に配置し、既存の `lib/`, `pages/`, `api/`, `svc/` は変更しない。

---

## 変更点の要約

| フォルダ | 状態 | 概要 |
|----------|------|------|
| `pkg/nodejs/` | ✅ 完了 | Node.js ESM クライアント（fs 経由 I/O、`CreationsDBClient` クラス） |
| `pkg/python/` | ✅ 完了 | Python モジュール `creationsdb`（pathlib 経由 I/O、同等 API） |
| `pkg/csharp/` | ✅ 完了 | C# クライアント（Unity / .NET 5+ 対応、Newtonsoft.Json / System.Text.Json 両対応） |
| `pkg/cloudflare/` | ✅ 完了 | Cloudflare Workers 版真の API（worker.js + wrangler.toml） |
| `pkg/mcp/` | ⬜ 未完了 | — |

---

## 影響範囲（編集ファイル）

```
pkg/
├── nodejs/
│   ├── index.mjs       ← 新規作成
│   └── README.md       ← 新規作成
├── python/
│   ├── creationsdb/
│   │   ├── __init__.py ← 新規作成
│   │   └── client.py   ← 新規作成
│   └── README.md       ← 新規作成
├── csharp/
│   ├── CreationsDBClient.cs ← 新規作成
│   └── README.md            ← 新規作成
└── cloudflare/
    ├── worker.js       ← 新規作成
    ├── wrangler.toml   ← 新規作成
    └── README.md       ← 新規作成
```

既存ファイルへの変更: **なし**

---

## フェーズ 1 完了: `pkg/nodejs/`

### 設計方針

- `sw-common.js` は `self` (Service Worker グローバル) に依存するため **インポートしない**
- `data-common.js` の `EnrichmentProcessor` は Node.js 互換だが、基本取得に限定してバンドルを最小化
- DB 解決ロジック（`readDB`, `listWorkDBs`, `_Commons` 適用）を Node.js 版として独立実装
- 外部依存ゼロ（Node.js 標準の `fs/promises` のみ使用）

### 提供 API

```js
const db = new CreationsDBClient('/path/to/repo');
await db.listWorks()                             // 作品一覧
await db.listDBs('NumberTales')                  // DB 一覧
await db.getRecords('NumberTales', 'Primary')    // レコード取得（_Commons 適用・非公開除外）
await db.getRecord('NumberTales', 'Primary', '1', 'Num')  // インデックス検索
await db.search('NumberTales', 'Primary', 'キーワード')   // 全文検索
await db.searchAll('NumberTales', 'キーワード')           // 全 DB 横断検索
```

---

## フェーズ 2 完了: `pkg/python/`

### 設計方針

- Node.js 版と同等の API サーフェス（`get_records`, `get_record`, `search`, `search_all` 等）
- `pathlib.Path` による I/O、外部依存ゼロ（Python 3.9+ 標準ライブラリのみ）
- `_Commons` 適用、辞書バンドル読み込み、非公開除外を実装

### 提供 API

```python
from creationsdb import CreationsDBClient
db = CreationsDBClient('/path/to/repo')
db.list_works()
db.list_dbs('NumberTales')
db.get_records('NumberTales', 'Primary')
db.get_record('NumberTales', 'Primary', '1', idx_key='Num')
db.search('NumberTales', 'Primary', 'キーワード')
db.search_all('NumberTales', 'キーワード')
```

---

## フェーズ 3 完了: `pkg/csharp/`

### 設計方針

- Unity 2021.3+ (Mono/IL2CPP) と .NET 5+ の両方に対応
- JSON ライブラリ: **Newtonsoft.Json** 既定、`#define USE_SYSTEM_TEXT_JSON` で System.Text.Json に切り替え可能
- `async/await` + `File.ReadAllTextAsync` による I/O
- `isSafeToken` によるパストラバーサル防止を実装

### 提供 API

```csharp
var db = new CreationsDBClient("/path/to/repo");
await db.ListWorksAsync();
await db.ListDbsAsync("NumberTales");
await db.GetRecordsAsync("NumberTales", "Primary");
await db.GetRecordAsync("NumberTales", "Primary", "1", idxKey: "Num");
await db.SearchAsync("NumberTales", "Primary", "キーワード");
await db.SearchAllAsync("NumberTales", "キーワード");
```

---

## フェーズ 4 完了: `pkg/cloudflare/`

### 設計方針

- Cloudflare Workers (V8 Isolate) 上で動作するサーバーサイド API
- GitHub Pages から静的 JSON を fetch して Service Worker 版と同等のルーティングを提供
- REPO_BASE_URL 環境変数で任意の配信先に切り替え可能
- `isSafeToken()` によるパストラバーサル防止、Works_Hidden / DB_Hidden / isPrivate チェック実装
- Cloudflare Cache API による 5 分エッジキャッシュ

### 提供エンドポイント

```
GET /api/v1/meta
GET /api/v1/works
GET /api/v1/:work/meta
GET /api/v1/:work/dbs
GET /api/v1/:work/:db/records
GET /api/v1/:work/:db/records/:idx[?idxKey=X]
GET /api/v1/:work/:db/search?q=...
GET /api/v1/:work/search?q=...
```

---

## 未完了タスク

- [ ] `pkg/mcp/` — MCP サーバー（GitHub Copilot Agent モード対応）

---

## 参考リンク

- `lib/sw-common.js` — Service Worker 用 DataFetcher (参考実装)
- `lib/data-common.js` — EnrichmentProcessor / ReferenceResolver
- `docs/api-sw-spec.md` — API / SW 技術仕様
