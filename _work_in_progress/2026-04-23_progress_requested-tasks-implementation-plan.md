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

### フェーズ B. 既存 schema で進めやすい実装

- タスク 3 の API/SW/UI 改善のうち、既存 schema で対応できる範囲から着手する。
- タスク 4 の最小非公開フラグ案を設計し、実装候補を固める。
- UI 回帰テストを必要箇所へ横展開する。

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
