# `db_type.json` / `db_meta.json` フィールド宣言と内部処理メモ

このドキュメントは、`data/db_type.json` と `data/db_meta.json`、および作品別 `data/Works_<作品>/DataBases/db_type.json` / `db_meta.json` が、UI / Service Worker / enrich 処理の中でどのように使われるかを整理した技術メモです。

対象読者:

- `db_type.json($DefType)` の宣言が UI 表示へどう反映されるかを追いたい人
- `db_meta.json` の `CreationWorks` / `Databases` / `General.$VarsDef` の責務差を把握したい人
- `_Commons` / `_Secondaries` / `$VarsDef` / `$IndexDef` / `$MetaType` の置き場と使われ方を確認したい人

---

## 1. 先に結論

このリポジトリでは、定義ファイルの優先順位は次のように考えます。

1. 作品別 `db_type.json`
2. グローバル `data/db_type.json`
3. 作品別 `db_meta.json`
4. グローバル `data/db_meta.json`
5. UI / SW の後方互換処理

役割を短く言うと次の通りです。

- `db_type.json`
  - 何というフィールドがあるか
  - そのフィールドをどう解釈するか
  - UI がどのセクションへ置くか
  - index / 画像 / 検索 / `$alt` をどう扱うか
- `db_meta.json`
  - 作品や DB の概要をどう見せるか
  - enum/list の辞書をどう補うか
  - `_Commons` / `_Secondaries` による補完をどう定義するか
  - 詳細表示の補助レイアウトをどう与えるか

つまり、**構造の正は typedef、補助辞書と補完条件は meta** です。

---

## 2. ファイルごとの責務

### 2.1 グローバル `data/db_type.json`

主な責務:

- 全作品で共有する `$DefType`
- 全作品共通の `$VarsDef`
- 全作品共通の `$MetaType`

典型用途:

- 多くの作品で共通に持つトップレベル項目の宣言
- 共通 enum/list 辞書の宣言
- 作品/DB カタログの補助 schema 宣言

### 2.2 作品別 `data/Works_<作品>/DataBases/db_type.json`

主な責務:

- 作品固有フィールドの追加
- グローバル `$DefType` の上書き・補完
- 作品ごとの `$IndexDef`
- 作品固有 `$VarsDef`

典型用途:

- `Num`, `Card`, `BeastType` など作品固有 index の定義
- 作品にだけ存在するスペック項目や画像項目の宣言

### 2.3 グローバル `data/db_meta.json`

主な責務:

- `CreationWorks.<work>` による作品カタログ
- `CreationWorks.<work>.$DetailLayout` による詳細補助レイアウト
- `General.$VarsDef` による共通表示辞書の合流先

典型用途:

- 作品名、英語名、作品概要、旧題一覧の保持
- 作品単位での `basicFields` / `headerPills` の制御

補足:

- `Area` / `Belonging` のような共通辞書本体は、`data/Dictionaries/` 配下の辞書 DB へ分離できます。
- SW/UI は `data/db_meta.json` だけを直接参照せず、必要に応じて `data/Dictionaries/db_meta.json` と各 `dict_*.json` を追加ロードして `General.$VarsDef` へ合流します。
- `_Secondaries[]` 要素の補助表示に使う schema は、トップレベル `$MetaType.$Def_SecondaryMeta` へ置けます。

### 2.4 作品別 `data/Works_<作品>/DataBases/db_meta.json`

主な責務:

- `Databases.#DB_<DbName>` による DB カタログ
- `_Commons` / `_Secondaries` による補完ルール
- 作品固有 `General.$VarsDef`
- `SupersededDesignElements` による `AppearanceDetail` の `DesignElement` 廃止宣言（§4.8 参照）

典型用途:

- `DB_Label`, `DB_Summary`, `StoryEra` の定義
- `DB_Layer` による DB 実体の配置レイヤー指定
- `DB_File` による DB 実体ファイル名の明示
- `#Ref_` prefix による資料系 DB の既定ファイル名切り替え
- 二次創作 DB ごとの `_Secondaries` 分岐
- 作品専用 list/link 辞書の補足

補足:

- `Databases.#DB_<DbName>.DB_Layer` を指定すると、SW の DB 読み込みと DB 一覧列挙は `DataBases/` 固定ではなく、そのレイヤー配下を探索します。
- `Databases.#Ref_<RefName>.DB_Layer` を指定すると、同じく指定レイヤー配下を探索しつつ、既定ファイル名は `ref_<RefName>.json` を優先します。
- `Databases.#DB_<DbName>.DB_File` / `Databases.#Ref_<RefName>.DB_File` を指定すると、既定ファイル名よりもそのファイル名を優先して参照します。
- 未指定時は従来どおり `DataBases/` を使うため、既存作品のレイアウトは変更不要です。

### 2.5 グローバル / 作品別 `Dictionaries/`

主な責務:

- 辞書専用 DB カタログ (`db_meta.json`)
- 辞書専用型補助 (`db_type.json`)
- `dict_Area.json`, `dict_Faction.json` のような辞書本体

典型用途:

- トップレベル field 名と無関係に流用したい辞書の分離管理
- `#DictIndex` + `$dict` で参照する共通辞書の保存先
- 作品別辞書追加時に `DataBases/` と分離して管理するための拡張ポイント

命名規則:

- 辞書実体ファイルは `dict_{DictName}.json` を正とします。
- `data/Dictionaries/db_meta.json` の各 `Dictionaries.#Dict_*` では、JSON ファイル選択用の `file` フィールドは持たず、SW/UI が `#Dict_*` 名から自動的に `dict_{DictName}.json` を推論します。

---

## 3. `db_type.json` の宣言面

### 3.1 `$DefType`

`$DefType` はトップレベルのフィールド定義配列です。UI と enrich はまずここを見ます。

典型エントリ:

```json
{
  "hashTag": "RaceType",
  "$type": "#ListIndex|#ListIndex_withAbout[]",
  "hashTag_JP": "種族",
  "$display": {
    "section": "basic",
    "tagSpace": "creation"
  }
}
```

主要キー:

- `hashTag`
  - レコード側のトップレベルキー名
- `$type`
  - 型と表示解釈の宣言
- `hashTag_JP`
  - 既定の日本語ラベル
- `$display`
  - セクションや単位などの表示ヒント
- `$alt`
  - 代替キーからの穴埋め候補

### 3.2 `$type`

`$type` は単なる型名ではなく、UI / enrich / 検索で使う解釈ヒントを含みます。

よく使う型:

- `##String_JP`, `##String_EN`
  - 名称・短文系
- `#Summary`
  - 概要・本文系
- `#Number`
  - 数値
- `#String_withAbout`, `#Summary_withAbout`, `#Dialogue_withAbout`
  - `value` と `about_JP/about_EN/about` を持つ補足付き値
- `$EnumDef`, `$EnumDef_<Name>`
  - enum 辞書参照
- `#ListIndex`, `#ListLink`
  - list 辞書参照
- `#DictIndex`
  - 辞書参照。`$dict` に辞書名を持たせる前提で、`Area` / `Belonging` のように field 名と辞書名を切り離したい項目に使う
- `A|B|#Null`
  - union 型
- `...[]`
  - 配列型

内部処理での主用途:

- `TypeDefUtils.looksSearchableType()` による検索対象の推定
- `TypeDefUtils.normalizeValueByTypeSpec()` による軽い正規化
- `TypeDefUtils.looksNumberType()` による index / search 比較

補足:

- `#DictIndex` は「辞書参照である」という宣言を typedef 側に寄せるための型名です。
- `Area` / `Faction` のような共通辞書は、実体を `data/Dictionaries/dict_*.json` へ置き、SW/UI が runtime で `General.$VarsDef` へ合流して使います。
- runtime 合流時には `#Dict_*` を正としつつ、既存実装の互換用に `#List_*` も同じ内容で補完します。
- `#PNGFileName` / `#PNGFilePath` 系フィールドは `$subfolder`（2026-07-10 新設）で画像フォルダの相対パスを明示宣言できます（例: `"$subfolder": "attr/tailsUnit"` → `Images/DB_<DbName>/attr/tailsUnit/`）。未指定の場合は従来通り `TypeDefUtils.inferFolderHintFromKey()` がフィールド名の `_PNG` 接頭辞から推測しますが、`$subfolder` を宣言すればそちらが優先されます。同じ親フォルダ配下を参照フィールドごとにサブフォルダで分けたい場合（`attr/tailsUnit`, `attr/earShape` のように）に使います。
- `#PNGFilePath` / `#PNGFileName` フィールドの値としてDB/Work横断で他の画像フォルダを参照したい場合は、`$Def_DBCrossLinkPath`（2026-07-11 新設、`data/db_type.json` グローバル宣言）を使います。従来の `../../DB_SemiPrimary/...` のような手書き相対パス（ブラウザのURL正規化に依存した非公式な回避策）を廃止し、`{ "_DBCrossLinkPath": { "_DB": "SemiPrimary", "_IsoPath": "..." } }` の形で宣言的に参照します。`_DBLink`（レコード参照機構）とは異なり対象レコードの検索を行わない、パス参照専用の軽量な機構です。詳細は `docs/api-sw-spec.md` §8.3 を参照してください。

### 3.3 `$display`

`$display` は UI 側の表示ヒントです。コードへ if を増やす前に、まずここで表現できるかを確認します。

主なキー:

- `section`
  - `basic/profile/spec/images/other`
- `unit`
  - 単位表示
- `role`
  - wrapper formatter が子要素を意味単位で読むための役割名
- `auto:false`
  - 自動表示から除外
- `aliasOf`
  - 表示上の従属関係のヒント
- `tagSpace`
  - タグ系の見せ方の補助
- `wrapper`
  - 特殊 summary formatter を shared registry へ委譲するための識別子
- `index`
  - object 形式 `#Index` の子要素ごとの制御

`$display.index` の主なキー:

- `list`
- `detail`
- `value`
- `link`
- `priority`
- `order`

これは主に `pages/characters.js` と `TypeDefUtils.getIndexDefInfo()` 周辺で使われます。

補足:

- 2026-05-11 時点では `lib/wrapper-common.js` に最小の value wrapper registry を追加し、UI / Service Worker の shared 層で Day / StoryEra などの特殊 summary formatter を登録できるようにした。
- 現段階の built-in wrapper は `daySummary`, `eraSummary`, `storyEraSummary` で、`pages/characters.js` は registry を先に試し、未一致時だけ generic fallback を使う。
- `StoryEra` は `$MetaType.$Def_StoryEraCatalog.$display.wrapper = storyEraSummary` により、characters 側の local formatter ではなく shared registry 経由で summary を組み立てる本格移行を開始した。
- `Era` も `$MetaType.$Def_StoryEra.$display.wrapper = eraSummary` として shared registry に寄せ、将来 standalone field として露出しても同じ handler シグネチャを再利用できるようにした。
- wrapper handler の最小シグネチャは `format(value, context)` で、`context` は `schemaType`, `defName`, `typeSources`, `helpers` を持つ。戻り値が空文字のときだけ呼び出し側が generic fallback を使う。
- `EnrichmentProcessor` は `wrapper` を持つ top-level field を `_enrichment.wrapperSummaries` へ集約し、SW/UI が summary を再利用できるようにした。現時点では `BirthDay`, `StoryEra` などが対象になる。
- DB カタログ側の summary 生成も `lib/sw-common.js` 内の `StoryEra` 直書きではなく、`$MetaType.$Def_DatabaseCatalog.$DefType` を見て wrapper を持つ項目を `${hashTag}Summary` として追加する方式へ寄せた。

### 3.4 `$VarsDef`

`$VarsDef` は enum/list 辞書です。`db_meta.json(General.$VarsDef)` だけでなく `db_type.json($VarsDef)` 側にも置けます。

よくある形:

```json
"$VarsDef": {
  "$EnumDef_Progress": {
    "#Progress_Released": {
      "Progress": "released",
      "Progress_JP": "公開済み"
    }
  },
  "#List_RaceType": [
    {
      "RaceType": "PortableHumanoid(TaleBeastType)",
      "RaceType_JP": "妖獣型ポータブルヒューマノイド"
    }
  ]
}
```

内部処理では次の用途があります。

- SW の `mergeMetaAndTypeVars()` が `db_meta.json` の辞書と合成する
- `EnrichmentProcessor.getWorkContext()` が global/work の meta/type すべてから辞書を合成する
- `#ListLink_*` の補助情報を wrapper object に補完する

補足:

- `#List_*` は既存の list 辞書キーです。
- `#Dict_*` は辞書 DB 由来の正式キーとして扱い、runtime では必要に応じて `#List_*` へも互換展開します。
- `#DictIndex` を宣言した field は、`$dict` 名に対応する辞書 DB を参照できれば field 名そのものに縛られません。
- global（`data/Dictionaries/`）と作品別（`data/Works_<work>/Dictionaries/`）で同名の `#List_*`/`#Dict_*`（同じ `compatListKey`）を持つ辞書が両方存在する場合、`pages/characters.js` の `mergeVarsDefLayers()` が「配列は連結・objectは浅いマージ」で合成します。片方が丸ごと消える上書きにはなりません（`Dictionaries` カタログ自体も同様に合成されます）。

#### 3.4.1 辞書ファイル単位のスコープ条件（`scopeField`）

- `data/Dictionaries/db_meta.json`（または作品別 `Dictionaries/db_meta.json`）のカタログエントリ（`Dictionaries.#Dict_*`）に任意で `scopeField`（`{ フィールド名: 値, ... }` 形式のオブジェクト）を宣言すると、**その辞書ファイル1本まるごと**を「指定フィールドが指定値のキャラクター向け」として扱えます。複数キーを指定した場合は AND 条件です。
  ```json
  "#Dict_SymphonyXVI": {
    "keyField": "Class",
    "compatListKey": "#List_Class",
    "scopeField": { "Belonging": "シンフォニー.XVI(ゼクズィン)" }
  }
  ```
- 辞書本体（`dict_*.json`）側には行ごとにタグを書きません。`scopeField` の内容は、読み込み時（`lib/sw-common.js` の `readDictionaryBundle()` / `pages/characters.js` の `fetchDirectDictionaryBundle()` / テストの `loadDictionaryBundle()`）に辞書の全行へ自動合成されます（行が同名キーを既に持つ場合は行の値を優先）。
- `scopeField` を持たない辞書（大多数）の行は「スコープを問わない共通行」として扱われます。
- 解決順（`pages/characters.js` の `resolveVarsDefLabelPack()`）は「同一レコードの対応フィールド値と `scopeField` が一致する辞書由来の行 → 一致が無ければ `scopeField` を持たない共通行」です。呼び出し元が `recordContext`（対象レコード自体）を渡さない場合は従来通りスコープを無視して全行から探索するため、既存の呼び出し元への後方互換があります。
- `scopeField` は特定のフィールド名にベタ書きしない汎用の宣言なので、`Belonging` 以外のフィールドを軸にした辞書分岐にも流用できます。

### 3.5 `$IndexDef`

`$IndexDef` は作品別 typedef 側に置くのが現在の正です。旧メタの `$DefType_Index` / `$Def_Index` は後方互換の読み取りのみです。

主用途:

- 一覧 chip の主要 index 表示
- 詳細 header pill の表示
- `idx` / `idxKey` 付き直リンク
- `#Index` の値整形
- index ベース検索比較

内部処理では `EnrichmentProcessor.getWorkContext()` が、まず `workType.$IndexDef` を見て、無ければ旧メタ互換にフォールバックします。

#### 3.5.1 DB単位の上書き（サイドカーキー `$IndexDef_<DbNorm>`、2026-07-11 新設）

`$IndexDef` は本来 Work単位の1宣言ですが、同一Work内の複数DBがそれぞれ異なる意味のIndexを持つ場合（例: 「運命線狐の記録」の `Primary` DBは理学単位 `Unit`、`Proxy` DBは代理世代 `Generation`）、`db_type.json` トップレベルに `$IndexDef_<DbNorm>` を追加宣言することで、DB単位に上書きできます。`DbNorm` は DB名から `#DB_` / `#Ref_` / `#Loc_` prefix を除去し先頭を大文字化したもの（例: `Proxy`, `Primary`）です。

```jsonc
{
  "$IndexDef": { "hashTag": "Unit", "$type": "#String", ... },        // 既定値（Primary 相当）
  "$IndexDef_Proxy": { "hashTag": "Generation", "$type": "#Number", ... }, // Proxy DB専用の上書き
  "$DefType": [ ... ]
}
```

この命名規則は `pkg/cloudflare/scripts/migrate.mjs` の `$IndexDef_${dbNorm}`（D1インデックス投入時のIndex解決）に先行実装があり、GitHub Pages側（`lib/data-common.js` の `EnrichmentProcessor.resolveIndexDefForDb()`、`pages/characters.js` の `getWorkIndexField()`）もこれに合わせています。

- `$IndexDef_<DbNorm>` が未宣言のDB/作品は、常に Work既定の `$IndexDef` にフォールバックします（既存作品は無変化）。
- `resolveIndexDefForDb(ctx, dbName)` は `enrichRecords()` / `searchRecords()` / `normalizeRecordByTypeDef()` の `#Index` 正規化・整形すべてで共通に使われます。
- UI側 `getWorkIndexField(workKey, globalMeta, dbName)` も同じ規則で `state.workTypeDef` からDB固有Indexを解決します。

### 3.6 `$MetaType`

トップレベル `$MetaType` は、作品/DB カタログの補助 schema 宣言です。キャラクター本体の `$DefType` と別系統です。

現状の主な定義:

- `$Def_StoryEra`
- `$Def_CreationWorkCatalog`
- `$Def_OldTitleCatalog`
- `$Def_DatabaseCatalog`
- `$Def_StoryEraCatalog`
- `$Def_SupersededDesignElement`（§4.8 参照）

`$Def_DatabaseCatalog` は現在、`DB_Label`, `DB_Label_EN`, `DB_Summary`, `DB_Layer`, `DB_File`, `StoryEra`, `SecondarySummary` を補助宣言します。catalog key 自体は `#DB_*` に加えて資料系の `#Ref_*` も許容します。

用途:

- `CreationWorks` / `Databases` のメタ項目を docs 上で明示する
- 今後の API / UI 拡張時に「どのメタキーが正式扱いか」を共有する

### 3.7 `$ScalarDef`

`data/db_type.json` のトップレベル `$ScalarDef` は、**基底スカラー型のパターン・フォーマット制約**を宣言します（2026-06-29 追加）。

`$DefType` の `$type` 文字列から参照される型エイリアスの一種ですが、フィールド定義（`$DefType`）ではなく「型そのもの」を定義するための場所です。

現状の定義:

- `#Hexcode` — カラーコード基底型（`pattern: "^#[0-9A-Fa-f]+"` など制約を持つ）
- `#Hexcode_Color` — `extends: "#Hexcode"` + 6/8桁 hex 限定パターン（`^#[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?$`）

利用方法:

- `$Def_AppearanceAttr` の `value_Color` フィールドなどが `#Hexcode_Color` を参照する前提で設計されています。
- UI 側のバリデーションや表示ヒントに使えますが、現時点では表示処理への組み込みは段階的な予定です。

---

## 4. `db_meta.json` の宣言面

### 4.1 `CreationWorks`

グローバル `data/db_meta.json` に置く作品カタログです。

主なキー:

- `Title`
- `Title_EN`
- `Works_Summary`
- `OldTitles[]`
- `$DetailLayout`

この情報は `StandardEndpointHandlers.buildWorkCatalogEntry()` で works 系 API へ正規化されます。

### 4.2 `$DetailLayout`

`CreationWorks.<work>.$DetailLayout` は、UI 側の詳細表示で補助的に使います。

主なキー:

- `headerPills`
  - 詳細上部の pill 群に出す項目
- `basicFields`
  - basic セクションへ優先表示する項目

注意点:

- 表示順の完全な正は `$DefType` だが、詳細画面の強調順は `$DetailLayout` が補助する
- `Belonging` などの補助項目は、`basicFields` にすでに含まれている場合は UI 側で重複抑制される

### 4.3 `Databases.#DB_<DbName>`

作品別 `db_meta.json` の DB カタログです。

主なキー:

- `DB_Label`
- `DB_Label_EN`
- `DB_Summary`
- `DB_Layer`
- `DB_File`
- `StoryEra`
- `SecondarySummary`
- `_Commons`
- `_Secondaries`

`DB_Label` / `DB_Label_EN` は、works/{work}/db 一覧と UI の DB セレクト・概要ヘッダで使われます。未定義時は `StandardEndpointHandlers.buildDefaultDatabaseCatalogLabels()` が既定ラベルを補います。

`DB_Layer` は DB 実体の配置ディレクトリを表す補助キーで、未指定時は `DataBases` とみなされます。`Glossaries` や `References` を段階導入する際の入口として使います。

`#Ref_*` は資料系 DB 用の catalog key で、未指定の実体名を `ref_<Name>.json` として扱います。たとえば `#Ref_Glossary` は `References/ref_Glossary.json` を既定候補として引きます。

`DB_File` は DB 実体のファイル名を表す補助キーで、未指定時は `#DB_*` なら `db_<DbName>.json`、`#Ref_*` なら `ref_<Name>.json` を使います。既定名から外したい場合だけ明示します。

画像ディレクトリ名もこの catalog key 系に揃え、通常 DB は `Images/DB_<DbName>/...`、資料系 DB は `Images/Ref_<RefName>/...` を既定とします。作品共通画像のみ `Images/General/` を使います。

資料系 DB の画像定義は shared `data/References/db_type.json` を土台にしつつ、作品別 `References/db_type.json` の `Images.*` 宣言で上書きや追加を行えます。UI の画像解決では、この 2 層を合流したうえで field 名から folder hint を導出し、DB 固有名のハードコード追加を避けます。

### 4.4 `StoryEra`

`StoryEra` は厳密な日付型ではなく、物語年代を表す構造化メタです。

`data/db_type.json` のトップレベル `$MetaType` では、まず単点の年代要素を表す `$Def_StoryEra` を持ち、その配列を束ねる形で `$Def_StoryEraCatalog` を定義します。

`$Def_StoryEra` の主なキー:

- `EraGen`
- `YearInEra`
- `byRealYear`
- `about_JP`
- `about_EN`

よく使うキー:

- `FromEra`
- `ToEra`
- `InEra`
- `about_JP`
- `about_EN`

考え方:

- `FromEra` / `ToEra` / `InEra` は、いずれも `$Def_StoryEra[]` を要素とする配列です
- 1 つの年代について「創作内の紀年」と「現実年換算」を並列表現できるよう、`EraGen` / `YearInEra` と `byRealYear` を同居させます
- `about_JP` / `about_EN` は、人手で整えた概要ラベルを優先表示したい場合の補助です

UI 側は厳密構造より `about_JP` / `about_EN` を優先して整形表示します。
`about_*` が未指定の場合は、現状の `pages/characters.js` では `InEra` を優先し、無ければ `FromEra` / `ToEra` から簡易 summary を自動生成します。

2026-05-11 時点では、`$Def_StoryEraCatalog` / `$Def_StoryEra` / `$Def_Day` に `$display.role` を導入し、summary 組み立ての優先順位を schema から参照できるようにし始めています。

現在の role:

- `$Def_StoryEraCatalog.FromEra`: `rangeStart`
- `$Def_StoryEraCatalog.ToEra`: `rangeEnd`
- `$Def_StoryEraCatalog.InEra`: `representativePoint`
- `$Def_StoryEraCatalog.about_JP`: `preferredLabel`
- `$Def_StoryEraCatalog.about_EN`: `preferredLabelAlt`
- `$Def_StoryEra.EraGen`: `eraGeneration`
- `$Def_StoryEra.YearInEra`: `eraYear`
- `$Def_StoryEra.byRealYear`: `realYear`
- `$Def_StoryEra.about_JP`: `pointLabel`
- `$Def_StoryEra.about_EN`: `pointLabelAlt`
- `$Def_Day.Month`: `month`
- `$Def_Day.DayOfMonth`: `dayOfMonth`
- `$Def_Day.DayAbout`: `annotation`

ただし `Day` は実データが `Day: { Month, DayOfMonth }` のラッパーを持つため、現段階では role 解釈と既存 shape 互換の併用です。

### 4.5 `General.$VarsDef`

`db_meta.json` 側の `General.$VarsDef` は、表示辞書の最も古い置き場です。現在でも重要ですが、`db_type.json($VarsDef)` と分散配置される前提です。

そのため実行時には、**meta だけ見ても辞書が完結しない** 場合があります。

`$VarsDef` には enum 辞書（`$EnumDef_*`）だけでなく、**複合オブジェクト型の `$DefType` 定義**を持つオブジェクト（`$Def_*` キー）も置けます。

例（`data/db_meta.json` に置かれているカスタム型）:

- `$Def_AppearanceDetail` — `Formation` / `BodyPart` / `DesignElement` / `Attrs` 等を持つ外見デザイン詳細エントリ
- `$Def_AppearanceAttr` — `AttrLabel` + 規約駆動フィールド（`vdict_*` / `value_*` / `about_*`）を持つ属性行

これらは `db_type.json($DefType)` の `$type` 文字列（例: `"$Def_AppearanceDetail[]|#Null"`）から参照されます。UI / SW はこの `$type` 参照を辿って `$DefType` を解決します。

### 4.6 `_Commons`

`_Commons` は、同一 DB のレコードへ一律に穴埋めしたい共通フィールドです。

例:

- 所属の既定値
- 種族の既定値
- list 条件に応じた補助 class 名

内部処理では `CommonsProcessor.applyCommonsToRecords()` が適用します。

ルール:

- 空値だけ埋める
- 作品別 `db_meta.json` 欠損時はスキップする
- DB 本体の取得や検索は止めない

### 4.7 `_Secondaries`

`_Secondaries[]` は、`sec_**` 条件ごとに `_Commons` を切り替える定義です。

マッチングの考え方:

- すべての `sec_**` が `null` / 空の要素は fallback
- 条件付き要素が一致したらそちらを優先
- 曖昧な条件は誤適用しないように扱う
- `sec_SeriesTitle` で要素が特定できた場合は、その要素の `sec_Category` / `sec_DesignedBy` も空欄時にレコードへ補完できる
- UI 側の二次創作 meta 表示は、必要に応じて `$MetaType.$Def_SecondaryMeta` を参照して項目とラベルを決められる

これは主に `Secondary` / `SelfSecondary` のような二次創作系 DB で使います。

### 4.8 `SupersededDesignElements`

`AppearanceDetail[].DesignElement` の特定の値を、汎用カタログ運用から専用構造化フィールドへ移行（廃止）した際、そのことを宣言するための作品別トップレベルキーです（`Databases`/`General` と同じ階層）。型は `$MetaType.$Def_SupersededDesignElement`（§3.6）で宣言し、データは各作品の `db_meta.json` に配列で持たせます。

背景: `TailsUnit`（尻尾）が `AppearanceDetail[].DesignElement:"#Element_TailsUnit"` から専用フィールド `TailsUnit`（`$Def_TailsUnit[]`）へ移行した際、この宣言機構が無かったため、テスト・ドキュメント・`addon-ai-tag` 側の AIHints ツールの複数箇所で個別に手作業クリーンアップが必要になり、一部（`tools/patch-aihints.mjs` の分類マップ等）に廃止済みキーへの参照が残っていた。以後、同様の移行を行う際はこの宣言を追加することで、テスト（`tests/data.shape.test.js`）が自動的に汎用チェックできるようにする。

例（NumberTales `data/Works_NumberTales/DataBases/db_meta.json`）:

```json
"SupersededDesignElements": [
  {
    "DesignElement": "#Element_TailsUnit",
    "SupersededByField": "TailsUnit",
    "SupersededByType": "$Def_TailsUnit[]",
    "SupersededDate": "2026-07-07",
    "Note_JP": "尻尾の形状情報は AppearanceDetail(#Element_TailsUnit) から専用構造化フィールド TailsUnit($Def_TailsUnit[]) へ全面移行済み。",
    "Note_EN": "Tail shape info was fully migrated from AppearanceDetail (#Element_TailsUnit) to the dedicated TailsUnit ($Def_TailsUnit[]) field."
  }
]
```

`tests/data.shape.test.js` の `SupersededDesignElement schema` テスト群は、この配列に列挙された `DesignElement` 値が、対象作品のどの DB ファイルの `AppearanceDetail[]` にも一件も使われていないことを機械的に検証します。新しい `DesignElement` を廃止する際は、この配列へ1行追加するだけでテストが自動的に追従します（テストコード側の個別追記は不要）。

---

## 5. 実行時の合流順

### 5.1 works/db カタログ系 API

`lib/sw-common.js` の `StandardEndpointHandlers` が担当します。

主な流れ:

1. `readGlobalMeta()` で `CreationWorks` を読む
2. `buildWorkCatalogEntry()` で `Title` などを整形する
3. `listWorkDBs()` で `db_*.json` 一覧を作る
4. 作品別 `readWorkMeta()` が読めれば `decorateDatabaseCatalogEntries()` で `DB_Label` / `DB_Summary` / `StoryEra` を付与する
5. 作品別 meta が欠損していれば bare な DB 一覧だけ返す

ここで使われる宣言面:

- `data/db_meta.json -> CreationWorks.*`
- `data/Works_<作品>/DataBases/db_meta.json -> Databases.#DB_*`

### 5.2 `deftype` / `varsdef` の合流

`ApiEndpointHandlers.mergeMetaAndTypeVars()` は、`db_meta.json` と `db_type.json` の辞書面を API 用に合流します。

合流対象:

- `meta.General.$VarsDef`
- `type.$VarsDef`

重要:

- これは `$DefType` 全体を混ぜる処理ではない
- 目的は「表示辞書を API 利用側から見やすくすること」

### 5.3 enrich / search 用 work context の構築

`lib/data-common.js` の `EnrichmentProcessor.getWorkContext()` が中心です。

読み込むもの:

1. グローバル `db_meta.json(General.$VarsDef)`
2. 作品別 `db_meta.json(General.$VarsDef)`
3. グローバル `db_type.json($VarsDef)`
4. 作品別 `db_type.json($VarsDef)`
5. グローバル `db_type.json($DefType)`
6. 作品別 `db_type.json($DefType)`
7. 必要に応じてグローバル `db_meta.json(CreationWorks.<work>)`

そこから作るもの:

- `mergedVars`
- `defTypeMerged`
- `indices`
- `indexDef`

`indexDef` の優先順位:

1. `workType.$IndexDef`
2. `globalMeta.CreationWorks.<work>.$DefType_Index`
3. `globalMeta.CreationWorks.<work>.$Def_Index`

補足（2026-07-11）: `getWorkContext()` が返す `ctx.indexDef` は「work既定」の値です。DB単位の解決が必要な箇所（`enrichRecords()` / `searchRecords()` / `normalizeRecordByTypeDef()`）は、`ctx.indexDef` を直接使わず `EnrichmentProcessor.resolveIndexDefForDb(ctx, dbName)` を経由します。これは `ctx.workType` から `$IndexDef_<DbNorm>`（§3.5.1）を先に探し、無ければ `ctx.indexDef` にフォールバックします。

補足（2026-07-10）: `indices.imagePathHints` を作る `TypeDefUtils.buildImagePathHints()` は、`$type` が配列のインラインネスト（例: `Images` フィールド）だけでなく、`"$Def_TailsUnit[]"` のような名前付き型参照文字列も `CharacterValueWrapperRegistry.helpers.resolveTypeDefEntries()`（`lib/wrapper-common.js`、SW側は `importScripts` で先に読み込まれるため同一グローバルスコープから参照可能）経由で解決し、内部の画像フィールドまで再帰的に辿ります。これにより `$Def_TailsUnit.TailsUnit_PNGName` や `$Def_AppearanceDetail.img_PNGName` のような、名前付き構造化型の内部に宣言された画像フィールドも typedef 駆動で自動検出されます。

### 5.4 `$DefType` マージ

`TypeDefUtils.mergeDefTypes(globalType, workType)` が、グローバルと作品別 `$DefType` を結合します。

方針:

- グローバルの並び順を土台にする
- 同じ `hashTag` は作品側定義で上書きする
- 作品側だけにある `hashTag` は末尾追加する

結果:

- UI や enrich から見た「その作品の最終的な `$DefType`」を 1 つにできる

### 5.5 `_Commons` 適用

`lib/sw-common.js` の `CommonsProcessor.applyCommonsToRecords()` が DB 取得時に実行されます。

主な適用箇所:

- `bootstrap`
- `works/{work}/db/{dbName}`
- `search`

注意:

- `works/{work}` や `works` のカタログ取得では `_Commons` は使わない
- meta 欠損時は単にスキップする

### 5.6 `_DBLink` / `_Jump` / `$alt` / `displaySections`

`EnrichmentProcessor.enrichRecords()` の大まかな順序は次の通りです。

1. `normalizeRecordByTypeDef()` で `$DefType` ベースの軽い正規化
2. `_DBLink` の参照先解決
3. `_Jump` ラッパーの実値置換
4. 同名フィールドの空値マージ
5. `$alt` による代替キー穴埋め
6. `#ListLink_*` 辞書から wrapper 補完
7. 画像候補、検索用文字列、`displaySections` の付与

ここで見る宣言面:

- `$DefType`
- `$VarsDef`
- `$IndexDef`
- `Databases.#DB_*._Commons`
- `Databases.#DB_*._Secondaries`

---

## 6. UI が何をどこから使うか

主な利用箇所:

- `pages/characters.js -> fetchGlobalDefType()`
  - `deftype/global` を取得し、必要なら直 fetch で辞書を回復
- `pages/characters.js -> fetchWorkTypeDef()`
  - 作品別 typedef を取得
- `pages/characters.js -> listWorks()`
  - works カタログの `Title` などを利用
- `pages/characters.js -> listWorkDBs()`
  - DB カタログの `DB_Label` などを利用
- `pages/characters.js -> renderSelectionMeta()`
  - `Works_Summary`, `OldTitles`, `DB_Summary`, `StoryEra` を表示

つまり UI は、**本体表示では typedef を優先し、選択 UI や作品/DB の概要では meta カタログを使う** という分担です。

---

## 7. 変更したい内容ごとの更新先

### 7.1 新しいキャラクターフィールドを増やしたい

更新先:

- 対象 `db_*.json`
- 対象 `db_type.json($DefType)`

必要に応じて:

- `db_meta.json(General.$VarsDef)`

### 7.2 enum/list の表示名を足したい

更新候補:

- `db_meta.json(General.$VarsDef)`
- `db_type.json($VarsDef)`

判断基準:

- 既存の meta 辞書に寄せたいなら meta
- 作品固有の schema と一緒に閉じたいなら typedef

### 7.3 作品概要や DB 概要を変えたい

更新先:

- グローバル `db_meta.json -> CreationWorks`
- 作品別 `db_meta.json -> Databases.#DB_*`

### 7.4 詳細画面の強調項目を変えたい

更新先:

- `CreationWorks.<work>.$DetailLayout`
- 必要なら `$DefType.$display.section`

### 7.5 DB セレクトの表示名を変えたい

更新先:

- `Databases.#DB_<DbName>.DB_Label`
- `Databases.#DB_<DbName>.DB_Label_EN`

### 7.6 `AppearanceDetail` の `DesignElement` を廃止して専用フィールドへ移行したい

更新先:

- `data/db_type.json($MetaType.$Def_SupersededDesignElement)`（型宣言、通常は変更不要）
- 対象作品の `db_meta.json(SupersededDesignElements)`（廃止した `DesignElement` を1件追加。§4.8 参照）

---

## 8. よくある誤解

### 8.1 `db_meta.json` だけ直せば UI 本体も追従する

必ずしもそうではありません。キャラクター本体の表示セクションや検索補助、画像ヒントは基本的に `$DefType` が正です。

### 8.2 `db_type.json($VarsDef)` か `db_meta.json(General.$VarsDef)` のどちらか一方だけ見ればよい

違います。実装は両方を見る前提です。特に enrich/search は global/work の meta/type をすべて合成します。

### 8.3 `works/{work}/db` が返すラベルは DB ファイル名そのもの

現在は `DB_Label` / `DB_Label_EN` を優先し、無いときだけ既定表示名へフォールバックします。

### 8.4 `_Commons` はデータ本体を書き換える

永続ファイルを書き換えるわけではありません。API 応答や enrich の直前で、読み出したレコードへ補完的に適用されます。

---

## 9. 関連資料

- `docs/db-update-guidelines.md`
- `docs/api-sw-spec.md`
- `docs/implementation-playbook.md`
- `.github/copilot-instructions.md`
