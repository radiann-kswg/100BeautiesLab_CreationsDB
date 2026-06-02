# CreationsDB — C# クライアント

100BeautiesLab_CreationsDB をサブモジュールとして導入した C# (.NET / Unity) 環境から、ファイルシステム経由で DB レコードを取得・検索するためのクライアントライブラリです。

---

## 動作要件

| 環境 | 条件 |
|------|------|
| Unity | 2021.3+ (IL2CPP / Mono 両対応) |
| .NET  | .NET 5 / 6 / 7 / 8 |
| JSON ライブラリ | Unity: **Newtonsoft.Json** (`com.unity.nuget.newtonsoft-json`) / .NET: `System.Text.Json` または Newtonsoft |

---

## セットアップ

### 1. サブモジュールとして追加

```sh
git submodule add https://github.com/radiann-kswg/100BeautiesLab_CreationsDB Assets/Submodules/100BeautiesLab_CreationsDB
```

### 2. `CreationsDBClient.cs` を参照

`pkg/csharp/CreationsDBClient.cs` をプロジェクトに追加するか、`Assembly Definition`（`.asmdef`）のディレクトリに配置します。

```
Assets/
└── Submodules/
    └── 100BeautiesLab_CreationsDB/
        └── pkg/
            └── csharp/
                └── CreationsDBClient.cs   ← これを参照
```

### 3. JSON ライブラリの選択

#### Unity（推奨: Newtonsoft.Json）

Package Manager で `com.unity.nuget.newtonsoft-json` を追加し、`CreationsDBClient.cs` を **そのままコピー**してアセットに配置します。

#### .NET 5+（System.Text.Json）

`CreationsDBClient.cs` の先頭に以下を追加するか、コンパイル定数を設定します：

```csharp
#define USE_SYSTEM_TEXT_JSON
```

または、`.csproj` で：

```xml
<DefineConstants>USE_SYSTEM_TEXT_JSON</DefineConstants>
```

---

## 基本的な使い方

```csharp
using CreationsDB;

// サブモジュール構成の場合：パス指定なし（data/db_meta.json を自動探索）
var db = new CreationsDBClient();

// 任意のパスを明示する場合（必要に応じて）
// var db = new CreationsDBClient(
//     Path.Combine(Application.dataPath, "Submodules/100BeautiesLab_CreationsDB")
// );

// 作品一覧
var works = await db.ListWorksAsync();
foreach (var w in works)
    Debug.Log($"{w.Key}: {w.Title}");

// DB 一覧
var dbs = await db.ListDbsAsync("NumberTales");
foreach (var d in dbs)
    Debug.Log($"{d.Key}: {d.Label}");

// レコード一覧（_Commons 補完・非公開除外）
var records = await db.GetRecordsAsync("NumberTales", "Primary");
Debug.Log($"取得件数: {records.Count}");

// インデックス値でレコード 1 件取得
var record = await db.GetRecordAsync("NumberTales", "Primary", "1", idxKey: "Num");
if (record != null)
    Debug.Log(record.ToString());

// 全文検索
var hits = await db.SearchAsync("NumberTales", "Primary", "たぬき");
Debug.Log($"ヒット: {hits.Count} 件");

// 作品内の全 DB 横断検索
var allHits = await db.SearchAllAsync("NumberTales", "狼");
foreach (var h in allHits)
    Debug.Log($"{h.DbName}: {h.Record["Name"]}");
```

---

## API リファレンス

### `new CreationsDBClient(repoRoot?)`

| 引数 | 型 | 説明 |
|------|----|------|
| `repoRoot` | `string?` (**省略可**) | サブモジュールのルートディレクトリパス。`null` 時は `FindRepoRoot()` で自動探索 |

| プロパティ | 型 | 説明 |
|-----------|-----|------|
| `IncludePrivate` | `bool` | `isPrivate: true` のレコードを含めるか（既定: `false`） |

### `ListWorksAsync() → Task<IReadOnlyList<WorkInfo>>`

作品一覧を返す。`Works_Hidden: true` の作品は除外。

`WorkInfo` プロパティ: `Key`, `Title`, `TitleEN`, `Summary`, `OldTitles`

### `ListDbsAsync(workId) → Task<IReadOnlyList<DbInfo>>`

指定作品の DB 一覧を返す。`DB_Hidden: true` は除外。

`DbInfo` プロパティ: `Key`, `File`, `Layer`, `Label`, `LabelEN`

### `GetRecordsAsync(workId, dbName, applyCommons = true) → Task<IReadOnlyList<JObject>>`

DB のレコード配列を返す。

### `GetRecordAsync(workId, dbName, idxValue, idxKey = "Num") → Task<JObject?>`

インデックス値でレコードを 1 件返す。見つからない場合は `null`。

### `SearchAsync(workId, dbName, query) → Task<IReadOnlyList<JObject>>`

DB 内でキーワード全文検索（大小文字無視、部分一致）。

### `SearchAllAsync(workId, query) → Task<IReadOnlyList<SearchResult>>`

作品内の全 DB 横断検索。各要素: `{DbName: string, Record: JObject}`

---

## workId の指定形式

以下はすべて同じ作品を指します：

```csharp
"NumberTales"
"Works_NumberTales"
"#Works_NumberTales"
```

---

## Unity での注意事項

- `async/await` は Unity 2021.3+ で使用可能。WebGL ビルドでは `await` が使えない場合があります（`UniTask` 等を検討してください）
- `File.ReadAllTextAsync` はランタイムのファイルアクセスを使うため、`StreamingAssets` またはビルド外のパスを指定してください
- Editor 専用ツール（ローカルデータ参照）として使う場合は `Application.dataPath` または `EditorApplication.applicationPath` を組み合わせると便利です

---

## セキュリティ

- `workId` と `dbName` は英数字とアンダースコアのみ許可する `IsSafeToken()` で検証されます（パストラバーサル防止）
- リポジトリ外のパスは参照できません
