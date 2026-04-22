# 2026-04-22 progress: requested tasks overview

- 目的: 2026-04-22 時点で提示された 4 つの希望タスクについて、要件・制約・現状実装との接点・段階対応方針を整理し、以降の実装着手前の共有ログとして残す。
- 現在の状況:
  - 本ログ作成時点では、主に既存実装・進捗ログ・docs の確認を実施した。
  - 4 タスクを一括で進めると変更量が大きくなる見込みのため、段階対応を前提とする。
  - User からは作業用ブランチ `addon-for-creation` を事前に用意済みとの共有がある。

## 今回確認した前提

- 既存機能の改悪防止を最優先とし、API/SW/UI の動作変化が出る場合は段階導入とする。
- `db_type.json($DefType)` を正とし、表示・検索・整形・補助情報は可能な限り schema-driven に寄せる。
- 作品別 `db_meta.json` は追加価値レイヤーとして扱い、欠損時に API/SW を落とさない方針を維持する。
- 創作本文や劇中設定本文の自動生成は避け、User 手動入力を前提とする。
- タスク 1 と 2 は、添付要件上 `db_type.json` / `db_meta.json` の拡張案提示と承諾確認が必要。
- タスク全体は 500 行超の編集へ発展する可能性が高く、一括変更時は事前確認が必要。

## タスク別の要件整理

### 1. `Day` / `Era` / `Area` 型などの typedef/meta 宣言強化とハードコーディング緩和

#### 現状認識

- グローバル schema にはすでに `BirthDay`, `AnivDay` 向けの `$Def_Day`、`BaseArea` 向けの `$Def_BaseArea`、カタログ用 `StoryEra` 宣言が存在する。
- 一方で UI 側には `Belonging`, `Area`, `BirthDay`, `AnivDay`, `StoryEra` を個別に整形する分岐が残っている。
- つまり「型宣言がまったく無い」のではなく、「既存の宣言を SW/UI が十分に汎用利用できていない」状態である。

#### 今後の対応方針

- まずは新規 schema 書式を増やさず、既存の `$Def_Day` / `$Def_BaseArea` / `StoryEra` を使う側の汎用化を優先する。
- SW enrich と UI 表示の専用処理を洗い出し、typedef ベースで共通整形できる部分から置き換える。
- 新規の typedef/meta 書式が必要と判断した場合のみ、拡張案を別途提示して User 承認後に導入する。

#### 主な確認対象

- `lib/data-common.js`
- `lib/sw-common.js`
- `pages/characters.js`
- `data/db_type.json`
- 必要に応じて `docs/schema-meta-processing.md`

### 2. 造語・固有名詞辞書機能と創作基本資料 DB の追加

#### 現状認識

- 現在はキャラクター/作品の属性 DB はあるが、創作用語集や世界設定資料を独立管理する DB は未実装。
- このタスクは新規 DB 種別、schema、API 入口、UI 利用方針の定義が必要になる。
- 要件上、設定本文や劇中描写本文は User 手動入力が前提であり、自動補完は避ける必要がある。

#### 今後の対応方針

- 先に「創作用語 DB」と「創作基本資料 DB」の最小テンプレート案を作り、本文空欄でも運用できる構造を提案する。
- 初期実装では、本文を自動生成せず、User が入力しやすいフィールド構造・ガイド・ API/UI の受け皿整備を優先する。
- 造語抽出自体を自動確定しない。候補抽出は補助に留め、採否と本文記入は User 主導とする。

#### 主な確認対象

- `data/db_type.json`
- `data/db_meta.json`
- `lib/sw-common.js`
- `pages/characters.js`
- `docs/db-update-guidelines.md`
- `docs/api-sw-spec.md`

### 3. 二次創作 DB の詳細 API/SW 機能とキャラシート UI 拡張

#### 現状認識

- `_Secondaries` と `_Commons` の条件分岐はすでに整備済み。
- `RelationToPrimary` は現状でも UI 表示の土台があるが、一次創作とのリンク性や二次創作属性の視認性は十分でない。
- `sec_Category`, `sec_DesignedBy` は内部補完には使われるが、利用者向け表示・メタ整理はまだ弱い。

#### 今後の対応方針

- 既存 schema と `_Secondaries` 基盤を再利用し、二次創作向けの要約情報を API enrich と UI 表示へ引き上げる。
- `RelationToPrimary` のリンク化や見せ方強化は、既存の `Relation` 表示ロジックを流用できるかを優先して検討する。
- DB 側の「一次創作相当先」をどう特定するかは、既存メタで足りるかを確認したうえで追加宣言の要否を判断する。

#### 主な確認対象

- `lib/sw-common.js`
- `lib/data-common.js`
- `pages/characters.js`
- `data/Works_*/DataBases/db_meta.json`
- `data/Works_*/DataBases/db_type.json`

### 4. 非公開フラグ実装

#### 現状認識

- DB 取得・検索レスポンスには公開可否フィルタが無く、レコードは原則そのまま公開される。
- このタスクは GitHub 上のデータ秘匿ではなく、API/SW と UI からの露出制御に限る任意対応である。

#### 今後の対応方針

- 最小案として `isPrivate` を入口で除外するフィルタを検討する。
- `Progress` 連動の公開制御は誤判定リスクがあるため、初期段階では opt-in 方式で扱う案を優先する。
- DB 一覧、検索、enrich、UI 表示で一貫して除外されるかをテストで担保する。

#### 主な確認対象

- `lib/sw-common.js`
- `lib/data-common.js`
- `pages/characters.js`
- `tests/sw.enrich.basic.test.js`
- 必要に応じて新規テスト追加

## 現時点での実装優先順（案）

### フェーズ 0: 事前整理

- 本ログの作成
- 既存進捗ログ・docs・実装接点の確認
- 変更量と事前承認が必要な箇所の切り分け

### フェーズ 1: 提案と確認

- タスク 1 の schema 利用拡張案を提示
- タスク 2 の新規 DB テンプレート案を提示
- 500 行超が見込まれる一括変更を避けるため、段階実装の単位を確定

### フェーズ 2: schema 新設なしで進めやすい実装

- タスク 3 の UI/API 改善のうち、既存 schema で対応できる範囲
- タスク 4 の最小非公開フラグ案

### フェーズ 3: 承認後の schema/API 拡張

- タスク 1 の必要な typedef/meta 拡張
- タスク 2 の新規 DB 追加と API/UI 入口整備
- 関連 docs / CHANGELOG / テスト更新

## このログ時点での未完了項目

- タスク 1 の具体的な JSON 拡張案提示
- タスク 2 の新規 DB schema / meta / API 方針提示
- タスク 3 の具体的な UI/API 変更設計
- タスク 4 の公開制御ポリシー確定
- 実装、検証、docs 反映

## 参考

- `_work_in_progress/2026-04-22_remaining-task.md`
- `_work_in_progress/2026-04-22_progress_creationwork-meta-api-ui.md`
- `_work_in_progress/2026-04-21_progress_secondary-commons-defaults.md`
- `docs/api-sw-spec.md`
- `docs/schema-meta-processing.md`
- `docs/implementation-playbook.md`
