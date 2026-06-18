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

## 追加変更 (2026-06-18 後半)

### キャラ名表示・isPrivate 非表示・ThisMasters リンク

**`lib/section-renders/dblink.js`**
- `fetchRecords`: `isPrivate: true` のレコードをクライアント側でフィルタ（SW/API は非公開レコードを返す場合があるため）
- `hydrateName`: `tagEl` 引数を追加。DBからレコードが取得できたが一致なし（非公開/存在しない）の場合 `tagEl.style.display = 'none'`（タグ非表示）。取得失敗（fetch エラー）は判断不能なので非表示にしない
- 初期プレースホルダーを `ref.idxValue`（例: `"0"`）から `'…'` に変更し、非同期ハイドレーション後にキャラ名で置換

**`lib/section-renders/thisMasters.js`**
- `normalizeWorkKey`: `dblink.js` と同じ正規化関数を追加
- `_fetchCache`: セッション内キャッシュ（`workId|dbName` → Promise）を追加
- `hydrateThisMastersLink(anchorEl, dbLink, relationApi)`: entry._DBLink の `_Search` 条件でレコードを特定、Num フィールド（なければ最初の数値ルートフィールド）をインデックスとしてリンク href を構築。1件一致のみ採用、解決不能は `anchorEl.removeAttribute('href')` で無効化
- render: `entry._DBLink` がある場合は about タグを `div.tag` から `a.tag` に切り替え（`canLink` チェック付き）

### isPrivate 抑制まとめ
| レイヤー | 対応 |
|---|---|
| SW: `_DBLink` マージ | `filterPublicRecords` 適用済（line 398） |
| SW: `$enrich: true` suffix マージ | `resolveDbLinkSuffixRef` 内で `filterPublicRecords` 適用済（line 454） |
| UI: `dblink.js` fetch | `!r.isPrivate` フィルタを追加（今回） |
| UI: `thisMasters.js` fetch | `!r.isPrivate` フィルタを追加（今回） |

## 追加変更 (2026-06-18 第5回)

### ThisMasters._DBLink フォーマット統一 + リンク未付与バグ修正

**`lib/section-renders/thisMasters.js`**
- `hydrateThisMastersLink` を `$Def_DBLinkRef` 形式（`_Work / _DB / {IndexKey: Value}`）に全面刷新
  - 旧: `{worksTitle, dbName, _Search: [{hashTag, key}]}` 形式を解釈していた
  - 新: SENTINEL_KEYS（`_DB, _Work, label_JP, label_EN`）を除いた最初のキーをインデックスとして動的解決
  - スカラーインデックス（例: `Drc: "E"`）と ネストインデックス（例: `Card: {Stoat:"Major", StoatNum:17}`）の両方に対応
  - `getCharState()` で currentWorkId を取得し、`_Work` 省略時のフォールバックに利用
  - ヘルパー追加: `SENTINEL_KEYS`, `findSubKeyForHref`, `isSubsetMatch`

- **バグ修正**: `!aboutText` の早期 return がリンク処理を飛ばす問題を修正
  - `hasDbLink` チェックを `!aboutText` 分岐の前に移動
  - `!aboutText && hasDbLink` の場合も `hydrateThisMastersLink` を呼んでリンク化

**データファイル**: `ThisMasters._DBLink` を新フォーマットへ一括変換（PowerShell 正規表現）
| ファイル | 変換件数 |
|---|---|
| `db_Primary.json` | 18件 |
| `db_SemiPrimary.json` | 3件 |
| `db_SelfSecondary.json` | 対象外（root-level `_DBLink` は EnrichmentProcessor 専用） |

**注意**: `db_SelfSecondary.json` の root-level `_DBLink`（Num:169 レコード）は `resolveDbLinkPrimaryRecord()` が使う `{worksTitle, dbName, _Search}` 形式のまま維持すべき。ただし今回確認したところセッション開始前にユーザーが当該ブロックを削除済みだった。

### issue 2 (ThisArcanaHolder_DBLink キャラ名表示) — 根本原因修正 (2026-06-18 第4回)

**根本原因**: `rendererMap` は挿入順で iterate される。`structuredObjectSection` が最初に登録されており、`isPlainObject(value) = true` になる単一オブジェクト形式の `*_DBLink` フィールドをすべて捕捉していた。配列形式は `isPlainObject([]) = false` なので常に `dbLinkSection` に到達していたが、`$type: "$Def_DBLinkRef|#Null"`（非配列）の `ThisArcanaHolder_DBLink` は `structuredObjectSection` でレンダリングされカード番号（StoatNum: 0）が表示されていた。

**修正ファイル**: `lib/section-wrapper-common.js`
- `structuredObjectSection.match` に `!/^.+_DBLink$/.test(String(context?.item?.key || ''))` 除外条件を追加
- これにより単一オブジェクト形式の `*_DBLink` フィールドも `dbLinkSection` へ正しくディスパッチされる

## 未完了タスク
- [ ] `db_type.json`（各作品）への `*_DBLink` フィールド定義追加（二春が手動追加）
- [ ] `db_*.json` へのデータエントリ入力（二春が手動）
- [ ] ブラウザ動作確認（フィールド定義＋データ入力後）
- [x] `ThisArcanaHolder_DBLink` / `ThisPerformer_DBLink`: キャラ名表示（`hydrateName` + `'…'` プレースホルダー）
- [x] `ThisMasters._DBLink`: value テキストをリンク化（`hydrateThisMastersLink`）、`!aboutText` バグ修正
- [x] `isPrivate: true` 参照先の UI 非表示・SW 除外
- [x] `ThisArcanaHolder_DBLink` 単一オブジェクト形式: `structuredObjectSection` に横取りされる根本原因修正
- [x] `ThisMasters._DBLink` フォーマット統一（`worksTitle/dbName/_Search` → `_Work/_DB/{IndexKey}`）

## 追加修正 (2026-06-18 第3回)

### ThisMasters・dbLinkSection 調整

**`lib/section-renders/thisMasters.js`**
- `about` タグは常に `div.tag`（リンクなし）に戻す
- `value` テキストを `<a href="#">` でラップし `hydrateThisMastersLink` でリンク化（`_DBLink` がある場合のみ）

**`lib/section-renders/dblink.js`**
- `tags=[]`（null-index エントリなど全て無効）の場合: `return null` → `return createElement('span', {display:none, data-dblink-empty:''})` に変更。フォールスルーレンダリング（「痕跡」表示）を防止する
- `hydrateName` のタグ非表示時: タグ非表示後にグリッド内の可視タグをチェックし、全て非表示なら `grid.closest('.section')` でセクション全体を非表示にする

### issue 2 (ThisArcanaHolder_DBLink キャラ名表示) — 根本原因修正 (2026-06-18 第4回)

**根本原因**: `rendererMap` は挿入順で iterate される。`structuredObjectSection` が最初に登録されており、`isPlainObject(value) = true` になる単一オブジェクト形式の `*_DBLink` フィールドをすべて捕捉していた。配列形式は `isPlainObject([]) = false` なので常に `dbLinkSection` に到達していたが、`$type: "$Def_DBLinkRef|#Null"`（非配列）の `ThisArcanaHolder_DBLink` は `structuredObjectSection` でレンダリングされカード番号（StoatNum: 0）が表示されていた。

**修正ファイル**: `lib/section-wrapper-common.js`
- `structuredObjectSection.match` に `!/^.+_DBLink$/.test(String(context?.item?.key || ''))` 除外条件を追加
- これにより単一オブジェクト形式の `*_DBLink` フィールドも `dbLinkSection` へ正しくディスパッチされる
