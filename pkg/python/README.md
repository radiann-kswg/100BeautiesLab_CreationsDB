# CreationsDB — Python モジュール

100BeautiesLab_CreationsDB をサブモジュールとして導入した Python 環境から、ファイルシステム経由で DB レコードを取得・検索するためのクライアントモジュールです。
**外部ライブラリ依存なし** ── Python 標準ライブラリ (`json`, `pathlib`, `os`) のみで動作します。

---

## 動作要件

| 条件       | 詳細        |
| ---------- | ----------- |
| ランタイム | Python 3.9+ |
| 外部依存   | **なし**    |

---

## セットアップ

```sh
# 親リポジトリにサブモジュールとして追加
git submodule add https://github.com/radiann-kswg/100BeautiesLab_CreationsDB submodules/100BeautiesLab_CreationsDB
```

`sys.path` にモジュールパスを追加するか、`PYTHONPATH` を設定してください：

```python
import sys
sys.path.insert(0, '/path/to/100BeautiesLab_CreationsDB/pkg/python')
```

または `pyproject.toml` / `setup.py` でローカルパッケージとして追加：

```toml
# pyproject.toml (hatch / poetry)
[tool.poetry.dependencies]
creationsdb = { path = "submodules/100BeautiesLab_CreationsDB/pkg/python" }
```

---

## 基本的な使い方

```python
from creationsdb import CreationsDBClient

db = CreationsDBClient('/path/to/100BeautiesLab_CreationsDB')

# 作品一覧
works = db.list_works()
print([w['Title'] for w in works])
# → ['ナンバーテールズ', '運命線探偵78', ...]

# DB 一覧
dbs = db.list_dbs('NumberTales')
print([d['key'] for d in dbs])
# → ['Primary', 'Secondary', ...]

# レコード一覧（_Commons 補完・非公開除外）
records = db.get_records('NumberTales', 'Primary')
print(records[0])

# インデックス値でレコード 1 件取得
record = db.get_record('NumberTales', 'Primary', '1', idx_key='Num')
print(record.get('Name') if record else 'Not found')

# 全文検索（大小文字無視、部分一致）
hits = db.search('NumberTales', 'Primary', 'たぬき')
print(f'{len(hits)} 件ヒット')

# 作品内の全 DB を横断検索
all_hits = db.search_all('NumberTales', '狼')
for h in all_hits:
    print(f"{h['db']}: {h['record'].get('Name')}")
```

---

## API リファレンス

### `CreationsDBClient(repo_root, *, include_private=False)`

| 引数              | 型     | 説明                                                           |
| ----------------- | ------ | -------------------------------------------------------------- |
| `repo_root`       | `str`  | サブモジュールのルートディレクトリパス（絶対・相対どちらも可） |
| `include_private` | `bool` | `isPrivate: true` のレコードを含めるか（既定: `False`）        |

### `client.list_works() → list[dict]`

作品一覧を返す。`Works_Hidden: true` の作品は除外。
各要素: `{key, Title, Title_EN, Works_Summary, OldTitles}`

### `client.list_dbs(work_id) → list[dict]`

指定作品で利用可能な DB 一覧を返す。`DB_Hidden: true` は除外。
各要素: `{key, file, layer, DB_Label, DB_Label_EN}`

### `client.get_records(work_id, db_name, *, apply_commons=True) → list[dict]`

DB のレコード配列を返す。

### `client.get_record(work_id, db_name, idx_value, idx_key='Num') → dict | None`

インデックス値でレコードを 1 件返す。見つからない場合は `None`。

### `client.search(work_id, db_name, query) → list[dict]`

DB 内でキーワード全文検索（大小文字無視、部分一致）。

### `client.search_all(work_id, query) → list[dict]`

作品内の全 DB を横断検索。各要素: `{db: str, record: dict}`

---

## work_id の指定形式

以下はすべて同じ作品を指す：

```python
'NumberTales'
'Works_NumberTales'
'#Works_NumberTales'
```

---

## Unity での利用

Unity は Python を標準サポートしていません。Unity 向けには `pkg/csharp/` の C# クライアントを使用してください。
Python が必要な場合は [Python for Unity](https://docs.unity3d.com/Packages/com.unity.scripting.python@latest) パッケージを別途導入してください。

---

## 注意事項

- 本モジュールはローカルファイルシステムを直接読むため、GitHub Pages 上では動作しません
- レコードの `isPrivate: true` は既定で除外されます（`include_private=True` で全件取得可）
- `get_records()` は毎回ファイルを読み直します。高頻度アクセス時は呼び出し側でキャッシュを実装してください
