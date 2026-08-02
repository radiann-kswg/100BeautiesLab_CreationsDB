# 2026-08-02 進捗: キャラクター相関図ページ（`pages/relations.html`）の新設

> **ステータス: Phase −1 完了（本ログ作成）／ Phase −0.5 完了（ベースラインの赤を解消）／ Phase 0 着手中**
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
| `lib/graph/graph-facets.js` | グルーピング軸の自動列挙と解決 | 2 | 350 | — |
| `tests/graph.facets.test.js` | 軸列挙・`scopeField` 照合・`_Commons` 由来判定 | 2 | 150 | — |
| `tests/relations.url-params.test.js` | URL 状態の復元 | 3 | 160 | — |
| `docs/relations-graph.md` | 相関図の仕様（エッジ種別・尺度・URL 文法） | 4 | 220 | — |

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
| 0 | `bootstrap` 高速化（`DataFetcher` メモ化） | 着手中 | 170 | — | — |
| 1-a | 共有基盤の切り出し（`viewer-locator` / `page-api-bridge`） | 未着手 | 740 | — | — |
| 1-b | 相関図 MVP（`graph-model` / Cytoscape / ページ 3 点） | 未着手 | 1,700 | — | — |
| 2 | グルーピング軸と中間ノードモード | 未着手 | 800 | — | — |
| 3 | 絞り込みと操作の作り込み | 未着手 | 700 | — | — |
| 4 | 導線・文書 | 未着手 | 550 | — | — |

### Phase ごとの「確認できること」

- **Phase 0**: bootstrap のリクエスト数 2105 → 約 180、転送 25.46 MiB → 2.57 MiB。
  DevTools > Network で `db_meta.json` が 39 回 → 1 回。既存キャラシートの初回表示も速くなる。
- **Phase 1-a**: キャラシートの挙動が 1 ミリも変わっていないこと。
  **合格条件 = `tests/pages.characters.url-params.test.js` と `pages.characters.ui-output.test.js` の
  期待値を 1 行も書き換えずに全件グリーン。** 満たさない限り 1-b へ進まない。
- **Phase 1-b**: 全体グラフが成立する（479 ノード / 無向 772 エッジ / 最大成分 142 / 集約 9 ノードから開始）。
  NumberTales → Primary へドリルダウンすると平均次数 5.44 の密な相関図。
  **他 8 作品が薄いことが目で見え、Phase 2 の必要性が実証される。**
- **Phase 2**: 作品内エッジ 0 の 5 作品（計 51 ノード）が `FromArea` / `RaceType` を中間ノードにして図になる。
  `_Commons` 由来の値にバッジが付きトグルで除外できる。同じ `Class` コードが所属ごとに違うラベルへ解決される。
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
| 0 | — | — | — | — | 対象外 | — |
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

## 未完了タスク / 申し送り

- Phase 0 着手時に `npm test` のベースライン件数を計測して本ログへ記録する。
- Cytoscape.js は `npm pack cytoscape@<version>` で取得し、`pages/vendor/cytoscape/` へ
  本体（ESM ビルド）と `LICENSE` を配置。`pages/vendor/THIRD_PARTY_NOTICES.md` の対応表と更新手順も更新する。
- `relations.css` は VS Code の SASS 拡張による生成物。npm script が無いため、
  各 Phase 完了時に生成有無と更新日時を目視確認して本ログへ記録する。
- Cloudflare Workers 実 API（`pkg/cloudflare/`）は `_enrichment` を返さないため、相関図は SW 疑似 API 専用。
  Workers 側へ載せるかは今後の判断。

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
- **`lib/frontend-common.js`（619 行）がリポジトリ全体で import 元ゼロのデッドコード**（ロード時に console.log する）。
  削除可否は User 判断。

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
