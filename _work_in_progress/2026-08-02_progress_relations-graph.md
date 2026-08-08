# 2026-08-02 進捗: キャラクター相関図ページ（`pages/relations.html`）の新設

> **ステータス（2026-08-02 時点）: Phase −1 〜 3-C まで完了。次回は 3-D（遷移アニメーション）から。**
> `npm test` **58 ファイル / 1,063 テスト成功**（着手前 46 / 631）。
> `npm run data:order:check` 0/1310 ・ `npm run agents:check` 一致。
>
> 本ログは着手前に作成し、以降の全 Phase で継続更新する。方針を変更した場合は
> **まずこのログへ反映してから実装へ戻る**（作業中の融通を効かせるための運用）。

---

## 目的

創作DB には、キャラクター同士のつながりを表すフィールドが 4 系統ある。

| 系統 | スコープ | 実データ量（公開分・実測） |
| --- | --- | --- |
| `Relation` = `{Related[], Commented[]}` | 同一DB内 | Related 328 / Commented 373 |
| `RelationTo_Primary` | 同一作品の別DB | 51 |
| `*_DBLink`（`$Def_DBLinkRef` 型・全7種） | DB跨ぎ／作品跨ぎ | 259 |
| `ThisMasters[]._DBLink` | 作品跨ぎ（キャラ→主人） | 21 |

現状これらは**キャラシート詳細の中で 1 キャラずつ**しか見えない
（`lib/section-renders/relation.js` / `dblink.js` / `thisMasters.js`）。
作品全体・作品横断で「誰と誰がどうつながっているか」を俯瞰する手段が無い。

本作業では、キャラシートページ（`pages/characters.html`）とは**独立した新規ページ**として
全創作タイトルのキャラクター相関図を実装する。

### 既存キャラシートとの役割分担

| | `pages/characters.html` | `pages/relations.html`（新規） |
| --- | --- | --- |
| 単位 | 1 キャラの詳細 | キャラ間の関係の俯瞰 |
| 入口 | 作品 → DB → 一覧 → 詳細 | 全作品の集約 → ドリルダウン |
| 関係の見え方 | 当該キャラの関係先リスト（片方向） | グラフ（相互畳み込み済み） |
| 相互導線 | 詳細から相関図へ | ノードからキャラシート直リンクへ |

---

## User との合意事項（着手前確認）

1. **描画は Cytoscape.js を `pages/vendor/` へ同梱**（three.js と同じ先例パターン。外部CDN非依存）
2. **尺度は「スコープ」＋「グルーピング」の 2 本立て**（1 本のセレクタで切り替える案は不採用）
3. **エッジは全種を対象**（`Relation` / `RelationTo_*` / `*_DBLink` 全7種 / `ThisMasters[]._DBLink`）
4. **段階分けして進める**（Phase ごとに動作確認・レビュー。総見積が 500 行を大きく超えるため）
5. **UI 参考はアークナイツ**。優先度は ①ノードマップの操作感 → ②複数ペイン階層の画面構成。
   **見た目のトーンは踏襲しない**（配色・書体・装飾は既存 `characters.css` の CSS 変数のみを使う）
6. **着手前に本ログを作成する**（Phase −1）

### 作業中に追加・変更された合意（随時追記）

- 2026-08-02: `RealationLabel` のタイポは User がコミット `0eb6215 タイポ修正` で解消。
  読み取り側の互換吸収（`RelationLabel || RealationLabel`）は実装しないことに決定。

---

## 検証で覆った前提（実測値に基づく確定事項）

着手前に 9 エージェントで実測検証したところ、当初の想定が 3 点覆った。

### 1. `/pages/v1/bootstrap` は速くない → Phase 0 で先に高速化する

`/pages/v1/bootstrap`（既定 `includeRecords=1&enrich=1`）は必要なデータを**すべて返す**が、
実ネットワークでは **2105 リクエスト / 25.46 MiB / 30〜60 秒級**。
原因は `DataFetcher` が同一 `db_meta.json` を何度も読み直すこと
（`Works_FLInvestigator78/DataBases/db_meta.json` が **39 回**）。

→ `lib/sw-common.js` の `DataFetcher` に Promise 合流メモ化を入れる。
実測で **2105 → 約 180 リクエスト / 25.46 → 2.57 MiB**、30ms/req 注入時 28.7s → 5.7s。
**既存 `pages/characters.html` も同じ経路**なので、相関図と切り離して単独で価値がある。

`enrich=0` での軽量取得は**採用しない**。`enrich=0` だと `lib/data-common.js` の
`supplementIndexFieldFromVarsDef` が走らず、PastDivers の `Chronos` が `{"Lunar":"Mutsuki"}` のままになり、
ネスト複合 Index を持つ 5 作品のノード照合が壊れる。

### 2. ノードキーは「単一 `keyPath:value` 対」では衝突する

`lib/section-renders/relation.js:128` の現行ロジック（最初の非空サブキー 1 個だけを返す）を実データへ適用すると、
UnibyteLive/Primary 35 件のうち 26 件が `AlphaGen=1` に、FLInvestigator78/Primary 34 件が `SuitNum` で多重衝突。
**計 5 作品 / 8 DB で破綻する。**

→ ノードキーは **DBスコープ済み `$IndexDef` の全サブキーを、キー名昇順ソート＋`String()` 正規化して連結**する。

```
nodeKey = `${workId}|${dbName}|` + 全サブキーを [キー名昇順] で `k=v` 連結
  NumberTales/Primary        → "NumberTales|Primary|Num=57"
  FLInvestigator78/Primary   → "FLInvestigator78|Primary|Num=16,Suit=Major,SuitNum=16"
```

公開 1312 件で **100% 一意**（実測）。ソートが必須なのは `_DBLink` ペイロードのキー順が揺れているため
（`Card{Suit,SuitNum}` 55 件 vs `Card{Suit,Num}` 6 件）。`JSON.stringify` はキー順が入力順依存なので使わない。

### 3. 「作品別」尺度は 9 作品中 5 作品で成立しない

`Relation` 752 本は **100% ナンバーテールズ単独**。FLInvestigator78 / パストダイヴァー / ハンカクライブは
typedef に宣言があるだけで実データ 0 件。

| 作品 | 公開ノード | 作品内エッジ | 平均次数 |
| --- | ---: | ---: | ---: |
| NumberTales | 301 | 693+ | **5.44**（Primary 単体） |
| FLInvestigator78 | 66 | 33 | 1.00（孤立ペアが並ぶだけ） |
| UnibyteLive | 46 | 23 | 1.00（同上） |
| PastDivers | 17 | **0** | 0 |
| DestinyFoxRecords | 15 | — | — |
| UnauthedLogica | 11 | **0** | 0 |
| SinisterChangingGirls | 8 | **0** | 0 |
| VirtuesUs | 8 | **0** | 0 |
| ShouArRiders | 7 | **0** | 0 |

→ **エッジ密度 < 1.0 の作品は、グルーピング軸を実ノード化した 2 部グラフへ自動フォールバック**する
（`FromArea` / `RaceType` / `Belonging` / `Class` を中間ノードにする）。
既定スコープも「作品別」ではなく**「創作タイトル全体（作品を集約ノードで表示）」**とする。

### 4. Cytoscape は `layout` 未指定だと既定で `grid` を走らせ、渡した座標を無言で上書きする（Phase 3-B2）

`cytoscape({ container, elements })` で `layout` を省くと **`grid` レイアウトが実行され、
element に載せた `position` が破棄される**。マス塗りのアンカーが等間隔グリッドへ飛ばされ、
背景 canvas の塗りと Cytoscape の描画が別々の場所に出た（アンカーが全て `y=113` / x が 147.2 刻みで発覚）。
例外も警告も出ないので、座標を自前で決める設計では必ず `layout: { name: 'preset', fit: false }` を明示する。
→ `tests/pages.relations.syntax.test.js` に静的チェックを追加。

### 5. Cytoscape へ `color-mix()` / `var()` は渡せない（Phase 3-A）

| 経路 | 実測 |
| --- | --- |
| `getComputedStyle().getPropertyValue('--mix24')` | `"color-mix(in srgb, …)"` が**未解決の文字列のまま**返る（未登録カスタムプロパティは置換されない） |
| Cytoscape へ `color-mix()` / `color(srgb …)` / `oklab()` | **拒否して `#999` へフォールバック**。例外を投げず警告のみ |
| `getComputedStyle` でプローブ要素から取り出す | Chromium は `color(srgb …)`、Firefox は `rgb()` を返す＝**エンジン依存** |

「色が出ない」のではなく「灰色になるだけで気づけない」のが厄介。
`lib/graph/graph-palette.js` の `mixSrgb()` で実値を作って渡す
（CSS の `color-mix(in srgb, …)` と **12/12 のケースで数値一致**を実測）。

### 6. マス塗りを Cytoscape ノードにすると `cy.layout()` が破綻する（Phase 3-B2）

`relations.js` の `numIter = 24,000,000/n²` により **n=200 で 672.7ms のプラトー**に張り付き
（n=13 → 6.5ms / n=100 → 162ms）、さらに `nodeCount > 400` で**無言に `grid` へ切り替わってセル座標が壊れる**。
自前 pointy-top polygon は頂点がノード中心の縦ラインに乗り**当たり判定の誤判定率 33.3%**、
`shape-polygon-points` に `[-1,1]` 外の値を書くと**ページごとクラッシュ**する。
→ **背景 canvas レイヤーへ直接描き、Cytoscape のノード数はグループ数（4〜27）に据え置く。**

### 7. 「1〜2 秒」は描画時間ではなかった（Phase 3 の見積り前提）

初回ロード 1426ms の内訳は SW 準備 67ms / **bootstrap 取得 938ms** / typedef+辞書 165ms /
buildGraph+初回描画 73ms。**描画は全体の約 2.5%**。
実際の `renderGraph()` は全 9 作品×全ドリル段を巡回して **2.6〜41.4ms**、
最大要素数は **17 ノード / 38 エッジ**（ドリル階層が絞るため **478 ノードは一度に描画されない**）。
この事実が、交差削減のような O(n·m²) 級の後処理を許容できる根拠になっている。

### 8. 格子へ向きを揃えるだけでは図が**悪化する**（Phase 3-C）

線の向きを 6 方向へ制約すると、別々の辺が同じ経路へ集まる。
実測（13 ノード / 35 辺）で **53 本の線分のうち 83% が完全な重なりに巻き込まれ、最大 5 本が 1 本に潰れた**。
交差は減っても重なった線は追えないので、User の目には「余計によくわからない」状態になった。

さらに、重なりを避けるためにレーンをずらす方法にも落とし穴があった。

| 方式 | 重なり | 脚の 60° からのずれ |
| --- | ---: | --- |
| ① 格子へ向きを揃えるだけ | **83%** | 0°（厳密） |
| ② 弦に直角へずらす | 0% | **中央値 9.8° / 最大 27.7°**（「への字」に崩れる） |
| ③ 両端に渡りを挟む 3 点方式 | 0% | **中央値 0.00°** |

②が崩れるのは、端点がノードに固定されているため折れ点を動かすと脚が必ず傾くから。
③は「元の脚を法線方向へ δ ずらした 2 直線の交点」を中央の折れ点に置き、
両端に δ px の短い渡りを挟むことで**主要な脚の向きを厳密に保つ**。

### 補足: 既存関数の切り出しは「ほぼ不要」だった

`pages/characters.js` の Index 解決関数（`getWorkIndexField` 他）は `window.__CHAR_STATE__` 依存で
**非現在作品では `null` / `[]` を返す**ため、全 9 作品を同時に描く相関図では**そもそも動かない**。
`collectIndexEntries` は `formatValueForDisplay`（1205 行）と `location` / `localStorage` に依存し、
DOM を外すと `ReferenceError` で落ちる（実測）。

代わりに **`lib/data-common.js` に既にある DOM 非依存 API をそのまま使う**:

- `TypeDefUtils.getIndexDefInfo()` (:2500)
- `TypeDefUtils.pickPrimaryIndexSubDef()` (:2526)
- `TypeDefUtils.collectIndexAliasDefs()` (:2563)
- `TypeDefUtils.matchesSlot()` (:2089) — `$slot` 述語の評価
- `EnrichmentProcessor.resolveIndexDefForDb()` (:393)
- `EnrichmentProcessor.resolveImagePath()` (:3127) — `_enrichment.primaryImage` が `/data/...` 絶対パスで返るため
  **画像パス解決の切り出しは不要**

切り出すのは `lib/viewer-locator.js` と `lib/page-api-bridge.js` の **2 モジュールだけ**。

---

## 実装方針

### 尺度 = スコープ × グルーピングの直交 2 軸

| セレクタ | 選択肢 |
| --- | --- |
| **スコープ**（何を表示するか） | 全作品 / 作品を選択 / 作品＋DBを選択。二次創作 DB のトグルを併設 |
| **グルーピング**（どう束ねるか） | なし / 作品 / DB / 所属(`Belonging`) / クラス(`Class`) / 出身(`FromArea`) / 種族(`RaceType`) |

User の 5 尺度は**プリセットボタン**として並べ、押すと上記 2 セレクタが設定される。
グルーピングは Cytoscape の **compound node（parent/child）** で表現し、色分けとクラスタ配置を同時に成立させる。
グルーピング軸は **`$dict` 宣言を持つ `$DefType` エントリを走査して自動列挙**する（field 名をハードコードしない）。

### エッジ抽出はスキーマ駆動（新しい schema 語彙は増やさない）

| 検出方法 | エッジ種別 |
| --- | --- |
| `$display.sectionWrapper === "relationSection"` ＋ `RelationTo_` 接頭辞 | `Related` = 関係 / `Commented` = 言及・コメント |
| `$typeIncludes: "$Def_DBLinkRef"` かつ `$enrich === true` | **同一存在**（`AnotherRegions` / `SameModels` / `ThisArcanaHolder`） |
| 同上 かつ `$enrich !== true` | **別版・派生**（`AnotherVersions` / `SameMPSeries` / `ArcanaHolding` / `ThisPerformer`） |
| `$Def_*` を辿って `$Def_DBLinkRef` を満たす子を持つ構造（`ThisMasters[]`） | **主従** |

**`Relation` の typedef 改修は不要と判断した。**
`$slotMatch.$typeIncludes` は `$type` が配列（インライン構造体）のエントリに一致しない仕様
（`lib/data-common.js:2102`）で、`Relation` の `$type` は配列。一方 `$display.section` は
`basic|profile|spec|images|other` の固定 enum（`lib/data-common.js:1602`）なので `section: "relations"` は追加できない。
**すでに 4 作品すべてが `$display: {"sectionWrapper": "relationSection"}` を宣言済み**であり、
これが `Images` の `$display.section === "images"` と同じ「宣言で識別する」役割を果たしている。
→ **`data/` 側の変更なしでスキーマ駆動が成立する。**

### 相互参照の畳み込み

有向 1032 本のうち**相互参照が 131 組**。畳まないとエッジ数が 17% 水増しされ、レイアウトが二重線で歪む。
無向ペアへ畳んだ **772 本**を描画本数の正とし、向きは `aToB` / `bToA` / `mutual` の属性として保持する。

### 同一人物の集約

`$enrich: true` の `*_DBLink` で推移的に結ばれたレコードを **Union-Find で 1 グループ化**する
（`tools/build-calendar-ics.mjs` の先例）。`$enrich: false` は別人物なので束ねない。
FLInvestigator78 は 66 → 約 38 ノードになる。

### UI（アークナイツ参照の反映）

**① ノードマップの操作感（最優先）**
集約ノード（9 作品）から始まり、クリックで 1 段ずつ展開する **LOD ドリルダウン**
（全作品 → 作品 → DB → キャラ）。同時表示ノードを実質 120 以下に保つ。
パンくずで階層を戻る（`pushState`）。フォーカスノードからの経路をハイライトし、それ以外は減光（消さない）。
ミニマップとズーム／パン／ピンチ（Cytoscape ネイティブ）。展開座標はキャッシュし、戻ったときに図が跳ねないようにする。

**② 複数ペイン階層（第二）**
左レール（スコープ／グルーピング／エッジ種別／検索／凡例）― 中央キャンバス ― 右インスペクタ。
768px 未満では左レールを折りたたみ、インスペクタをボトムシートへ。

**③ 見た目は踏襲しない**
配色・書体・角丸・余白はすべて `pages/characters.css` の CSS 変数を流用。
`relations.html` は `characters.css` を先に読み `relations.css` を重ねる
（`index.html` が `./pages/characters.css` を直 link している先例に倣う）。
`relations.css` が未生成でも「装飾が欠けるが機能はする」状態を保つ。

### URL 状態

既存の `c` / `q` / `lang` と衝突しない新キーを使う。`c` は後方互換で受理し `s` + `f` へ書き換える。

| キー | 意味 |
| --- | --- |
| `s` | スコープ（`NumberTales` / `NumberTales/Primary`） |
| `g` | グルーピング軸 |
| `f` | フォーカスノード |
| `h` | 近傍ホップ数 |
| `e` | 非表示エッジ種別 |
| `q` / `lang` | 既存と共通（言語は `100bl.characters.pageLang` を共有） |

URL 文法の実装は AGENTS.md の定め通り `buildViewerQueryString` / `parseViewerLocator` / `parseIdxToken` に集約する。

### アクセシビリティ

Cytoscape は canvas レンダラなので、**隣接リストテーブルを常設**する（`<details>` 内に全ノードの関係先を `<a>` で列挙）。
canvas を CSS で消しても操作できる状態を保つ。キーボードは Tab → 矢印 → Enter → `o`（キャラシートを開く）。
`prefers-reduced-motion` でレイアウトアニメーションを止め、収束後の 1 枚だけを描く。

---

## 変更予定ファイル一覧

> 行数は**着手前の見積**。Phase 進行に応じて実績値へ更新する。

### 新規作成

| パス | 目的 | Phase | 見積 | 実績 |
| --- | --- | :---: | ---: | ---: |
| `_work_in_progress/2026-08-02_progress_relations-graph.md` | 本ログ | −1 | 200 | — |
| `lib/sw-common.js` 内のメモ化 | （既存改修。下表参照） | 0 | — | — |
| `tests/sw.datafetcher-memo.test.js` | Phase 0 の回帰 | 0 | 90 | — |
| `lib/viewer-locator.js` | URL 直リンク文法の切り出し（純関数と実証済み） | 1-a | 300 | — |
| `lib/page-api-bridge.js` | SW 登録・`waitForController`・`api()` / `fetchJSON()` の切り出し | 1-a | 320 | — |
| `tests/lib.viewer-locator.test.js` | 切り出しの回帰 | 1-a | 120 | — |
| `lib/graph/graph-model.js` | エッジ抽出・ノード同一性・Union-Find・相互畳み込み（純関数・DOM 非依存） | 1-b | 700 | — |
| `pages/vendor/cytoscape/cytoscape.esm.min.js` + `LICENSE` | `npm pack cytoscape@3.x` の公式配布物をそのまま配置（MIT） | 1-b | — | — |
| `pages/relations.html` | ページ骨格・`importmap`・`asset-version` | 1-b | 170 | — |
| `pages/relations.js` | UI 状態・Cytoscape 設定・イベント・ペイン制御 | 1-b〜3 | 1,300 | — |
| `pages/relations.sass` | 3 ペインレイアウト・ノードタイル・凡例 | 1-b〜3 | 600 | — |
| `pages/relations.css` | 上記の生成物（**同一コミットに含める**） | 1-b〜3 | 700 | — |
| `tests/graph.model.test.js` | エッジ抽出・ノードキー一意性・相互畳み込み | 1-b | 260 | — |
| `tests/pages.relations.syntax.test.js` | 構文スモーク | 1-b | 20 | — |
| `lib/graph/graph-facets.js` | グルーピング軸の自動列挙と解決 | 2 | 350 | 498 |
| `tests/graph.facets.test.js` | 軸列挙・`scopeField` 照合・`_Commons` 由来判定 | 2 | 150 | 約 430 |
| `lib/graph/graph-badge.js` | `Works_Code` + `$IndexDef.$badge` からバッジを組む | 2-a | 180 | 246 |
| `lib/graph/graph-layout.js` | 六角格子スナップ ＋ 格子プリミティブ（`hexNeighbors` / `hexDistance` / `HEX_CELL_ASPECT`） | 2-b / 3-B1 | 260 | 246 |
| `lib/graph/graph-palette.js` | Cytoscape へ渡す色を JS 側で作る（`mixSrgb` / `buildPalette` / `shadeLadder`） | 3-A | 125 | 約 270 |
| `tests/graph.palette.test.js` | `color-mix` との数値一致・意味論色の不使用・凍結 | 3-A | 70 | 約 190 |
| `lib/graph/graph-crossing.js` | 接続線の交差削減（座標の入れ替え ＋ 仕事量見積りによる予算制御） | 3-X | — | 約 260 |
| `tests/graph.crossing.test.js` | 交差判定・不変条件・決定性・格子プリミティブの BFS 検算 | 3-X | — | 約 300 |
| `lib/graph/graph-hexfill.js` | マス割当（seed 緩和・容量制約付き六角 BFS・境界/アンカー・貪欲彩色） | 3-B1 | 235 | 約 480 |
| `tests/graph.hexfill.test.js` | セル数=人数 / 非重複 / 連結 / 決定的 / 隣接同色なし / 収束 | 3-B1 | 130 | 約 290 |
| `lib/graph/graph-edge-route.js` | 六角格子沿いの経路（2 軸分解・レーン彩色・平行オフセット・交差考慮） | 3-C | 155 | 約 420 |
| `tests/graph.edge-route.test.js` | 折れ点が格子点 / Cytoscape 式での復元 / 重なり 0 / 脚が厳密に 60° | 3-C | 90 | 約 380 |
| `tests/data.image-links.test.js` | **大小文字を区別する**画像参照の全数照合（前段の再発防止） | 前段 | — | 250 |
| `lib/graph/graph-transition.js` | 遷移演出の計算（`planZoomInto` / `planZoomOut` / `staggerDelays`） | 3-D | 110 | **未着手** |
| `tests/graph.transition.test.js` | 矩形合わせ逆算 / 逆写像 / reduced-motion | 3-D | 70 | **未着手** |
| `tests/relations.url-params.test.js` | URL 状態の復元 | 3 | 160 | 未着手 |
| `docs/relations-graph.md` | 相関図の仕様（エッジ種別・尺度・URL 文法） | 4 | 220 | 未着手 |

### 既存改修

| パス | 内容 | Phase | 見積 | 実績 |
| --- | --- | :---: | ---: | ---: |
| `lib/sw-common.js` | `DataFetcher` に Promise 合流メモ化 | 0 | +35 | — |
| `docs/api-sw-spec.md` | `DataFetcher` メモ化の記述 | 0 | +25 | — |
| `pages/characters.js` | 切り出し先を import する薄いアダプタへ置換（`__*ForTest` フックは残す） | 1-a | −900 / +120 | — |
| `pages/vendor/THIRD_PARTY_NOTICES.md` | Cytoscape.js の行を追加 | 1-b | +10 | — |
| `index.html` | トップ導線に「相関図」を追加 | 4 | +6 | — |
| `pages/characters.html` | 相関図への導線リンク | 4 | +5 | — |
| `pages/README.md` | 新ページの説明 | 4 | +30 | — |
| `docs/implementation-playbook.md` | 相関図の参照先を追加 | 4 | +15 | — |
| `docs/wrapper-summary-registry.md` | エッジ抽出が既存宣言述語を使う旨 | 4 | +20 | — |
| `AGENTS.md` ＋ `npm run agents:build` 生成物 | 相関図の運用ルール | 4 | +22 | — |
| `CHANGELOG.md` | Phase 0 と Phase 4 の 2 エントリ | 0 / 4 | +45 | — |

**総見積: 約 5,600 行**（うち生成物 `relations.css` 700 行。手書きは約 4,900 行）

> AGENTS.md の「500 行超は事前確認」を大きく超えるため、**Phase ごとに行数を提示して承認を取る**。

---

## Phase 別の進捗

| Phase | 内容 | 状態 | 見積 | 実績 | `npm test` |
| :---: | --- | --- | ---: | ---: | --- |
| −1 | 進捗ログ作成（本ファイル） | **完了** | 200 | 565（索引・T-13 登録込み） | 対象外 |
| −0.5 | ベースラインの赤 5 件を解消（`254795f`） | **完了** | — | 42（data 20 / tests 22） | ✅ 46 / 631 |
| 0 | `bootstrap` 高速化（`DataFetcher` メモ化） | **完了** | 170 | 423（実装 124 / テスト 262 / 文書 37） | ✅ 47 / 643（新規 12） |
| 1-a | 共有基盤の切り出し（`viewer-locator` / `page-api-bridge`） | **完了** | 740 | 1,003（lib 721 / テスト 264 / `characters.js` −356/+18） | ✅ 48 / 693（新規 50） |
| 1-b | 相関図 MVP（`graph-model` / Cytoscape / ページ 3 点） | **完了** | 1,700 | **3,830**（下記内訳） | ✅ 50 / 782（新規 89） |
| 2-a | 宣言駆動の軸・バッジ（`$display.facet` / `Works_Code` / `$badge`） | **完了** | 1,300 | 1,281（lib 558 / テスト 631 / data 92） | ✅ 52 / 869（新規 87） |
| 2-b | 描画（階層駆動・マップ分割・中間ノード・密度連動エッジ・タイル・六角格子・エゴネットワーク） | **完了** | 1,650 | 約 1,600（`relations.js` 全面改稿 / `graph-layout.js` 184 / テスト 156） | ✅ 53 / 901（新規 32） |
| 2-c | NumberTales の `Num_Badge`（User 指定ルールでの短縮コード） | **完了** | — | 1,096（data 挿入）＋ 宣言 8 ＋ テスト 60 | ✅ 53 / 908（新規 7） |
| 前段 | 画像リンクと宣言の既存不具合 8 件（本番限定の 404 ほか） | **完了** | — | 改名 10 ＋ data 4 ＋ `lib` 40 ＋ テスト 263 | ✅ 54 / 911（新規 3） |
| 3-A | 配色・質感の引き戻し（`graph-palette.js` / 機材スクリーン定型 / テクスチャ / 走査線 / 斜めクリップ / チップ行） | **完了** | 390 | 約 520（lib 125 / テスト 190 / `relations.js` 約 90 / sass 115） | ✅ 55 / 959（新規 48） |
| 3-X | 接続線の交差削減（`graph-crossing.js`。User 提案で追加） | **完了** | — | 476（lib 260 / テスト 216） | ✅ 56 / 983（新規 24） |
| 3-B1 | マス割当アルゴリズム（`graph-hexfill.js` ＋ 格子プリミティブ） | **完了** | 450 | 685（lib 480 / テスト 205） | ✅ 57 / 1,032（新規 49） |
| 3-B2 | 背景 board canvas への描画（アンカー方式・区画の輪郭・当たり判定・ホバー） | **完了** | 225 | 約 330（`relations.js` 250 / sass 50 / html 10 / テスト 20） | ✅ 57 / 1,036 |
| 3-C | 六角格子の辺に沿ったエッジ（`graph-edge-route.js`） | **完了** | 290 | 約 700（lib 420 / テスト 280） | ✅ 58 / 1,063（新規 27） |
| 3-D | 遷移アニメーション（`graph-transition.js` / `computeFrame`・`commitFrame` 分割） | **未着手** | 316 | — | — |
| 3-E | 仕上げ（asset-version / CHANGELOG / 進捗ログ） | 一部（本ログ） | 75 | — | — |
| 4 | 導線・文書（index.html / docs / AGENTS.md） | 未着手 | 550 | — | — |

> **2026-08-02 の区切り**: 3-C まで完了。次回は **3-D（遷移アニメーション）** から。
> 「陣営やクラスに相当する塗られたマスが拡大されてその中が見える」演出（User の当初要望 4）が残っている。
> ホバーで区画が起き上がるところまでは 3-B2 で入っているので、そこからズームで潜り込む動きへ繋げる。

### Phase ごとの「確認できること」

- **Phase 0（完了・実測）**: bootstrap のリクエスト数 **2105 → 252（88.0% 減）**、転送 25.46 → **20.14 MiB**。
  取得レコード件数は 589 で前後一致。`Works_FLInvestigator78/DataBases/db_meta.json` の 39 回読みが 1 回になった。
  - 計測方法: `.cache/measure-bootstrap.mjs`（`lib/*` を `pages/sw.js` と同じ順で vm へロードし、
    fs バックエンドの `fetch` を注入して `handleBootstrapEndpoint()` をスコープ有/無で実行）
  - **着手前見積（約 180 リクエスト / 2.57 MiB）には届かなかった。** 残る 252 のうち上位は
    レコード本体の再読み込み（`db_MinorsDealer.json` 19 回 / `db_SemiPrimary.json` 18 回 /
    `db_PrimaryDealer.json` 15 回）で、`_DBLink` 解決に使う `resolveCache` が
    `handleBootstrapEndpoint()` の **DB ごとのループ内で作り直されている**ことに由来する
    （`lib/sw-common.js` の `for (const db of databases)` 内で `new Map()`）。
    これは `DataFetcher` のメモ化とは別レイヤーの最適化なので**本 Phase の対象外**とし、下記の課題へ回した
- **Phase 1-a（完了）**: **合格条件を満たした。** `tests/pages.characters.url-params.test.js` /
  `pages.characters.ui-output.test.js` / `pages.characters.syntax.test.js` の **77 件が期待値の書き換えゼロで全件グリーン**
  （`git diff -- tests/` が既存ファイルについて空であることで確認）。
  - `lib/viewer-locator.js`（305 行）: URL 直リンク文法。定数 4 種と純関数 8 種を移設。
    `pages/characters.js` 側に残したのは `location` / `history` 依存の `getQS()` / `setQS()` / `buildViewerHref()` のみ
  - `lib/page-api-bridge.js`（416 行）: SW 登録の 3 段フォールバック（`/pages/` → `/svc/` → `/api/`）と
    `api()` / `waitForController()` / `fetchJSON()`。モジュール変数だった `API_BASE_REL` はモジュール内状態へ移し、
    `getApiBase()` / `resetApiBase()` で読み書きする（テストの状態リセットは `resetApiBase()` を呼ぶ）
  - `pages/characters.js`: **9,249 → 8,671 行（−578 行）**。`__*ForTest` フックは import した関数を呼ぶだけになり無改修
  - `tests/lib.viewer-locator.test.js`（264 行 / 50 件）を新規追加。境界条件（値にカンマを含む単一インデックス、
    往復できない条件の旧形式退避、`db` 無しでは IdxToken を載せない等）を固定
  - **新規 lib は 3 つの `sw.js` の `importScripts` へ足していない**（ESM を足すと SW 全体が SyntaxError で評価失敗する）
  - `AGENTS.md`「直リンク（URL クエリ）」の「実装の集約先」を `pages/characters.js` → `lib/viewer-locator.js` へ更新し、
    `npm run agents:build` で生成物（`.claude/skills/localize-en-draft/SKILL.md`）を同期
- **Phase 1-b（完了・ブラウザ実測）**: 相関図が実ブラウザ（Playwright / Chromium）で
  **エラー・警告ゼロで動作**した。

  | 項目 | 実測値 |
  | --- | --- |
  | ノード | **478**（キー衝突 0・取りこぼし 0） |
  | エッジ | 有向 1,066 → 相互 216 組を畳んで **無向 850** |
  | 内訳 | 関係 288 / 言及・コメント 363 / 同一存在 63 / 別版・派生 115 / 主従 21 |
  | 未解決リンク | 9（診断パネルに出し、グラフには描かない） |
  | 曖昧リンク | 0 |
  | 初期表示 | 9 作品の集約ノード / 11 本 |
  | NumberTales/Primary | 105 キャラノード / 587 本 |

  - ドリルダウン（作品 → DB → キャラ）・パンくず・URL 同期（`?s=NumberTales/Primary`）が動作
  - キャラシート遷移を実機確認: `?c=NumberTales/Primary/Num:1` →「1(ハジメ)」が 1 件表示。
    複合 Index も `FLInvestigator78/Primary/Num:22,Suit:Major,SuitNum:0` →「フェニクス」、
    `UnibyteLive/Primary/AlphaGen:1,Alphabet:A` →「A:アロー」、
    `PastDivers/Primary/Lunar:Kisaragi` →「雪乙女しいな」がいずれも正しく解決
  - 隣接リスト 259 項目 / 孤立トレイ 76 件 / 診断パネル 9 件が描画される
  - **他 8 作品が薄いことが目で見える**（作品密度: NumberTales 2.49 / FLI78 0.88 / UnibyteLive 0.22 /
    PastDivers・UnauthedLogica・SinisterChangingGirls・VirtuesUs・ShouArRiders 0.00）。Phase 2 の必要性が実証された

  **行数内訳（見積 1,700 → 実績 3,830。大きく超過した）**:
  `lib/graph/graph-model.js` 832 / `pages/relations.js` 1,362 / `pages/relations.sass` 348 /
  `pages/relations.css` 362（生成物）/ `pages/relations.html` 215 /
  `tests/graph.model.test.js` 570 / `tests/pages.relations.syntax.test.js` 99 / `vitest.config.js` 28。
  超過の主因は (a) スキーマ駆動のエッジ抽出と部分集合一致の実装が想定より厚くなった、
  (b) テストを 89 件に厚くした（実データ不変条件を全 DB について回した）、
  (c) 診断パネル・隣接リスト・孤立トレイなど a11y 代替経路を MVP に含めた。

  **実装中に判明して対処したこと**:
  1. **`.mjs` の MIME 問題** — Cytoscape 配布物の `cytoscape.esm.min.mjs` をそのまま置くと
     `python -m http.server` が `text/plain` で返し、`Expected a JavaScript-or-Wasm module script` で
     モジュール読み込みが失敗した。three.js を `three.module.min.js` と `.js` 拡張子で置いている先例に倣い
     **拡張子のみ改名**（中身は無改変。ハッシュ一致を確認済み）。`THIRD_PARTY_NOTICES.md` に理由を明記
  2. **資料系DBがキャラノードに混ざる** — `listWorkDBs()` は `References` レイヤーのDBも返すため、
     `CommonReferences` の Race / Faction / Society / Region8 / Vocabulary 計 **46 件**が
     キャラクターとしてグラフに載っていた。DB 名の列挙ではなく **`DB_Layer` で判定**して除外
     （`dbFilter` で `layer === 'DataBases'` のみ採用）。478 件へ収束
  3. **非公開データの多重防御**（User 指摘）— `/pages/v1/bootstrap` は `isPrivate` /
     `DB_Hidden` / `Works_Hidden` を除外済みだが、`graph-model.js` が「呼び出し元が除外済み」に
     依存していた。`data/` を直接読む呼び出し元やテストからも漏れないよう、**モデル側にも除外を実装**し
     `diagnostics.excluded` へ件数を記録するようにした。
     実測では `_Secondaries._Commons` 経由で `isPrivate` になるレコードが 1 件あり
     （NumberTales/Secondary「ヘキサデミカル-テールズ 第二最終番機」）、bootstrap から正しく消えていることも確認
  4. **`npm test` が `.cache/` を走査していた** — `npm pack cytoscape` の展開物に含まれる
     `playwright-tests/renderer.spec.js` などを Vitest が収集し 2 ファイルが失敗した。
     AGENTS.md は一時ファイルを `.cache/` に置くと定めているので、
     `vitest.config.js` を新設して `.cache/**` ほかを除外（`.cache/` に壊れた spec を置いても
     `npm test` が通ることを確認済み）
  5. **ラベルの重なり** — 105 ノード表示で名前が重なって読めなかったため、
     ノードが 60 を超えたら次数上位 40 件だけラベルを残す密度調整を入れた
     （選択・強調時は復活）。本格的な密度対策は Phase 3
- **Phase 2-a（完了・実データ実測）**: グルーピング軸とインデックスバッジを**宣言駆動**にした。

  **背景**: 当初の「`$dict` 宣言の有無で軸を自動列挙」は実データと合っていなかった。
  被覆率 100% の `Progress` と Phase 2 で使う `FromArea` が漏れ、異なり値 1 の
  `sec_Category` / `sec_DesignedBy` を拾ってしまう。User の「typedef で識別可能に」という要望は正しかった。

  **入れた宣言**（`data/` 92 挿入 / 30 削除・13 ファイル）:
  - `$display.facet` … `data/db_type.json` の 6 フィールド（`Belonging` / `FromArea` / `Class` /
    `Progress` / `RaceType` / `GenderType`）。`path` で構造の奥の値を指す（`Belonging[].Faction` など）
  - `Works_Code` … `data/db_meta.json` の 9 作品へ 3 文字コード
    （`NTS` / `FLI` / `SAR` / `SCG` / `PDV` / `DFR` / `UBL` / `UAL` / **`VTU`**）。
    `$MetaType.$Def_CreationWorkCatalog` にも schema を宣言
  - `$badge` … 各作品 `db_type.json` の `$IndexDef` 11 箇所（`$IndexDef_Proxy` / `$IndexDef_PrimaryMobs` 含む）
  - `dict_Suit.json` へ `Suit_Code` 列（User が `Major` 行も追加してくれたのでフォールバック不要になった）

  **実測 1（バッジ）**: 全 9 作品 22 DB・**1,311 件すべて一意かつ非空**（重複 0 / 空 0）。

  | 作品 | バッジ例 |
  | --- | --- |
  | FLI | `M0` `W1` `C1`（`Suit_Code` 経由） |
  | PDV | `3G3` `1G2`（`dict_Lunar.json` の `Num` + `Generation`） |
  | UBL | `Ag1` `Bg1` |
  | VTU | `1`〜`8`（User が追加した `Virtues_Num` を使用） |
  | DFR | `s` `m` `kg` / `G1` `G2` |

  **実測 2（軸）**: enrich 後 478 ノードで **6 軸すべてが実用**（被覆率 5% 以上・値 2 種以上）。

  | 軸 | 被覆率 | 値の種類 | 多値 | 描画方式 |
  | --- | ---: | ---: | ---: | --- |
  | `Progress` | 100.0% | 10 | 0 | compound node |
  | `RaceType` | 96.7% | 37 | 2 | 中間ノード |
  | `Class` | 92.3% | 148（136 丸め） | 116 | 中間ノード |
  | `Belonging` | 91.8% | 27 | 44 | 中間ノード |
  | `GenderType` | 89.5% | 8 | 0 | compound node |
  | `FromArea` | 38.3% | 9 | 0 | compound node |

  多値／単値の判定が正しく効き、Cytoscape の compound node（1 ノード 1 親）で表せない軸を
  自動で中間ノード方式へ振り分けられる状態になった。

  **実装中に判明したこと**:
  1. **辞書は `Dictionaries/dict_*.json` だけではない** — VirtuesUs の `#List_Virtues`（`Virtues_Num` を持つ）は
     `DataBases/db_meta.json` の `General.$VarsDef` 側にしか無い。
     AGENTS.md「辞書の実行時合流」のとおり `db_meta.json` / `db_type.json` の `$VarsDef` も積む必要がある
  2. **JSON を `JSON.stringify` で書き戻すとファイル全体が再整形される** — 317 行の差分になったので破棄し、
     Edit ツール（`.claude/settings.json` の PostToolUse prettier フック経由）で入れ直した。92 行に収まった
  3. `data/db_type.json` などは **LF** 改行（`pages/characters.js` は CRLF）。スクリプトで触るなら自動判定が要る

- **Phase 2-b（完了・ブラウザ実測）**: 相関図の階層・マップ・描画を宣言駆動へ載せ替えた。
  実ブラウザ（Playwright / Chromium）で**エラー・警告ゼロ**。

  **User フィードバックへの対応**:
  1. **ごちゃごちゃしすぎ** → 密度連動でエッジを自動非表示（`言及・コメント` 363 本が既定で隠れる）。
     隠したことは凡例に「自動で非表示中（密度）」と明示する
  2. **ノード形状** → 角丸タイル＋インデックスバッジ（`57` / `M16`）、次数でサイズ、軸で色分け、
     サムネイル（既定 OFF）
  3. **階層を typedef 駆動に** → `$display.facet.hierarchy` を宣言した軸だけがドリルダウンの段になる。
     **DB 別は宣言しなかったので階層から外れた**（グルーピング軸としては引き続き使える）
  4. **Index 別（`FLI` の `Suit`・世代）** → `$IndexDef` の**子要素**へ `$display.facet` を宣言することで実現。
     値の取り出しは既存の `path` 機構を流用（`{key:"Card.Suit", field:"Card", path:"Suit"}`）
  5. **画面に収めることを優先しない** → 全体表示の倍率が 0.45 を下回るなら `fit()` せず等倍付近で出す
  6. **本人以外が関わった二次創作を別マップへ** → `$display.mapPartition` 宣言 ＋
     辞書行の `isOwner` フラグで判定。**コードに人名を埋め込まない**。実測 自作 472 / 共同 6
  7. **キャラシートへ飛ぶ前にエゴネットワークを挟む** → キャラのノードを選ぶと
     「そのキャラ＋直接つながる相手だけ」の画面になり、右のインスペクタから改めてキャラシートへ飛ぶ

  **作品ごとの階層（宣言だけで変わる）**:

  | 作品 | 階層 |
  | --- | --- |
  | NumberTales | 作品 → 所属 → クラス名 → キャラ |
  | FLInvestigator78 | 作品 → 所属 → **カード種別** → クラス名 → キャラ |
  | UnibyteLive | 作品 → 所属 → **アルファベットごとの世代** → クラス名 → キャラ |
  | PastDivers | 作品 → 所属 → **月暦の世代** → クラス名 → キャラ |
  | UnauthedLogica | 作品 → 所属 → **モデル系統** → クラス名 → キャラ |

  **ブラウザ実測**:

  | 画面 | 結果 |
  | --- | --- |
  | 初期表示 | 9 作品の集約 / 11 本。軸候補 8 種が宣言から自動列挙 |
  | ナンバーテールズ | 4 所属ノード（対象 157 キャラ） |
  | ↳ 百花繚乱研究所 | 13 クラス名ノード / 38 本 |
  | ↳ 1桁番(ユニデジッツ) | 9 キャラ個体 / 21 本 |
  | 共同二次創作マップ | 6 キャラ |
  | エゴネットワーク（57） | 13 ノード / 12 本。インスペクタに `NTS-57` と関係先 12 件（ラベル・コメント付き） |

  **実装中に判明したこと**:
  1. **Cytoscape のスタイルに関数値を渡すとパーサが落ちる** — `border-color: (e) => ...` で
     `Cannot read properties of null (reading 'value')`。`data(color)` マッパーへ変更し、
     **必ず空でない色文字列を data に入れる**ようにした
  2. **`background-image: data(thumb)` は値が空だと無効** — サムネイルが無いノードには
     `thumb` キー自体を持たせず、`[thumb]` セレクタで弾く形にした
  3. **`cose` は 1 反復が O(n²)** — 中間ノードで 288 ノード級になると 800 反復で 30 秒超固まった。
     反復回数をノード数に反比例させ、400 ノード超は `grid` へ切り替える
     （最終的に六角格子へスナップするので、力学レイアウトには大まかな相対位置だけを求めればよい）
  4. `main().catch()` で例外を握ると `pageerror` が飛ばず原因を追えないので、
     `showFatal()` で必ず `console.error` にスタックを残すようにした
- **Phase 2-c（完了・User 指定ルール）**: NumberTales に短縮コード用フィールド **`Num_Badge`** を新設した。

  **前提**: `$IndexDef` の `Num` は**一切変更しない**（User 明示）。`Num_Badge` は別フィールドとして持つ。

  | ルール | 対象 | 変換 | 件数 |
  | --- | --- | --- | ---: |
  | 1 | 整数 4 桁以内 / 16 進表記 / ゼロ埋め数字列 | 文字列で表記のまま転写 | 1,007 |
  | 2 | `{整数}-{半角文字列}` | `{整数}{短縮コード}`（6 文字以内） | 77 |
  | 3 | その他の半角文字列 | そのまま転写 | 2 |
  | 例外 | User 指定 | 個別指定 | 10 |

  **サフィックスの短縮コード（大文字統一）**:
  `-numberize`→`RZ` / `-mp`→`MP` / `-sq`→`SQ` / `-cub`→`KZ` / `-sxp`→`XP` /
  `-dev`→`DV` / `-jw`→`JW` / `-gc`→`GC`

  **例外**: `2-alt`→`2B`（バイナ）/ `10-alt`→`10D`（ディケ）/ `67`→`67A`・`67-old`→`67B`（ムナ）/
  `222`→`222A`（ペルゲン）・`222-alt`→`222B`（ドッペル）/ `%`→`DIV`（錦野舞）/ `∞`→`INF`（錦野歌嫁）/
  `777.Jackpot`→`777JP` / `777.Jackpot-mp`→`777JMP`

  **小文字を保つケース**: 16 進のプレフィックス（`0xA` / `0xFF`）と乗算記号（`3x11` / `9x9`）は
  値そのものの表記なので小文字の `x` を維持する（大文字統一は「こちらで付けた短縮コード」にのみ適用）。

  **実測**: 全 1,096 件で**生成失敗 0 / DB 内重複 0 / 6 文字超え 0**。
  ブラウザで `NTS-57` / `NTS-101MP` / `NTS-DIV` を確認。

  **実装メモ**:
  - `db_type.json` の `Num_Badge` に **`$slot: "#Index"`**（`$slot` 明示の逃がし弁）を付けて
    レコードのキー順を `Num` → `Num_Badge` → `Progress` に保った。`data:order:check` は 0/1310 で通る
  - `$badge` は `{ keys: ["Num_Badge", { key: "Num", whenMissing: "Num_Badge" }] }` とし、
    `Num_Badge` が無いレコードでも `Num` へフォールバックする
  - `lib/graph/graph-badge.js` の `buildBadgeBody()` を拡張し、`keys` が
    **インデックスのペア → レコードのフィールド**の順に値を探すようにした
    （インデックス以外のフィールドを宣言だけでバッジへ使えるようにするため）
  - data への書き込みは**テキストレベルの挿入**（レコード直下の `"Num":` はインデント 4、
    `Relation` / `_DBLink` 内のネストは 10 以上なので厳密一致で判別できる）。
    差分は **1,096 挿入 / 0 削除**で、既存の書式を一切崩していない
  - `$display: { auto: false }` を付けてキャラシートの自動表示からは外している
    （表示用の短縮コードであり創作内容ではないため）

- **Phase 3**: NumberTales/Primary の密な図でも「言及・コメント」を切って読める密度にできる（699 → 約 330 本）。
  フィルタ状態が常時表示され隠れフィルタが無い。キーボードだけで巡回・遷移できる。
- **Phase 4**: `npm run agents:check` と `tests/agent-instructions.sync.test.js` が通る（生成物のズレなし）。

---

## 採用した既定（変更したら理由付きでここへ追記する）

| 項目 | 既定 | 根拠 | 変更履歴 |
| --- | --- | --- | --- |
| 初期表示 | 創作タイトル全体（9 作品を集約ノード） | 単一作品だと 5 作品が空になる | — |
| 二次創作 DB | 既定 OFF・トグルで表示 | 公開 479 件中 196 件を占め毛玉化しやすい。ただし `SameMPSeries_DBLink` 119 本の大半がここ | — |
| `Commented`（言及・コメント 393 本） | 既定 ON | 364 本が本文を持ち情報量が高い。密すぎる場合は Phase 3 のフィルタで切る | — |
| ノードのサムネイル | 既定 OFF（ビューポート内・同時 6 本まで遅延ロード） | 全展開時に最大 479 枚の取得が発生する | — |
| 中間ノード自動フォールバックの閾値 | 作品内エッジ数 ÷ ノード数 < 1.0 | NumberTales(5.44) のみ Relation ベース、FLI78/UnibyteLive(1.00) は中間ノード側 | — |
| `DataFetcher` メモ化のスコープ | リクエスト単位（bootstrap 1 回の間だけ有効・終了時に破棄） | データ鮮度の後退がゼロ | — |
| ページタイトル | 「創作キャラ・相関図」 | `pages/characters.html` の「創作キャラ・キャラシート」に揃える | — |
| グループの識別 | **色相を変えない。** 位置 + ラベル + 濃度段 + 境界の枠 + 凡例の多重符号化 | マス塗りにすると格子上の位置が識別子になるので、12 色の循環パレットが不要になる。新規色 0 個で済む | 2026-08-02 3-A で `CLUSTER_COLORS` 廃止 |
| エッジ種別の色 | 水色〜紺の単一系統（同一存在 `--accent-bright` / 主従 `--azure`） | `--success`（緑）/ `--warning`（橙）は状態を表す意味論色。線種との二重符号化があるので色を寄せても識別性は落ちない | 2026-08-02 3-A（User 判断） |
| 集約段のマス間隔 | 38px（キャラ個体段は 122px） | 同じにすると 478 マスで 2900×2500 モデル px となり fit 倍率 0.3 → `shouldFitToViewport` の下限 0.45 を割る | — |
| 多値軸のマスの数え方 | **延べ人数**（属するグループ全部にマスを置く） | 「この陣営は何人いるか」がマス数で正しく読めることを優先。凡例に「延べ」と明記 | 2026-08-02 3-B1（User 判断） |
| 穴（囲まれた未割当マス） | **残す** | 埋めると「マス数＝人数」が壊れ、マスを数えて人数が分かる読み方が成立しなくなる | 2026-08-02 3-B1（User 判断） |
| 種の間隔 | 段階的な再試行 `[0.85, 1.0, 1.2, 1.5, 2.0]` | 詰めすぎるとグループが囲い込まれて容量を満たせない。詰められる構成では詰め、詰められない構成でだけ緩む | 2026-08-02 3-B1 |
| 集約段の線 | **既定で隠し、ホバーした区画の線だけ出す** | 13 区画に 27 本を一度に出すと読めない。集約段の線は「A の誰かと B の誰かが繋がっている」という粗い情報なので常時出す価値が低い | 2026-08-02 3-C（User 提案） |
| 「その他」「(未設定)」の線 | **引かない**（本数は統計行へ明示） | 寄せ集めは実体のあるまとまりではなく、ほぼ全てと繋がるハブになって図を埋める | 2026-08-02 3-C（User 提案。132 本削減） |
| 「その他」の中身 | **上位に 1 つも該当しないノードだけ** | 多値軸で単に丸めた値のメンバーを寄せると、上位クラスも持つキャラが混ざり、掘った先で同じ上位クラスが再出現して分類が意味を成さない | 2026-08-02 3-C（User 指摘） |
| 「その他」の階層 | 同じ軸をもう一段挿して掘り直す | 一気にキャラ個体まで落とすと分類が途切れる。156 → 45 → 3 と収束する | 2026-08-02 3-C（User 提案） |
| 世代でのグルーピング | **宣言しない**（PastDivers `Chronos.Generation` / UnibyteLive `Letter.AlphaGen`） | 値の種類が 2〜3 しか無く、区画に分けても視覚的な違いが乏しい | 2026-08-02 3-C（User 判断。宣言を消すだけで軸が消えた＝スキーマ駆動の狙いどおり） |

---

## 検証

> Phase ごとに結果を追記する。**未実施は「未実施」と明記**する（できたことにしない）。

### ベースライン（着手前 / 2026-08-02 実測）

> ✅ **解消済み。** 着手前の時点で `npm test` が 2 ファイル・5 件で失敗していたが、
> 本作業（相関図）とは無関係の、直近データ更新コミット（`7a2751c` / `10abeeb`）由来の追従漏れだった。
> Phase 0 以降の「既存件数が減っていないこと」判定の前提を作るため、**Phase 0 の前に別コミットで解消した**。
>
> - 解消コミット: **`254795f DB構造整備＆テスト回路更新`**
> - **確定ベースライン: `npm test` 46 ファイル / 631 件 すべて成功**
> - `npm run data:order:check`: 0/1310 レコード整列（差分なし）
> - `npm run agents:check`: 生成物は正典と一致

<details>
<summary>解消前の赤の内訳（記録）</summary>

- `npm test`（`.\node_modules\.bin\vitest.cmd run`）: **46 ファイル / 631 件中、2 ファイル・5 件が失敗**
  （44 ファイル / 626 件は成功）

#### 失敗の内訳（すべて `Works_FLInvestigator78` のデータ由来）

| # | テスト | 内容 | 由来コミット |
| --- | --- | --- | --- |
| 1–2 | `tests/data.field-order.test.js` | `db_MinorsDealer.json` #6 / `db_PrimaryDealer.json` #10 のキー順が `$DefType` 正準順とズレ | `7a2751c` / `10abeeb` |
| 3–4 | `tests/normalize-field-order.test.js` | 同 2 ファイルが「未整列」 | 同上 |
| 5 | `tests/enrich.dblink.jump.merge.test.js:714` | 錦野舞（`Card{Suit:"Dealer",Num:79}`）の `Class` が空配列である前提が崩れた | `10abeeb` |

**1–4 の実態**（`node tools/normalize-field-order.mjs` の dry-run で確定。**合計 4/1310 レコード**）:

```
~ data/Works_FLInvestigator78/DataBases/db_MinorsDealer.json    2/  20 レコードを整列
    x   2 | ArcanaHolding_DBLink: 1 -> 2, Progress: 2 -> 1
~ data/Works_FLInvestigator78/DataBases/db_PrimaryDealer.json   2/  12 レコードを整列
    x   1 | ArcanaHolding_DBLink: 2 -> 3, AnotherRegions_DBLink: 3 -> 2
    x   1 | ArcanaHolding_DBLink: 2 -> 3, AnotherRegions_DBLink: 3 -> 2
```

→ `npm run data:order:write` で機械的に解消できる（キー順のみの変更。値は変わらない）。

**5 の実態**: `db_PrimaryDealer.json` の 錦野舞 / 錦野歌嫁 に
`Class: ["采配幹部(ディーラーズ)"]` が**新たに入力された**。テストは L713-714 で
「raw データの `Class` が空配列」であることを**前提条件**としてアサートしていたため落ちている。

- **enrich 側の実バグではない**。enrich の同名フィールド穴埋めは「ベースが空値のときだけ」なので、
  `Class` に実値が入った以上マージは起きず、`e.Class` は `["采配幹部(ディーラーズ)"]` のままが正しい挙動
- したがって AGENTS.md の「DB 更新によってテストが落ちた場合はテスト側を新しいデータ仕様へ追従させる」
  に該当する。ただし**元のガード（cross-work から `Class` を持ち込まないこと）は残す**必要がある
  → 参照先 NumberTales/SemiPrimary `Num:"%"` の `Class`
  （`["開発者","ヒューマノイド開発部(シンフォニー.XVI)"]`）と `RelationTo_Primary` が
  **混入していないこと**を明示的にアサートする形へ書き換えた

- `npm run data:order:check`: **失敗**（上記 4 レコード）

</details>

#### `npm run roleplay:check` の既存ドリフト（**本作業では触らない**）

`changed=3 unchanged=55 noCP=323 errors=0`。配布用ロールプレイプロンプトの生成物が、
直近の DB 更新（錦野舞・錦野歌嫁への `Class` 入力など）に追従していない。

```
PLAN  [create] data/Works_NumberTales/RoleplayPrompts/DB_Primary/roleplay-prompt-80.md
PLAN  [merge]  data/Works_FLInvestigator78/RoleplayPrompts/DB_PrimaryDealer/Dealer/roleplay-prompt-79.md
               sections: updated:## 「錦野舞」の概要, updated:## 「錦野舞」の基本情報
PLAN  [merge]  data/Works_FLInvestigator78/RoleplayPrompts/DB_PrimaryDealer/Dealer/roleplay-prompt-80.md
               sections: updated:## 「錦野歌嫁」の概要, updated:## 「錦野歌嫁」の基本情報
```

**キー順整列の前後で `changed=3` は不変**（`git stash` で `data/` の変更を退避して HEAD 状態で再実行し確認）。
→ **本作業とは無関係の既存ドリフト**であり、`npm test` の対象外（別 npm script）。
生成物は創作内容を含むため、再生成の可否は User 判断とし本作業では触らない。

### Phase 別の結果

| Phase | `npm test` | `data:order:check` | `roleplay:check` | `agents:check` | `relations.css` 生成 | 目視確認 |
| :---: | --- | --- | --- | --- | --- | --- |
| −1 | 対象外 | 対象外 | 対象外 | 対象外 | 対象外 | 対象外 |
| −0.5 | ✅ 46 / 631 | ✅ 0/1310 | 既存ドリフト `changed=3` | ✅ 一致 | 対象外 | 対象外 |
| 0 | ✅ 47 / 643（新規 12） | ✅ 0/1310 | 未計測（Phase 0 は data 非改変） | ✅ 一致 | 対象外 | **未実施** |
| 1-a | ✅ 48 / 693（新規 50） | 対象外（data 非改変） | 対象外 | ✅ 一致（`agents:build` 実施） | 対象外 | **未実施** |
| 1-b | ✅ 50 / 782（新規 89） | ✅ 0/1310 | 対象外（data 非改変） | ✅ 一致 | ✅ `npx sass` で生成 | ✅ **Playwright で実施** |
| 2-a | ✅ 52 / 869（新規 87） | ✅ 0/1310 | 既存ドリフト `changed=3` のまま | ✅ 一致 | 対象外 | 対象外（UI 非改変） |
| 2-b | ✅ 53 / 901（新規 32） | ✅ 0/1310 | 対象外（data 非改変） | ✅ 一致 | ✅ `npx sass` で生成 | ✅ **Playwright で実施** |
| 1-a | — | — | — | — | 対象外 | — |
| 1-b | — | — | — | — | — | — |
| 2 | — | — | — | — | — | — |
| 3 | — | — | — | — | — | — |
| 4 | — | — | — | — | — | — |

### 検証コマンド

```powershell
npm.cmd test                       # 全件（PowerShell で npm.ps1 がブロックされる環境）
.\node_modules\.bin\vitest.cmd run # 同上の別手段

npm.cmd run data:order:check       # データのキー順に差分が出ていないこと
npm.cmd run roleplay:check         # ロールプレイ生成物へ波及していないこと
npm.cmd run agents:check           # Phase 4 の AGENTS.md 編集後

node --check pages/relations.js    # 構文スモーク
node --check lib/graph/graph-model.js
node --check lib/graph/graph-facets.js
node --check lib/viewer-locator.js
node --check lib/page-api-bridge.js
node --check lib/sw-common.js

# relations.css の生成確認（npm script が無いため手動）
Get-ChildItem pages/relations.sass, pages/relations.css | Select-Object Name, Length, LastWriteTime

# ローカル HTTP サーバー（SW は file:// では動かない）
python -m http.server 8080
```

### 目視確認チェックリスト（Phase 1-b 以降）

| # | URL / 操作 | 期待 | 結果 |
| --- | --- | --- | --- |
| 1 | `http://localhost:8080/pages/relations.html` | 既定＝全体スコープ。9 作品の集約ノード。**シークレットウィンドウ**でも SW 登録→claim→取得が通る | — |
| 2 | 「ナンバーテールズ」をクリック | 4 DB の集約へドリルダウン。パンくず更新、URL が `?s=NumberTales` へ | — |
| 3 | 「一次創作(Primary)」をクリック | 105 キャラが展開。URL が `?s=NumberTales/Primary` | — |
| 4 | ブラウザの「戻る」 | 1 段だけ戻り、図が跳ねない（座標キャッシュ） | — |
| 5 | `?s=ShouArRiders` | 7 ノードすべてが「関係が登録されていないキャラ」トレイへ（Phase 2 で `FromArea` により図になる） | — |
| 6 | ノード → 「キャラシートを開く」 | `characters.html?c=NumberTales/Primary/Num:57` へ遷移し詳細が 1 件だけ出る | — |
| 7 | `?c=FLInvestigator78/Primary/Suit:Major,SuitNum:16` を relations.html に貼る | 後方互換で受理し `?s=…&f=…` へ書き換わる | — |
| 8 | 言語トグルを EN → `characters.html` を開く | `100bl.characters.pageLang` が共有され EN のまま | — |
| 9 | 隣接リストテーブル | `<details>` を開くと全ノードの関係先が `<a>` で列挙される | — |
| 10 | ウィンドウ幅 375px | 横スクロールが出ない。タッチターゲット 44px 以上 | — |

### 回帰確認（相関図以外を壊していないこと）

| # | 項目 | 結果 |
| --- | --- | --- |
| 1 | `pages/characters.html` の一覧・詳細・検索・画像ギャラリー・言語切替が変更前と同一 | — |
| 2 | `pages/characters.html?c=FLInvestigator78/Primary/Suit:Major,SuitNum:16` で複合 Index の直リンクが解決する | — |
| 3 | DevTools > Application > Service Workers で `pages/sw.js` が **activated and is running** | — |
| 4 | `http://localhost:8080/pages/v1/bootstrap?includeRecords=0` を直接開いて JSON が返る | — |

> **重要**: 新規 lib（`viewer-locator.js` / `page-api-bridge.js` / `graph/*.js`）を
> `pages/sw.js` / `api/sw.js` / `svc/sw.js` の `importScripts` へ**足さないこと**。
> `importScripts` は classic script しか読めず、ESM の `export` を足すと SyntaxError で SW が全滅する。
> ブラウザは更新失敗時に古い SW を使い続けるため気付きにくい
> （`tests/sw.importscripts-scope.test.js` が同一グローバルの宣言衝突を検査している）。

---

### Phase 3 の実測（2026-08-02）

すべて `.cache/` の使い捨てスクリプト（Node / Playwright）で計測。数値は中央値。

**交差削減（`graph-crossing.js`）** — パス数を固定していたときと、仕事量の見積り（1 パス ≒ `4nm²`）で
反復回数を決めるようにした後の比較。**時間で打ち切ると機械ごとに図が変わる**ため、n と m だけで決める。

| 規模 | パス数固定（6） | 予算制御あり | パス数 | 交差 |
| --- | ---: | ---: | ---: | --- |
| 17 ノード / 35 辺 | 10.3ms | 11.6ms | 6 | 176 → 4 |
| 25 / 58 | — | 24.5ms | 4 | 397 → 0 |
| 40 / 95 | 98ms | 38.2ms | 1 | 950 → 81 |
| 105 / 288 | **5,563ms** | — | — | — |
| 220 / 600 | **2 分超** | 0.1ms | 0 | 足切り |

**マス割当（`graph-hexfill.js`）** — 種の間隔を段階的に再試行することで、全ケースで容量一致かつ分断ゼロ。

| ケース | 採用された係数 | 容量一致 | 分断 | 充填率 | 時間 |
| --- | --- | :-: | :-: | ---: | ---: |
| 作品別（9） | 0.85 | ○ | 0 | 67% | 9.4ms |
| クラス別（13） | 1.0 | ○ | 0 | 66% | 4.9ms |
| 陣営別（27） | 1.2 | ○ | 0 | 46% | 12.6ms |
| 最悪（27g / 478 セル） | 1.2 | ○ | 0 | 41% | 10.8ms |

**繋がりの引力**（`relaxSeeds` に `links` を渡す）— 13 グループ / 20 本の繋がりでアンカー間の交差数。
**反復を増やせば良くなるわけではない**（引力と反発が拮抗して振動する）ので反復数は 40 で固定。

| 引力 | 反復 40 | 反復 120 |
| ---: | ---: | ---: |
| 0（繋がりを見ない） | 38 | 40 |
| 0.3 | 21 | 15 |
| **0.6（採用）** | **10** | 26 |
| 1.0 | 9 | 10 |

**エッジ経路（`graph-edge-route.js`）**

- 重なり: 83% → **0%**（17/35・84/145・120/850 のいずれでも 0）
- 主要な脚の 60° からのずれ: 中央値 **0.00°**
- 交差を見る折れ方の選択: キャラ個体段 145 本で **2305 → 1902 本（−17%）**、中規模 120 本で −8%
- 処理時間: 145 辺 12ms / 850 辺 70ms（**300 辺超では交差判定を諦める**予算制御あり）

**ブラウザ実測（Playwright / HeadlessChrome 1440×900）**

| 確認項目 | 結果 |
| --- | --- |
| Console のエラー / 警告 | **0 件** |
| `The style property … is invalid` | **0 件**（＝ 色が `#999` へ落ちていない） |
| 描画画素中の `#999` 系グレー | **35,026 px 中 0 px**（100% が青系） |
| 左レール小見出しの発光バー | **5/5 が `display: none`**（`.card h2` の詳細度負けを打ち消し） |
| キャンバスの機材スクリーン定型 | `--border-strong` + `--bg-deep` + `--glow 0 0 16px` を確認 |
| 方眼テクスチャ | 46px×2 + 170px 星屑 / `background-attachment: fixed` |
| オーバーレイ | `var(--panel)` + `blur(4px)` |
| マス塗りのドリル | `すべての作品 > ナンバーテールズ > 百花繚乱研究所` を実操作で確認 |
| 段の往復 | 行き 268286 px → 戻り **268286 px**（完全一致＝割当が決定的である裏付け） |
| ホバー | 区画が起き上がり（塗り画素 4,603 → 110,592）、区画名と `cursor: pointer` が出る |
| 「その他」の収束 | 156 → **45** → **3** キャラ |

### 作業中に見つけて直した不具合（すべて回帰テスト＋逆検証つき）

いずれも**静かに壊れる**種類のもので、テストが無ければ気づけなかった。

| # | 不具合 | 症状 |
| :-: | --- | --- |
| 1 | 大文字拡張子 `.PNG` 8 ファイル | Windows では通り **GitHub Pages（Linux）でだけ 404** |
| 2 | `cnsp-fg_NTscorefolder` の大小文字不一致 | 同上。SW のフォールバックもファイル名は救済しない |
| 3 | `#Ref_Region8.DB_Image` に拡張子が無い | ガード正規表現に弾かれ**カバー画像が常に非表示** |
| 4 | `cnsp_imgNTS-115RZ-image` の DB 配置ずれ | どのパス解決経路でも当たらない |
| 5 | 獣爾騎兵 `Beast_Badge` の `$display.auto: false` | index 子要素では読まれず、**内部コードが詳細ピルに露出**（7/7 レコード） |
| 6 | `resolveImagePath()` が拡張子と folderHint を補完しない | `_enrichment` の画像 URL が **613 件中 0 件しか実在しない** |
| 7 | `drilledNodes()` が `OTHER_GROUP_KEY` を扱わない | 「その他」を掘ると **0 件**になる |
| 8 | 集約段を離れても `state.board` を捨てない | キャラ個体段に**前の段の塗りが 44,132 px 残る** |
| 9 | 多値軸の「その他」に上位該当ノードが混ざる | 掘った先で**同じ上位クラスが再出現**して分類が意味を成さない |
| 10 | `.ghost` が全ボタンへ accent 枠を付ける | `.is-active` が同じ accent を再指定するだけで、**選択状態がずっと見えていなかった** |

> **テスト自身の弱さも 2 件見つかった。**
> ① 「`OTHER_GROUP_KEY` という識別子が関数内にある」だけを見ていたので、分岐を潰しても別の箇所に
> 文字列が残って通過した → `picked === OTHER_GROUP_KEY` という**比較そのもの**を見るよう修正。
> ② `mixSrgb` の期待値表を「実測値」と書きながら一部を手計算で埋め、3 件間違えていた
> → **定義から独立に検算するテスト**を追加して取り違えを止めた。
> 新規テストは原則、**該当ロジックを潰すと落ちること**を確認してから採用している。

---

## 未完了タスク / 申し送り

- **`resolveCache` の巻き上げ（Phase 0 の残課題）**: `lib/sw-common.js` の `handleBootstrapEndpoint()` は
  `for (const db of databases)` ループの**中**で `const resolveCache = new Map()` を作っており、DB をまたぐと
  `_DBLink` 解決のキャッシュが捨てられる。これをリクエスト単位（または作品単位）へ巻き上げれば
  残る 252 リクエスト・20.14 MiB をさらに削減できる見込み。
  ただし `ReferenceResolver.resolveAllInAny()` のキャッシュ意味論（参照文字列が DB 文脈に依存しないか）の
  確認と専用テストが要るため、Phase 0 とは分けて扱う。
- **ローカル HTTP サーバーでの Phase 0 目視確認が未実施**。
  `python -m http.server 8080` → `pages/characters.html` を開き、DevTools > Network で
  `db_meta.json` の取得回数が 1 回になっていること・一覧/詳細/検索の結果が変更前と同一であることを確認する。
- Cytoscape.js は `npm pack cytoscape@<version>` で取得し、`pages/vendor/cytoscape/` へ
  本体（ESM ビルド）と `LICENSE` を配置。`pages/vendor/THIRD_PARTY_NOTICES.md` の対応表と更新手順も更新する。
- `relations.css` は VS Code の SASS 拡張による生成物。npm script が無いため、
  各 Phase 完了時に生成有無と更新日時を目視確認して本ログへ記録する。
- Cloudflare Workers 実 API（`pkg/cloudflare/`）は `_enrichment` を返さないため、相関図は SW 疑似 API 専用。
  Workers 側へ載せるかは今後の判断。

### 次回（3-D 以降）の着手メモ

- **3-D: 遷移アニメーション**が本命。User の当初要望 4「陣営やクラスに相当する塗られたマスが拡大されて
  その中が見える」演出が唯一残っている。ホバーで区画が起き上がるところまでは 3-B2 で入っているので、
  そこからズームで潜り込む動きへ繋げる。
  - 総尺は **600ms**（User 指定「標準 0.45〜0.6 秒」、stagger 20ms）
  - **座標モーフは使わない**。478 要素の position アニメは CPU 4x/6x で 13〜24fps、
    ビューポートアニメ（zoom/pan）は 36〜59fps という実測がある
  - `renderGraph()` を `computeFrame()`（DOM に触らない）/ `commitFrame()`（差分適用＋演出）へ分割する必要がある
  - `planZoomInto()` は「子グラフの外接矩形を、いまマスが占めている画面矩形へ重ねる viewport」を逆算する
    → **タップした点が動かないまま**マスへ寄る
- **3-E / Phase 4**: `pages/relations.html` の `<meta name="asset-version">` 更新、`CHANGELOG.md`、
  `index.html` / `pages/characters.html` からの導線、`docs/relations-graph.md` の新設、
  `AGENTS.md` への運用ルール追記（＋ `npm run agents:build`）。
- **サムネイル画像とノード名称表示**は User 指示により Phase 3 では保留。
  前段-8 で `_enrichment.primaryImage` の解決は直った（613/613）ので、載せる準備自体はできている。
- **「その他」ラベルの表示** — 3-C の修正で `その他（N 種）` の N は実際に残った値の数を数えるようにしたが、
  ブラウザでの目視確認は次回にまわす（ロジックのテストは通っている）。

## 本作業では触らず、記録するだけの既知課題

いずれも**別タスク扱い**とし、`data/` や既存 `lib/` の是正はこの作業に含めない。

- **未解決の `*_DBLink` 6 件** — `db_SemiPrimary.json` の `SameMPSeries_DBLink` → SelfSecondary `Num` 196/225/289/324/361、
  `db_SelfSecondary.json` → SemiPrimary `Num` `"337-numberize"`。参照先レコードが未作成。
  相関図では diagnostics パネルに出すのみ（グラフには描かない）。
- **`$VersDef` / `$VarsDef` の綴り揺れ**（既知課題 T-05）— 作品別 `db_type.json` は `$VersDef`、
  `lib/data-common.js` は `$VarsDef` のみ辞書合成。`graph-model.js` は両方を根に積むので相関図の表示には影響しないが、
  SW 側 enrich と `RelationLabel` の解決結果がずれ得る。
- **`lib/data-common.js` の同一作品 `$enrich:true` マージで `isForSecondary` フィルタが効いていない**
  （`fieldEntriesByKey` / `isSecondaryContext` が同一作品では null）— 現状データでは未顕在だが、
  SemiPrimary に `Relation` を書いた瞬間に SelfSecondary 12 件へ幽霊エッジが出る。
- ~~**`lib/frontend-common.js`（619 行）がリポジトリ全体で import 元ゼロのデッドコード**（ロード時に console.log する）。
  削除可否は User 判断。~~ → **2026-08-08 に削除済み**（`refactor/sw-ui-cleanup` ブランチ。
  同時に `pages/characters_final.js`（12 行・参照元ゼロ）も削除。詳細は
  `2026-08-08_progress_sw-ui-refactor.md`）。

### 解決済み

- ~~タイポ `RealationLabel` 2 件~~ — User のコミット `0eb6215 タイポ修正` で解消（2026-08-02 確認）。
  リポジトリ全体で残存ゼロ。読み取り側の互換吸収は実装しない。

---

## 参考リンク

- [`docs/api-sw-spec.md`](../docs/api-sw-spec.md) — SW ルーティング / `_enrichment` / `$Def_DBLinkRef` 解決
- [`docs/schema-meta-processing.md`](../docs/schema-meta-processing.md) — `$DefType` / `$IndexDef` / `$slot` マーカー
- [`docs/wrapper-summary-registry.md`](../docs/wrapper-summary-registry.md) — `relationSection` / `dbLinkSection` / `vrmViewerSection`
- [`docs/implementation-playbook.md`](../docs/implementation-playbook.md) — 横断運用ルール
- [`pages/vendor/THIRD_PARTY_NOTICES.md`](../pages/vendor/THIRD_PARTY_NOTICES.md) — vendor 同梱の先例（three.js / @pixiv/three-vrm）
- [`AGENTS.md`](../AGENTS.md) — 正典（SSOT）
