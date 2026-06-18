# *_DBLink suffix セクションレンダラー実装

## 目的

`hashTag` が `_DBLink` で終わるフィールドを「キャラクターリンク参照」セクションとして描画する suffix-driven renderer を実装する。
同DB・クロスDB（同作品内）・クロスワーク参照すべてに対応し、`RelationTo_{DBName}` と同じ非同期ハイドレーションパターンを採用。

## 想定ユースケース

| フィールド名 | 用途 | 参照先 |
|---|---|---|
| `SameModels_DBLink` | 装備違い・機能違いで同一モデル相当のキャラ参照 | 同作品 Primary DB |
| `AnotherVersions_DBLink` | 別バージョン・別デザインのキャラ参照 | 同作品 Primary DB |
| `SameMPSeries_DBLink` | 同番号の「マスタートリプル」クラス参照 | 同作品 Primary DB |
| `ThisArcanaHolder_DBLink` | アルカナムスペック → アルカナホルダーの参照 | 同作品 PrimaryDealer DB |
| `AnotherRegions_DBLink` | 別タイトルで設定がわずかに異なるキャラ参照 | 別作品 DB（クロスワーク） |

## データ形式（`$Def_DBLinkRef[]`）

インデックスキーは作品の `$IndexDef.hashTag` に依存せず、エントリの「非センチネルキー」として動的に検出する。

```json
"SameModels_DBLink": [
  { "Num": 67 },
  { "Num": 222, "label_JP": "分割個体（ドッペル）" },
  { "Num": 777 }
]
```

クロスDB・クロスワーク：
```json
"ThisArcanaHolder_DBLink": [
  { "_DB": "PrimaryDealer", "Num": 5 }
]

"AnotherRegions_DBLink": [
  { "_Work": "SinisterChangingGirls", "_DB": "Primary", "Num": 3 },
  { "_Work": "UnauthedLogica", "_DB": "Primary", "Num": 15 }
]
```

センチネルキー（インデックス値として扱わないフィールド）: `_DB`, `_Work`, `label_JP`, `label_EN`
それ以外の最初のキーがインデックスキー（例: `Num`, `Card` など作品定義次第）。

## スキーマ（`db_type.json`）

`$display.dbLinkTargetDB` で参照先DBを指定。省略時は現在DB。
**`$display.sectionWrapper` の指定は不要**（`match` 関数でサフィックス自動検出）。

```json
{
  "hashTag": "SameModels_DBLink",
  "$type": "$Def_DBLinkRef[]|#Null",
  "hashTag_JP": "同モデルキャラ",
  "hashTag_EN": "Same-Model Characters",
  "$display": {
    "dbLinkTargetDB": "Primary"
  }
}
```

## 変更点の要約

### 新規ファイル
- `lib/section-renders/dblink.js` — `dbLinkSection` renderer
  - `SENTINEL_KEYS`: `_DB`, `_Work`, `label_JP`, `label_EN`（インデックス値以外）
  - `extractRef()`: 非センチネルキーからインデックスキー/値を動的に抽出（`Num` 固定なし）
  - `extractLeafScalar()`: ネスト index（例: `Card: { Num: 5 }`）からリーフスカラーを再帰抽出
  - `hydrateName()`: 動的 `idxKey` でレコード比較、`recordMatchesIndexQuery` fallback
  - `match`: `/_DBLink$/.test(item.key) && Array.isArray(item.value)` でサフィックス自動検出
  - SW fetch + 非同期DOMハイドレーション（relation.js と同パターン）
  - セッション内フェッチキャッシュ（`_fetchCache` Map）
  - cross-work: `_Work` エントリで任意の作品DBを参照可能

### 修正ファイル
- `pages/characters.js` — `import '../lib/section-renders/dblink.js'` 追加
- `data/db_type.json` — `$VarsDef.$Def_DBLinkRef` 追加（グローバル共通型定義）
  - フィールド: `_DB`, `_Work`, `label_JP`, `label_EN`（インデックスキーは作品固有なので定義しない）
- `lib/section-renders/relation.js`
  - `registerSectionRenderer('relationSection')` に `match` 追加
  - `RelationTo_*` サフィックスを自動検出（`$display.sectionWrapper` 省略可能）
  - デバッグ `console.warn` ログを全削除（4箇所）

## 設計方針（_suffix 系はレンダラー内部処理）

> "できるだけtypedef駆動させるよりもラッパーやレンダーで内部処理する部分になるようにしたい"

- `*_DBLink` サフィックス → `dblink.js` の `match` 関数で自動検出（型定義不要）
- `RelationTo_*` サフィックス → `relation.js` の `match` 関数で自動検出（`$display.sectionWrapper` 省略可能）
- インデックスキー解決 → レンダラーが実行時にエントリから動的検出（`Num` 固定なし）
- `$Def_DBLinkRef` はインデックスフィールドを定義しない（作品ごとに異なるため）

## 影響範囲
- 既存フィールドへの影響なし（新規サフィックスパターンのみ）
- `_DBLink`（ルートフィールド、フィールドマージ用）は引き続き非対象（キーが `^.+_DBLink$` にマッチしない）
- テスト: 4ファイル失敗・7テスト失敗は変更前から既存（pre-existing）

## 未完了タスク
- [ ] `db_type.json`（各作品）への `*_DBLink` フィールド定義追加（二春が手動追加）
- [ ] `db_*.json` へのデータエントリ入力（二春が手動）
- [ ] ブラウザ動作確認（フィールド定義＋データ入力後）
