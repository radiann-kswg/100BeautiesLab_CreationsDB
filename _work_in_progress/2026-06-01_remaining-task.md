# 2026-06-01 残留タスク一覧

## 概要

2026-06-01 時点の未完了・着手中タスクをまとめた。
元となる計画ログは `.completed/2026-04-22_remaining-task.md` および
`2026-04-23_progress_requested-tasks-implementation-plan.md` を参照。

---

## タスク 1. `Day` / `Era` / `Area` 型の typedef/meta 宣言強化とハードコーディング緩和

### 現在のステータス: **着手中（部分完了）**

### 完了済みの対応（参考）

- `BirthDay` / `AnivDay` に `$display.section = basic` を追加し、補助行の schema 駆動化を実施（2026-04-22）。
- `StoryEra` の global schema（`$Def_StoryEraCatalog` / `$Def_StoryEra`）を実データ構造へ追従させ、`$display.role` を追加（2026-05-11）。
- `lib/wrapper-common.js` を追加し、`Day` / `StoryEra` / `Era` の summary formatter を shared wrapper registry 経由に移行（2026-05-11）。
- SW / enrich 側での `StoryEraSummary` 自動生成を `$MetaType.$Def_DatabaseCatalog` の宣言ベースへ統一（2026-05-11）。
- `Area` / `Belonging` を `#DictIndex` / `#DictIndex[]` として宣言し `$dict` による辞書名指定を追加（2026-04-22）。

### 残留タスク

1. **`Day` の完全 key 非依存化**  
   実データは `Day: { Month, DayOfMonth }` のラッパー構造を持つ。`$Def_Day` の `$display.role` を使った wrapper 化は暫定対応中であり、完全な key 非依存化には追加の schema 整理または wrapper 自体の role 化が必要。

2. **SW / enrich 側での `StoryEra` / `Day` の role 積極利用**  
   現状は UI 側 summary が先行しており、SW / enrich 側では role を十分に活用していない。主に `lib/sw-common.js` / `lib/data-common.js` の対応確認。

3. **SW enrich/search 側で残る型名依存分岐の洗い出し**  
   `lib/sw-common.js` / `lib/data-common.js` 内に残るフィールド名ハードコードの洗い出しと、typedef 駆動への置き換え候補整理。

4. **`Area` / `Belonging` 辞書の `data/Dictionaries/` 専用配置への分離**  
   現状は辞書が `db_meta.json` 内にインライン定義されている。段階実装として専用配置への切り出しが必要。

---

## タスク 2. 造語・固有名詞辞書機能と創作基本資料 DB の追加

### 現在のステータス: **未着手**

### 概要

創作特有の用語・造語・固有名詞を管理する辞書 DB と、創作世界設定に関する基本資料 DB を新たに実装する。  
**本文・設定内容は User 手動入力前提であり、Copilot による自動補完は禁止。**

### 残留タスク

1. **「創作用語 DB」と「創作基本資料 DB」の最小テンプレート案を作成・提示して User 承認を得る**  
   保存場所、最小フィールド構成、既存作品/DB との関連付け方、API 入口、UI 側の参照方針までを整理する。  
   ※ JSON 拡張案の User 事前承諾が必要（`copilot-instructions.md` の制約）。

2. **造語候補の抽出支援**  
   既存 DB の `Summary` / `InStory` / `Area` / `Belonging` 等から造語・固有名詞候補を洗い出し、採否判断を User に提示する（自動確定しない）。

3. **API/UI の受け皿整備**  
   テンプレート承認後に、`lib/sw-common.js` と `pages/characters.js` で新 DB 種別を扱えるようにする。

---

## タスク 3. 二次創作 DB の詳細 API/SW 機能とキャラシート UI 拡張

### 現在のステータス: **着手中（部分完了）**

### 完了済みの対応（参考）

- `_Secondaries` / `_Commons` の条件分岐基盤を整備済み（2026-04-21）。
- `RelationToPrimary` のリンク化完了——二次創作 DB 閲覧中でも `Primary` DB の index 直リンクへ遷移できる（2026-05-11）。

### 残留タスク

1. **`sec_Category` / `sec_DesignedBy` の利用者向け表示整理**  
   現在は内部補完に使われているが、キャラシート UI 上への見せ方整理（ラベル・セクション配置・辞書表示等）が未対応。

2. **一次創作側との関係表示の拡張**  
   `RelationToPrimary` のリンク化以外に、一次創作キャラクターとの関係をより視覚的に強調する表示強化の検討。

3. **DB の「一次/二次相当」判定ルールの明文化**  
   `db_meta.json` の既存メタで足りるかを確認したうえで、追加宣言の要否を判断する。

---

## タスク 4. 非公開フラグの追加拡張（任意対応）

### 現在のステータス: **基本実装は完了 / 拡張は未着手**

### 完了済みの対応（参考）

- `isPrivate` によるレコード単位の公開制御（API/SW / enrich / UI 一覧・詳細）完了。
- `DB_Hidden` による DB 単位の完全非公開（詳細: `docs/api-sw-spec.md` §5.3）完了。
- `Works_Hidden` による作品単位の完全非公開（詳細: `docs/api-sw-spec.md` §5.4）完了。

### 残留タスク（任意対応）

1. **`Progress` フィールド連動による派生非公開ルールの検討**  
   `Progress` が未完成状態を示す場合に自動非公開とする仕組みの要否を仕様判断する。  
   ※ 誤判定リスクがあるため opt-in 方式を優先案とする。

---

## タスク 5. bilingual wrapper の UI 表示対応

### 現在のステータス: **API/SW 基盤は完了 / UI 表示が未完了**

### 完了済みの対応（参考）

- `lib/data-common.js` に `TypeDefUtils.detectBilingualWrapper()` / `collectBilingualWrapperPaths()` を追加し、enrich 出力に `_enrichment.bilingualWrapperFields` メタを付与するようにした（2026-05-29）。
- `pages/characters.js` には `bilingualColumnsText()` / `formatBilingualLabel()` などの関連ヘルパーが実装済み。

### 残留タスク

1. **`pages/characters.js` での bilingual wrapper 列分割描画の実装**  
   `_enrichment.bilingualWrapperFields` メタを参照し、JP/EN ペア フィールドを左右 2 列で表示するルートを `pages/characters.js` に追加する。  
   対象フィールド例: `Works_UnibyteLive` の `StreamingActivity.StreamingGreeting` / `ListenerNickname`。  
   ※ 既存の `bilingualColumnsText()` を活用できる見込みで、実装基盤は整っている。

---

## タスク 6. subFields / wrapper 統合作業の追加確認

### 現在のステータス: **ほぼ完了 / 目視確認が残存**

### 完了済みの対応（参考）

- `lib/section-wrapper-common.js` の section renderer registry を導入し、subField 描画を `sectionWrapper` 宣言ベースへ統一（2026-05-15）。
- `Relation` / `RelationToPrimary` の描画ロジックを `section-wrapper-common.js` の built-in renderer へ移動（2026-05-15）。
- 折りたたみ UI（初期状態: 閉じる、non-text section のみ対象）を実装（2026-05-15）。

### 残留タスク

1. **追加作品（`Works_NumberTales` 以外）での目視確認**  
   `Works_FLInvestigator78` / `Works_ShouArRiders` / `Works_SinisterChangingGirls` など、subFields を持つ作品で実際の表示崩れがないか確認する（User による目視確認が主体）。

---

## 全体方針（再掲）

- 既存機能の改悪防止を最優先とし、変更は小さな単位で段階導入する。
- `db_type.json($DefType)` を正とし、UI / API / SW の挙動は可能な限り schema-driven に寄せる。
- schema や DB 構造の拡張が必要なものは、実装前に JSON 拡張案を提示して User 承認を取る。
- 本文生成や設定本文の自動補完は行わず、User 手動入力を前提とした構造設計を優先する。
- UI 影響を伴う変更は、`pages.characters.syntax.test.js` と UI 出力回帰テストの対象追加を検討する。

## 既知の不安定なテスト（2026-06-23 更新）

- `tests/sw.enrich.basic.test.js` ／ `tests/enrich.dblink.jump.merge.test.js` ／ `tests/data.shape.test.js` 合計 5 件失敗（2026-06-23、`npm audit fix` 後に確認）。`commons.secondaries` 条件分岐・`enrich.dblink.jump` マージ・`ref_Glossary.json` 欠損 が原因で、audit fix とは無関係の既存不具合。
- **軽微な確認残り（任意）**: GitHub Security タブで Dependabot PR #5/#6/#7 の Closed 状態をブラウザ手動確認推奨。Dependabot ブランチ `origin/dependabot/npm_and_yarn/npm_and_yarn-3f9ee708be` の削除も任意で可。
