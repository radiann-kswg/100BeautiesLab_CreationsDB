# 2026-04-19 スペルミス修正候補の整理

## 目的

- 既に修正した `SpetialSkill` / `SpetialPattern` / `Manetize` と同種のスペルミス候補を洗い出し、影響範囲つきで整理する。
- そのまま安全に修正できる候補と、命名方針や識別子変更を伴うため事前判断が必要な候補を切り分ける。

## 変更点の要約

- `data/**/*.json` / `lib/**/*.js` / `tests/**/*.js` を中心に、英単語として不自然な識別子や綴り揺れを確認した。
- typo として確度が高い候補、命名改善寄りの候補、作品IDやファイル名まで波及する候補に分類した。
- 影響範囲と注意点を、後続でそのまま着手判断できる粒度で整理した。

## 候補一覧

### A. そのまま修正してよい確度が高い候補

#### 1. `secletRelation` → `secretRelation` （2026-04-19 対応済み）

- 判定理由:
  - 同じ作品の relation label 定義には `secretRelation` が既に存在する。
  - `secletRelation` は `data/Works_NumberTales/DataBases/db_Secondary.json` にのみ残っており、既存定義と不一致になっている。
  - データ側の typo と見てほぼ問題ない。
- 主な影響範囲:
  - `data/Works_NumberTales/DataBases/db_Secondary.json`
  - 参照先定義の確認対象: `data/Works_NumberTales/DataBases/db_meta.json`
- 影響メモ:
  - relation label の値修正だけで済む見込み。
  - 既存の `secretRelation` 定義へ揃えるだけなので、修正コストは小さい。

### B. 修正候補だが、置換先の語を先に決める必要がある候補

#### 2. `UnproceededSecondary` → 候補要検討

- 判定理由:
  - `unproceeded` は英語としてかなり不自然。
  - ただし意味としては `UnprocessedSecondary` なのか `UnproducedSecondary` なのかが即断しづらい。
- 主な影響範囲:
  - `data/Works_NumberTales/DataBases/db_meta.json`
  - `lib/sw-common.js`
  - 将来的には DB キー名・列挙名・必要に応じてファイル名変更が波及する可能性あり。
- 影響メモ:
  - 置換先を決めずに着手すると、かえって命名がぶれる。
  - もしファイル名も合わせるなら `db_UnproceededSecondary.json` の扱い確認が必要。

#### 3. `DestinyFoxsRecords` → 候補要検討

- 判定理由:
  - 英語タイトルは `Destiny Fox's Records` であり、識別子 `Foxs` はかなり不自然。
  - ただし正式な識別子を `DestinyFoxRecords` / `DestinyFoxesRecords` のどちらへ寄せるかは要判断。
- 主な影響範囲:
  - `data/db_meta.json`
  - `data/Works_Proxies/DataBases/db_Proxy.json`
  - 作品ID・ディレクトリ名・参照文字列まで広がる可能性あり。
- 影響メモ:
  - 単純なキー置換では済まず、作品識別子の改名タスクに近い。

### C. typo というより命名改善候補

#### 4. `ComeBacked`

- 判定理由:
  - 英語としてはかなり不自然。
  - ただしデータ仕様上は「返答コメント」を表す独自名として一貫して使われている。
- 主な影響範囲:
  - `data/db_type.json`
  - `data/Works_PastDivers/DataBases/db_type.json`
  - `data/Works_NumberTales/DataBases/db_Secondary.json`
- 影響メモ:
  - typo 修正というより、`Reply` / `Replied` / `Response` 等へのリネーム設計が必要。
  - データ構造キーの変更なので、互換性対応が必要になる可能性が高い。

#### 5. `Weakpoint`

- 判定理由:
  - 英語としては `WeakPoint` または `Weakness` の方が自然。
  - ただし全体スキーマと実データで広く統一されている。
- 主な影響範囲:
  - `data/db_type.json`
  - 各作品の実データ JSON 全般
- 影響メモ:
  - 現状は typo 修正よりも、互換性を伴う命名統一タスクになる。

#### 6. `RelationAbouts`

- 判定理由:
  - 英語としてはぎこちない。
  - ただしプロジェクト内では「関連性について」の項目名として一貫して使われている。
- 主な影響範囲:
  - `data/db_type.json`
  - 各作品の実データ JSON 全般
- 影響メモ:
  - `RelationNotes` や `RelationAbout` のような再命名候補はあるが、現時点では typo 断定まではしない。

#### 7. `Communicating`

- 判定理由:
  - 社交性を表す enum key としては `Communication` や `Sociability` の方が自然。
  - ただし `AbilityStats` の一要素として広範囲に定着している。
- 主な影響範囲:
  - `data/db_type.json`
  - 複数作品の実データ JSON
- 影響メモ:
  - typo 修正というより命名改善。
  - 変更時は UI 表示・検索・比較ロジックの確認も必要。

## 優先順位の提案

1. `secletRelation` を先に修正する。
2. `UnproceededSecondary` は正しい置換先を先に決めてから着手する。
3. `DestinyFoxsRecords` は作品識別子改名タスクとして別立てで扱う。
4. `ComeBacked` / `Weakpoint` / `RelationAbouts` / `Communicating` は typo 修正ではなく命名改善タスクとして扱う。

## 影響範囲（今回の整理ログ作成）

- `_work_in_progress/2026-04-19_progress_typo-candidates.md`
- `_work_in_progress/README.md`

## 未完了タスク

- `secletRelation` の実修正を行うか判断する。 -> 対応済み
- `UnproceededSecondary` の正式名称を決める。
- `DestinyFoxsRecords` を識別子改名対象として扱うか判断する。
- 命名改善候補を「互換あり段階移行」で扱うか、「現状維持」にするか整理する。

## 参考リンク

- `data/Works_NumberTales/DataBases/db_Secondary.json`
- `data/Works_NumberTales/DataBases/db_meta.json`
- `data/Works_NumberTales/DataBases/db_type.json`
- `data/db_type.json`
- `data/db_meta.json`
- `lib/sw-common.js`
