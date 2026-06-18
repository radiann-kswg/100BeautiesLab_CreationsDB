# *_DBLink suffix エンリッチメント（`$enrich: true`）

## 目的

`{FieldName}_DBLink` フィールドに `$enrich: true` を typedef で指定した場合、
`EnrichmentProcessor` が参照先レコードをルックアップして現在レコードへマージする。
`_DBLink` と同じ「空値のみ埋める」マージ動作をサフィックスフィールドでも実現。

## 使い方（typedef 設定例）

各作品の `db_type.json` でフィールドに `$enrich: true` を付ける：

```json
{
  "hashTag": "ThisArcanaHolder_DBLink",
  "$type": "$Def_DBLinkRef|#Null",
  "$enrich": true,
  "hashTag_JP": "アルカナホルダー",
  "hashTag_EN": "ArcanaHolder",
  "$display": {
    "dbLinkTargetDB": "PrimaryDealer"
  }
}
```

対象 DB は `$display.dbLinkTargetDB` 優先、なければ現在 DB にフォールバック。

## データ形式

```json
"ThisArcanaHolder_DBLink": { "_DB": "PrimaryDealer", "Card": { "Stoat": "Major", "StoatNum": 0 } }
"SameModels_DBLink": [{ "Num": 67 }, { "Num": 222 }]
```

単一オブジェクト・配列どちらも受け付ける（配列の場合は先頭の解決済みエントリのみマージ）。

## 変更点の要約

### 修正ファイル: `lib/data-common.js`

**追加1: モジュールスコープ関数 `dbLinkSubsetMatch`**（25行付近）
- ネスト index の subset match（`dblink.js` の `isSubsetMatch` と同ロジック）
- `{Stoat:"Major",StoatNum:0}` が `{Stoat:"Major",StoatNum:0,Num:22}` に含まれるか

**追加2: `EnrichmentProcessor.resolveDbLinkSuffixRef()` メソッド**（`resolveDbLinkPrimaryRecord` 直後）
- `$Def_DBLinkRef` エントリから参照先レコードを直接ルックアップ
- `_Search` 不使用：非センチネルキーをインデックスとして直接比較
- スカラー index: `String(r[idxKey]) === String(idxRaw)`
- ネスト index: `dbLinkSubsetMatch(r[idxKey], idxRaw)` の subset match
- 既存の `dbLinkPrimaryCache` を再利用（`sfx|` プレフィックスで衝突回避）

**追加3: `enrichRecords()` ステップ 2.1**（ステップ2 `_DBLink` 処理の直後）
- `typeEntries` から `$enrich === true && hashTag.endsWith('_DBLink')` のエントリを抽出
- 各フィールドの先頭エントリを解決し `mergeFromLinkedRecord` で穴埋め
- `allowImages: false`（別DB由来の画像はマージしない）
- cross-work の場合は `declaredTopLevelKeys` でフィールドを制限（既存 `_DBLink` と同動作）

## 仕様・制約

| 項目 | 仕様 |
|---|---|
| トリガー | typedef の `$enrich: true` |
| デフォルト対象DB | `$display.dbLinkTargetDB` → 現在DB |
| マージ対象 | 空値フィールドのみ（`_DBLink` と同じ） |
| 画像マージ | 常に無効（`allowImages: false`） |
| 配列フィールド | 先頭の解決済みエントリのみ（`_DBLink` と同じ） |
| 実行タイミング | ステップ2.1（`_DBLink` マージ → `$enrich` マージ → `$alt` フォールバック） |

## 未完了タスク
- [ ] `$enrich: true` を持つフィールドを各作品 typedef に追加（二春が手動）
- [ ] ブラウザ動作確認（エンリッチメントデータが正しく引き込まれているか）
