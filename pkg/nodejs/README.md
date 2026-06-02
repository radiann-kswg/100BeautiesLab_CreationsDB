# CreationsDB — Node.js ライブラリ

100BeautiesLab_CreationsDB をサブモジュールとして導入した Node.js / Vue.js (SSR) 環境から、ファイルシステム経由で DB レコードを取得・検索するためのライブラリです。  
Service Worker / ブラウザ API に依存せず、**Node.js 18 以上** の ESM 環境で単独動作します。

---

## 動作要件

| 条件 | 詳細 |
|------|------|
| ランタイム | Node.js 18.0.0 以上（ESM） |
| 外部依存 | **なし**（Node.js 標準 API のみ） |
| 対応環境 | Node.js CLI / Express / Nuxt (SSR) / Vite SSR など |

---

## セットアップ

```sh
# 親リポジトリにサブモジュールとして追加
git submodule add https://github.com/radiann-kswg/100BeautiesLab_CreationsDB submodules/100BeautiesLab_CreationsDB
```

---

## 基本的な使い方

```js
import { CreationsDBClient } from './submodules/100BeautiesLab_CreationsDB/pkg/nodejs/index.mjs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, 'submodules/100BeautiesLab_CreationsDB');

const db = new CreationsDBClient(repoRoot);

// 作品一覧を取得
const works = await db.listWorks();
console.log(works.map(w => w.Title));
// → ['ナンバーテールズ', '運命線探偵78', ...]

// 特定作品の DB 一覧を取得
const dbs = await db.listDBs('NumberTales');
console.log(dbs.map(d => d.key));
// → ['Primary', 'Secondary', ...]

// レコード一覧を取得（_Commons 補完済み・非公開除外）
const records = await db.getRecords('NumberTales', 'Primary');
console.log(records[0]);

// インデックス値でレコードを 1 件取得
const record = await db.getRecord('NumberTales', 'Primary', '1', 'Num');
console.log(record?.Name);

// 全文検索（大小文字無視）
const hits = await db.search('NumberTales', 'Primary', 'たぬき');
console.log(hits.length);

// 作品内全 DB を横断検索
const allHits = await db.searchAll('NumberTales', '狼');
console.log(allHits.map(h => `${h.db}: ${h.record.Name}`));
```

---

## API リファレンス

### `new CreationsDBClient(repoRoot?, options?)`

| 引数 | 型 | 説明 |
|------|----|------|
| `repoRoot` | `string` (**省略可**) | サブモジュールのルートディレクトリ絶対パス。省略時は `index.mjs` の 2 階層上を自動使用 |
| `options.includePrivate` | `boolean` | `isPrivate: true` レコードを含めるか（既定: `false`） |

### `client.listWorks()`
作品一覧を返します。`Works_Hidden: true` の作品は除外されます。

### `client.listDBs(workId)`
指定作品で利用可能な DB 一覧を返します。`DB_Hidden: true` の DB は除外されます。

### `client.getRecords(workId, dbName, options?)`
DB のレコード配列を返します。  
- `options.applyCommons` (boolean, 既定: `true`): `_Commons` 補完を適用するか

### `client.getRecord(workId, dbName, idxValue, idxKey?)`
インデックス値でレコードを 1 件返します。見つからない場合は `null`。

| 引数 | 型 | 既定値 | 説明 |
|------|----|--------|------|
| `idxValue` | `string\|number` | — | インデックス値（例: `"1"`, `"Wrath"`） |
| `idxKey` | `string` | `"Num"` | インデックスフィールド名（ドット記法可: `"Card.Num"`） |

### `client.search(workId, dbName, query)`
DB 内でキーワード全文検索を行い、ヒットしたレコード配列を返します。

### `client.searchAll(workId, query)`
作品内の全 DB を横断検索し、`{ db: string, record: Object }[]` を返します。

---

## Vue.js / Nuxt での利用例

### Nuxt 3 (SSR / `server/api/` ルート)

```ts
// server/api/characters/[work]/[db].get.ts
import { CreationsDBClient } from '~/submodules/100BeautiesLab_CreationsDB/pkg/nodejs/index.mjs';
import { join } from 'node:path';

const db = new CreationsDBClient(join(process.cwd(), 'submodules/100BeautiesLab_CreationsDB'));

export default defineEventHandler(async (event) => {
  const { work, db: dbName } = getRouterParams(event);
  return db.getRecords(work, dbName);
});
```

---

## workId の指定形式

以下はすべて同じ作品を指します：

```
"NumberTales"
"Works_NumberTales"
"#Works_NumberTales"
```

---

## 注意事項

- 本ライブラリはローカルファイルシステムを直接読むため、**GitHub Pages (静的配信) 上では動作しません**。ブラウザ環境では Service Worker API (`/pages/v1/*`) を使用してください。
- `getRecords()` は毎回ファイルを読み直します。高頻度アクセス時は呼び出し側でキャッシュを実装してください。
- `isPrivate: true` のレコードは既定で除外されます。`new CreationsDBClient(root, { includePrivate: true })` で全件取得できます。
