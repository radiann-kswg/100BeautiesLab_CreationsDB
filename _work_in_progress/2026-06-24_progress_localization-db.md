# 英訳固有辞書 DB（Localization レイヤー）実装 (2026-06-24)

## 目的

一次創作における固有名詞・造語の英訳方針を記録・管理する専用 DB レイヤーを追加する。

## 設計概要

- **レイヤー名**: `Localization`（フォルダ名 / `DB_Layer` 値）
- **カタログキープレフィックス**: `#Loc_*`
- **ファイル命名規則**: `trans_*.json`（TRANSlate 由来）
- **主 DB**: `trans_Dict.json`（翻訳辞書）
- **グローバル共有 schema**: `data/Localization/db_type.json` / `data/Localization/db_meta.json`

### TransPolicy（翻訳方針）

| キー | 日本語 | 英語 |
|------|--------|------|
| `#TP_KeepOriginal` | 原語維持 | Keep as-is |
| `#TP_LocalizeName` | 意音ローカライズ | Phonosemantic Localization |
| `#TP_SemanticTranslate` | 意訳 | Semantic Translation |
| `#TP_Romanize` | 音訳（ローマ字） | Romanize |
| `#TP_Bilingual` | 和英併記 | Bilingual |

「意音ローカライズ」はポケモン英訳方式（各言語の語彙から意味が伝わる命名）を表す造語。

### Category（分類）

造語 / 人物名・呼称 / 地名 / 組織名 / 品名・モデル名 / 称号・肩書 / 能力・スキル名 / 属性名 / 事象・現象 / イベント名・出来事 / 独自スラング・特殊表現 / 伝統 / その他固有名詞

## 変更点の要約

### 新規ファイル

- `data/Localization/db_type.json` — 全 12 フィールド定義（Term_JP / Term_EN / Term_EN_Alt / Category / TransPolicy / Scope / Summary_JP / Summary_EN / TransNote_JP / TransNote_EN / RelatedTerms / Links）
- `data/Localization/db_meta.json` — `$EnumDef_TransPolicy`（5 件）/ `$EnumDef_Category`（13 件）
- `data/Works_*/Localization/trans_Dict.json` — 9 作品分の空配列ファイル

### 既存ファイル更新

**`data/Works_*/DataBases/db_meta.json`（9 作品全て）**
```json
"#Loc_Dict": {
  "DB_Layer": "Localization",
  "DB_Label_JP": "翻訳辞書",
  "DB_Label_EN": "Translation Dictionary"
}
```

**`lib/sw-common.js`**
- `DataUtils.stripMetaDbPrefix`: `#?(DB|Ref)_` → `#?(DB|Ref|Loc)_`（Loc_ プレフィックス剥がし対応）
- `DataFetcher.resolveDbFilePrefix`: `#Loc_*` メタキーに対して `'trans_'` を返すよう拡張
- `DataUtils.findMetaDbEntry`: candidates に `#Loc_${norm}` を追加

**`pages/characters.js`**
- `findDbCatalogEntry`: `#?(DB|Ref)_` 剥がし → `#?(DB|Ref|Loc)_` に拡張、`#Loc_*` 候補を追加
- `mapDbNameToImageDir`: `Loc_` プレフィックス付き rawName は早期 return、`DB_Layer: 'Localization'` 時に `Loc_${rawName}` を返す

**`tests/sw.db-layer-routing.test.js`**
- `DataFetcher.readDB resolves Localization layer trans_*.json via #Loc_ catalog entry`
- `DataUtils.stripMetaDbPrefix strips Loc_ prefix from #Loc_ keys`
- `DataUtils.findMetaDbEntry finds #Loc_ entries alongside #DB_ and #Ref_`

## 影響範囲

- 全 9 作品の `DataBases/db_meta.json`（Loc_Dict エントリ追加のみ）
- `lib/sw-common.js`（DataUtils / DataFetcher ルーティング拡張）
- `pages/characters.js`（カタログ検索 / 画像ディレクトリ解決）
- `tests/sw.db-layer-routing.test.js`（3 ケース追加）

## 検証

- `npm test` → 129/129 pass ✅

## 追加実装（2026-06-25）

### 構造改善
- **`#Loc_Dict` を `Localization/db_meta.json` へ移動**: References 層と同様の構造に統一（`DataBases/db_meta.json` には含めない）。
- **`mergeLayerDatabases` 汎用化**: `mergeRefDatabases` を `mergeLayerDatabases(baseMeta, layerMeta, defaultLayer)` のラッパーに変更。
- **`readLocMeta` 追加**: `Works_*/Localization/db_meta.json` を読んで `readWorkMeta` でマージ。
- テスト 2 ケース追加 → 130/130 pass ✅

### 仮データ投入
各作品の `trans_Dict.json` に実既存データから自動収集した仮エントリを格納：
- NT: 211件（作品タイトル + 一次キャラクター 105 名 + FormalName 105 件）
- FL78: 14件 / ShouAr: 8件 / SCG: 9件 / PastDivers: 14件 / UnauthedLogica: 12件 / UnibyteLive: 4件 / DFR: 10件 / Proxies: 4件
- TransPolicy は既存 Name_EN パターンから仮判定（原作者確認・修正前提）

## 追加データ投入（2026-06-25 続）

### バグ修正
- `data/Localization/trans_Dict.json`：「神夜崎 ユノ」の `Scope` に `"Works_PastDivers"` が重複していた問題を修正

### 仮データ追加

**ShouArRiders**（7→17 件）
- `BeastspecName` 7件: 子機分身/会心一中/跳躍/画竜点睛(空中走行)/束縛形態/牽引突破/軟体/着地（各 `#Cat_Ability`, `#TP_SemanticTranslate`）
- 地名 2件: 龍天国（`#TP_KeepOriginal`）/ 雄姿結国（`#TP_SemanticTranslate`）
- 疾患 1件: 山月病（`#Cat_Phenomenon`, `#TP_Romanize`）

**FLInvestigator78**（14→24 件）
- 組織名: セブンティエイト特殊探偵団（`#Cat_OrgName`）
- 能力概念: アルカナムスペック（`#Cat_Ability`）
- 現象: 未来消失（`#Cat_Phenomenon`）
- 造語: 運命線（`#Cat_Coinage`, 作品タイトルとは別に単体概念として収録）
- 地名: 九蓮国（`#Cat_PlaceName`, `#TP_LocalizeName` → LotusNinea）
- 肩書/クラス 5件: 情報屋 / 最高幹部 / 国際幹部 / 九蓮国支部幹部 / 国境幹部
- ※ `英皇国` の EN 表記未確認のため `英皇国支部幹部` は保留

**UnibyteLive**（3→8 件）
- FormalName 3件: 英文字アロー / 左伯ナーミィ / 右仗ジグ（`#Cat_PersonName`, `#TP_LocalizeName`）
- グループ名: アルベッツ（`#Cat_OrgName`, `#TP_KeepOriginal` → ALPBETS）
- 仮想空間名: ユニバイト・ユニバース（`#Cat_ProperNoun`, `#TP_KeepOriginal` → Unibyte Universe）

### テスト
- `npm test` → 130/130 pass ✅

## 未完了タスク / 今後の課題

- Localization 層の enum 解決（`data/Localization/db_meta.json` の `$VarsDef` を `metaForLookup` に合流させる）は、UI で enum ラベル表示が必要になったタイミングで対応予定
- TransPolicy・Category の仮判定は原作者（User）による確認・修正を前提とする
- 能力名・地名・術式名・組織名など #Cat_Ability / #Cat_PlaceName 等の項目は User 手動追加予定
- `data.sanity.test.js` への Localization 追加は実データ充実後に検討

## 参考

- ポケモン英訳ローカライズ事例（意音ローカライズの着想元）
- `docs/schema-meta-processing.md`（レイヤー typedef 合流の解説先）
