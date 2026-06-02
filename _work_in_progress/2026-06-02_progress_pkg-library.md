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
| `pkg/python/` | ⬜ 未完了 | — |
| `pkg/csharp/` | ⬜ 未完了 | — |
| `pkg/cloudflare/` | ⬜ 未完了 | — |
| `pkg/mcp/` | ⬜ 未完了 | — |

---

## 影響範囲（編集ファイル）

```
pkg/
├── nodejs/
│   ├── index.mjs       ← 新規作成
│   └── README.md       ← 新規作成
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

## 未完了タスク

- [ ] `pkg/python/` — Python モジュール (`creationsdb`)
- [ ] `pkg/csharp/` — C# クライアント (`CreationsDBClient.cs`)
- [ ] `pkg/cloudflare/` — Cloudflare Workers エントリーポイント
- [ ] `pkg/mcp/` — MCP サーバー（GitHub Copilot Agent モード対応）

---

## 参考リンク

- `lib/sw-common.js` — Service Worker 用 DataFetcher (参考実装)
- `lib/data-common.js` — EnrichmentProcessor / ReferenceResolver
- `docs/api-sw-spec.md` — API / SW 技術仕様
