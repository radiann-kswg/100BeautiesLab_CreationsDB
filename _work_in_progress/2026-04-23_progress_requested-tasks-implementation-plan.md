# 2026-04-23 progress: requested tasks implementation plan

## 目的

- 2026-04-22 時点で整理した 4 つの希望タスクについて、2026-04-23 時点の実装・検証基盤を踏まえた段階実装計画へ更新する。
- 特に、キャラシート UI 出力の回帰テスト基盤を組み込んだうえで、安全に着手できる順序を明確化する。

## 前提の更新

- `pages/characters.js` には test hook と `renderDetail()` の直接検証経路を追加済み。
- `tests/pages.characters.ui-output.test.js` により、キャラシート詳細 UI の文言回帰を jsdom 上で確認できる状態になった。
- `Belonging -> Faction` のような schema alias 解決が UI でも検証可能になり、API/SW 側の整合だけでは拾えなかった UI 回帰も段階導入で検知できるようになった。
- したがって、今後の 4 タスクは「API/SW テストのみ」ではなく「API/SW + UI 回帰テスト」を前提に段階実装する。

## 現時点の基本方針

- 既存機能の改悪防止を最優先とし、変更は小さな単位で段階導入する。
- `db_type.json($DefType)` を正とし、UI / API / SW の挙動は可能な限り schema-driven に寄せる。
- schema や DB 構造の拡張が必要なものは、実装前に JSON 拡張案を提示して User 承認を取る。
- 本文生成や設定本文の自動補完は行わず、User 手動入力を前提とした構造設計を優先する。
- UI 影響を伴う変更は、少なくとも `pages.characters.syntax.test.js` と UI 出力回帰テストの対象追加を検討する。

## 4 タスクの再整理

### タスク 1. `Day` / `Era` / `Area` 型などの typedef/meta 宣言強化

#### 現時点の見立て

- 既存宣言そのものが不足している箇所と、既存宣言を SW/UI が十分使い切れていない箇所が混在している。
- `Belonging` まわりは UI 側の alias 解決検証が可能になったため、今後は `Day` / `Area` / `Era` 系でも同じ観点で回帰確認できる。

#### 実装方針

- 第 1 段階では新規書式を増やさず、既存の `$Def_Day` / `$Def_BaseArea` / `StoryEra` を解釈する側の汎用化を優先する。
- 第 2 段階で、既存宣言だけでは不十分な箇所が残る場合に限り、JSON 拡張案を提示する。
- UI 表示差分が出る箇所は、対象フィールドを増やした UI 回帰テストで検証する。

#### 先に見る対象

- `lib/data-common.js`
- `lib/sw-common.js`
- `pages/characters.js`
- `data/db_type.json`
- 必要に応じて `docs/schema-meta-processing.md`

### タスク 2. 造語・固有名詞辞書機能と創作基本資料 DB の追加

#### 現時点の見立て

- 4 タスクの中で最も新規構造の導入量が大きく、実装より先に schema / meta / API 入口の設計確定が必要。
- User 手動入力前提のため、初期実装は「本文を自動生成しないテンプレート整備」と「API/UI の受け皿整備」を中心にすべきである。

#### 実装方針

- まず「創作用語 DB」と「創作基本資料 DB」の最小テンプレート案を作成する。
- 初回提案では、保存場所、最小フィールド、既存作品/DB との関連付け方、API 入口、UI 側の参照方針までを整理する。
- 実装は、テンプレート導入と API 受け皿の整備を先行し、本文の実データ投入は User 主導とする。

#### 先に見る対象

- `data/db_type.json`
- `data/db_meta.json`
- `lib/sw-common.js`
- `pages/characters.js`
- `docs/db-update-guidelines.md`
- `docs/api-sw-spec.md`

### タスク 3. 二次創作 DB の詳細 API/SW 機能とキャラシート UI 拡張

#### 現時点の見立て

- `_Secondaries` / `_Commons` の基盤がすでにあるため、既存 schema の範囲で最初に着手しやすい。
- 今回の UI 回帰テスト追加により、二次創作向け表示強化も API/SW だけでなく UI まで含めて小刻みに検証できる。

#### 実装方針

- `RelationToPrimary` のリンク化、`sec_Category` / `sec_DesignedBy` の利用者向け表示整理、二次創作向け補助表示の拡張を候補にする。
- まずは既存 schema で表現できる範囲から着手し、追加宣言の要否は後から判断する。
- `renderDetail()` ベースの UI 回帰テストに、二次創作表示ケースを追加する。

#### 先に見る対象

- `lib/sw-common.js`
- `lib/data-common.js`
- `pages/characters.js`
- `data/Works_*/DataBases/db_meta.json`
- `data/Works_*/DataBases/db_type.json`

### タスク 4. 非公開フラグ実装

#### 現時点の見立て

- 仕様を広げると公開判定が曖昧になるため、初期段階は最小の opt-in 制御に絞るのが安全。
- ここも UI 一覧・詳細・API 応答の整合を同時に見る必要がある。

#### 実装方針

- 初手は `isPrivate` のような明示フラグによる除外を優先し、`Progress` 連動は後回しにする。
- 一覧、検索、enrich、詳細表示で一貫して除外されることをテストで担保する。
- UI 側は `renderDetail()` に加えて、必要なら一覧描画の回帰テストも追加検討する。

#### 先に見る対象

- `lib/sw-common.js`
- `lib/data-common.js`
- `pages/characters.js`
- `tests/sw.enrich.basic.test.js`
- 必要に応じて `tests/pages.characters.ui-output.test.js`

## 実装フェーズ案

### フェーズ A. 提案と承認待ち

- タスク 1 の schema 拡張要否を整理し、既存宣言で吸収できる範囲と新規書式候補を分けて提示する。
- タスク 2 の新規 DB テンプレート案を提示する。
- 大きな一括変更を避けるため、各タスクの段階実装単位を確定する。

#### 2026-04-23 提案内容

##### A-1. タスク 1 の schema 拡張要否整理

###### 既存宣言で先に吸収する範囲

- `Day` 系
  - 対象: `BirthDay`, `AnivDay`
  - 方針: 既存の `$Def_Day` と typedef 側の `$display.section = basic` を優先し、UI/SW の個別分岐を減らす。
- `Area` 系
  - 対象: `FromArea`, `BelongingArea`, `Belonging` 内の `BaseArea`
  - 方針: 既存の `$Def_BaseArea` と `Belonging.$dict = Faction` による補助展開を優先し、`Area` 名ハードコードを減らす。
- `Era` 系
  - 対象: `StoryEra`, `FromEra`, `ToEra`, `InEra` のうち、すでにカタログ・概要用途で扱っている範囲
  - 方針: 既存の `$Def_StoryEraCatalog` を優先し、まず works / database catalog 表示と UI 整形を typedef/meta ベースへ寄せる。

###### 新規書式候補として承認を取りたい範囲

- 候補 1: `Era` 系の共通 object typedef を top-level / works catalog / database catalog の横断利用向けに整理する。
  - 目的: `StoryEra` とレコード側年代情報を同じ整形系へ寄せやすくする。
  - 初期案: 既存 `$Def_StoryEraCatalog` を拡張するのではなく、必要ならレコード用の別 `$Def_*` を追加して責務分離する。
- 候補 2: `Area` / `Day` 系の表示ヒントを `$display` へ追加し、UI の field-name 依存分岐をさらに減らす。
  - 目的: `pages/characters.js` 側の特殊扱い縮小。
  - 初期案: 新しい大分類を増やさず、既存 `$display.section` / `aliasOf` / unit に準じた最小拡張に留める。

###### 承認前の結論

- タスク 1 は、まず新規書式なしで進められる範囲を先に実装候補として扱う。
- 新規 schema 追加は、`Era` 系の責務分離が本当に必要と判明した時点で別案として提示する。

##### A-2. タスク 2 の新規 DB テンプレート案

###### 提案する追加レイヤー

- 追加案 1: 作品別 `Glossaries/` 配下に「創作用語 DB」を置く。
- 追加案 2: 作品別 `References/` 配下に「創作基本資料 DB」を置く。

###### 保存場所の初期案

- `data/Works_<work>/Glossaries/`
  - `db_meta.json`
  - `db_type.json`
  - `db_Glossary.json`
- `data/Works_<work>/References/`
  - `db_meta.json`
  - `db_type.json`
  - `db_Reference.json`

###### 創作用語 DB の最小フィールド案

- `Term`
  - 用語の日本語表記
- `Term_EN`
  - 英語表記またはローマナイズ表記
- `Term_JPReading`
  - 読み仮名補助
- `Category`
  - 地名 / 組織 / 能力 / 種族 / アイテム などの分類
- `Summary`
  - 用語の短い説明
- `RelatedWorks`
  - 関連作品の識別子
- `RelatedDB`
  - 関連 DB の識別子
- `Aliases`
  - 別表記・旧表記
- `Links`
  - 将来の相互参照用

###### 創作基本資料 DB の最小フィールド案

- `Title`
  - 資料名
- `Title_EN`
  - 英語表記
- `Category`
  - 世界観 / 年表 / 組織資料 / 地理 / 制度 など
- `Summary`
  - 資料の短い概要
- `BodyBlocks`
  - User 手入力前提の本文ブロック配列
- `RelatedTerms`
  - 用語 DB との関連
- `RelatedWorks`
  - 関連作品
- `RelatedDB`
  - 関連 DB
- `Visibility`
  - 将来の公開制御連携余地。ただし初期実装では任意

###### API / UI の初期方針

- 初期段階では、キャラクター詳細へ直接全文を埋め込まず、API で参照可能な独立 DB として読むことを優先する。
- UI はまず「作品/DB 概要から参照できる一覧入口」を想定し、キャラシート本文への自動混入は避ける。
- 造語抽出は自動確定せず、既存フィールドからの候補抽出を将来の補助機能候補として扱う。

###### 承認前の結論

- タスク 2 は、まずテンプレートと API 入口の追加を最小スコープとし、本文データ投入や相互リンク自動化は後段に分ける。
- 保存場所は既存 `DataBases/` や `Dictionaries/` と責務を分けるため、`Glossaries/` と `References/` の別レイヤー案を第一候補とする。

##### A-3. 段階実装単位の確定案

- 単位 1: 提案のみ
  - タスク 1 の新規 schema 候補確認
  - タスク 2 の保存場所・最小フィールド確認
- 単位 2: schema 新設なしの既存改善
  - タスク 3 の UI/API 改善
  - タスク 4 の最小非公開フラグ案
- 単位 3: 承認済み schema 拡張
  - タスク 1 の必要最小限の typedef/meta 追加
- 単位 4: 新規 DB レイヤー追加
  - タスク 2 のテンプレート導入と API 入口整備
- 単位 5: docs / CHANGELOG / テスト拡張
  - 各単位ごとに差分同期

##### A-4. User 承認を取りたい点

- タスク 1 では、`Era` 系についてレコード用の追加 `$Def_*` を将来候補として検討してよいか。
- タスク 2 では、新規 DB の保存場所を `Glossaries/` / `References/` の別レイヤーとして切ってよいか。
- タスク 2 では、初期実装を「独立 DB と API 入口の整備」までに留め、キャラシートへの全文統合は後段にしてよいか。

### フェーズ B. 既存 schema で進めやすい実装

- タスク 3 の API/SW/UI 改善のうち、既存 schema で対応できる範囲から着手する。
- タスク 4 の最小非公開フラグ案を設計し、実装候補を固める。
- UI 回帰テストを必要箇所へ横展開する。

#### 2026-04-23 着手メモ

- タスク 3 の最小着手として、`pages/characters.js` の詳細表示へ `sec_Category` / `sec_DesignedBy` を出す「二次創作情報」セクションを追加した。
- 既存 schema に新規宣言を足さず、UI 補助表示として切り出す方式を採用した。
- `tests/pages.characters.ui-output.test.js` に NumberTales の SelfSecondary レコードを使った回帰テストを追加し、二次創作補助属性が描画されることを確認した。
- 追加要望に対応し、`sec_SeriesTitle` のみを持つ Secondary レコードでも、meta の `_Secondaries` 一致定義から `sec_Category` / `sec_DesignedBy` を補完するよう SW/UI を更新した。
- 続けて、`_Secondaries[]` 要素用の `$MetaType.$Def_SecondaryMeta` を追加し、`pages/characters.js` 側の二次創作情報セクションを schema 駆動へ寄せた。
- 次の候補は、`RelationToPrimary` の見せ方強化またはタスク 4 の最小非公開フラグ案である。

### フェーズ C. 最小機能の実装と検証

- タスク 3 の最小 UI/API 改善を実装する。
- タスク 4 の最小非公開フラグを実装する。
- API/SW テストと UI 回帰テストの双方で検証する。

### フェーズ D. 承認後の schema / DB 拡張

- タスク 1 の必要な typedef/meta 拡張を段階導入する。
- タスク 2 の新規 DB 追加と API/UI 入口整備を行う。
- 関連 docs / CHANGELOG / 進捗ログを同期更新する。

## 優先順の再設定

- 最優先は「提案が必要なもの」と「既存 schema で安全に進められるもの」を切り分けること。
- 実装着手の第 1 候補はタスク 3 とする。
- タスク 4 はタスク 3 と近い検証導線で進める。
- タスク 1 とタスク 2 は、承認前提の設計タスクとして先に案を固める。

## テスト計画の更新

- UI 影響を伴う変更は `tests/pages.characters.syntax.test.js` を最低限実行対象とする。
- 詳細表示の文言変更や辞書解決変更は `tests/pages.characters.ui-output.test.js` に対象ケースを追加する。
- API/SW 側の変更は既存の enrich / tolerance / deftype merge 系テストを優先実行対象とする。
- 一覧表示や検索結果に公開制御・二次創作属性表示を入れる場合は、必要に応じて一覧側 UI テストの追加を検討する。

## このログ時点の未完了項目

- タスク 1 の具体的な schema 拡張案提示
- タスク 2 の新規 DB テンプレート案提示
- タスク 3 の具体的な UI/API 設計確定
- タスク 4 の公開制御ポリシー確定
- 実装後の docs / CHANGELOG / テスト拡張

## 参考

- `_work_in_progress/2026-04-22_progress_requested-tasks-overview.md`
- `_work_in_progress/2026-04-22_remaining-task.md`
- `_work_in_progress/2026-04-23_progress_ui-output-tests.md`
- `tests/pages.characters.ui-output.test.js`
- `docs/api-sw-spec.md`
- `docs/schema-meta-processing.md`
- `docs/implementation-playbook.md`
