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

典型用途:

- `DB_Label`, `DB_Summary`, `StoryEra` の定義
- 二次創作 DB ごとの `_Secondaries` 分岐
- 作品専用 list/link 辞書の補足

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

### 3.3 `$display`

`$display` は UI 側の表示ヒントです。コードへ if を増やす前に、まずここで表現できるかを確認します。

主なキー:

- `section`
  - `basic/profile/spec/images/other`
- `unit`
  - 単位表示
- `auto:false`
  - 自動表示から除外
- `aliasOf`
  - 表示上の従属関係のヒント
- `tagSpace`
  - タグ系の見せ方の補助
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

### 3.5 `$IndexDef`

`$IndexDef` は作品別 typedef 側に置くのが現在の正です。旧メタの `$DefType_Index` / `$Def_Index` は後方互換の読み取りのみです。

主用途:

- 一覧 chip の主要 index 表示
- 詳細 header pill の表示
- `idx` / `idxKey` 付き直リンク
- `#Index` の値整形
- index ベース検索比較

内部処理では `EnrichmentProcessor.getWorkContext()` が、まず `workType.$IndexDef` を見て、無ければ旧メタ互換にフォールバックします。

### 3.6 `$MetaType`

トップレベル `$MetaType` は、作品/DB カタログの補助 schema 宣言です。キャラクター本体の `$DefType` と別系統です。

現状の主な定義:

- `$Def_CreationWorkCatalog`
- `$Def_OldTitleCatalog`
- `$Def_DatabaseCatalog`
- `$Def_StoryEraCatalog`

用途:

- `CreationWorks` / `Databases` のメタ項目を docs 上で明示する
- 今後の API / UI 拡張時に「どのメタキーが正式扱いか」を共有する

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
- `StoryEra`
- `SecondarySummary`
- `_Commons`
- `_Secondaries`

`DB_Label` / `DB_Label_EN` は、works/{work}/db 一覧と UI の DB セレクト・概要ヘッダで使われます。未定義時は `StandardEndpointHandlers.buildDefaultDatabaseCatalogLabels()` が既定ラベルを補います。

### 4.4 `StoryEra`

`StoryEra` は厳密な日付型ではなく、物語年代を表す構造化メタです。

よく使うキー:

- `FromEra`
- `ToEra`
- `InEra`
- `about_JP`
- `about_EN`

UI 側は厳密構造より `about_JP` / `about_EN` を優先して整形表示します。

### 4.5 `General.$VarsDef`

`db_meta.json` 側の `General.$VarsDef` は、表示辞書の最も古い置き場です。現在でも重要ですが、`db_type.json($VarsDef)` と分散配置される前提です。

そのため実行時には、**meta だけ見ても辞書が完結しない** 場合があります。

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
