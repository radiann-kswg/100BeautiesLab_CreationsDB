# AIHints「構造的再同期」設計提案

## 目的

`addon-ai-tag` 側の AIHints 生成ツール（`tools/patch-aihints.mjs`）を、develop 側のスキーマ変更（`TailsUnit` 専用型化・`EarShapeType` 独立軸化）へ追従修正する作業を通じて、「AIHints の再ビルド（regenerate）」という操作そのものの設計に複数の未解決課題があることが判明した。User の依頼により、これらを整理し今後の実装方針を提案としてまとめる。データベース全体・CI 運用に関わる内容のため、本記録は `develop` ブランチ側に置く。

> **【2026-07-13 追記】実装完了（`addon-ai-tag`）。** 本提案の `--resync-structural` / `_meta` provenance を実装し、実データ 92 件へ投入済み。詳細は [`2026-07-13_progress_aihints-palette-deadlock.md`](./2026-07-13_progress_aihints-palette-deadlock.md) の「実装結果（第1階）」節および `CHANGELOG.md` を参照。合意事項 1（provenance マーカー方式）は実装済み、合意事項 2（GitHub Actions からの PR 自動作成）は未着手。

**本ドキュメントは提案のみで、実装は含まない。** 実装は User が内容を確認・優先度判断した後、別タスクとして着手する。

## 背景・経緯

1. `addon-ai-tag` の `tools/patch-aihints.mjs` を develop 側の `TailsUnit` 構造化に追従修正（`--suggest` 系の尾タグ生成ロジックを刷新）。
2. 続けて develop 側の `EarShapeType` 独立軸化にも追従修正。この過程で、`--suggest --force` モードには「尻尾形状から耳の種類を allow-list で推測する」という不正確なロジックが暫定実装されていたことが判明し、`AppearanceDetail(#Element_Ear)` の実データを読む正しい実装へ置き換えた（Num:11 で実証: Nekomata尻尾だが実際は Cat 耳のキャラで、旧ロジックは誤って "nekomata ears" を生成していた）。
3. User から「再ビルド（build）もお願いできるか」と依頼を受けたが、調査の結果、**現在コミット済みの実データ（92件）には耳タグの矛盾が0件**であることが判明（`--suggest --force` を使わず `--apply-appearancedetail` 等の安全なモードで生成・編集されてきたため）。つまり「今すぐ直すべき壊れたデータ」は無く、むしろ `--suggest --force` で全105件を上書き再生成すると、既に手動で仕上げた創作内容（髪色・目色・衣装描写等）まで TODO だらけの雛形に巻き戻ってしまう危険がある。
4. この経緯を踏まえ、User から「再ビルドの諸問題と追加実装案をまとめておいてほしい」との依頼を受けた。

## 検討する4つの論点（User 指定）

1. 再ビルド（`--force` 上書き）した場合に、既存の手動編集済み創作内容が巻き戻ってしまう問題
2. DB側（TailsUnit/AppearanceDetail等の構造化ソース）が更新された場合の、AIHints側の追従・再生成の設計
3. GitHub Actions がそもそも「AIヒント再生成」の手続きとして発火していない現状
4. 将来的に `develop` の変更へ `addon-ai-tag` が追従し、AIHints もその都度最新化できるようにするための、両ブランチ・GitHub 設定面での追加実装

## 調査で判明した事実

- **`.github/workflows/cf-api-sync.yml`**（`push: [develop, addon-ai-tag]`, `paths: [data/**, pkg/cloudflare/**]`）の「AIHints D1 同期」ステップは `pkg/cloudflare/scripts/migrate-aihints.mjs --clean` を実行するのみ。このスクリプトは各レコードの**既に確定済みの `record.AIHints` を D1 へアップロードするだけ**で、`TailsUnit`/`AppearanceDetail` から AIHints を**計算し直す処理は一切含まない**。
- **`.github/workflows/notify-ai-dataset.yml`**（`push: [addon-ai-tag]`）は、push を検知すると外部リポジトリ `radiann-kswg/100BeautiesLab_CreationsAI` へ `repository_dispatch`（`creations-db-updated`）を送るのみ。このリポジトリ側の処理は本リポジトリから不可視。
- **結論（論点3の直接的な回答）**: 「DB更新 → AIHints自動再計算」という手続きは、このリポジトリの CI のどこにも存在しない。`tools/patch-aihints.mjs` は現状、完全に人力（または Agent セッション）でローカル実行し、結果を手動でコミットする運用が前提。
- `--suggest --force` は**全面上書き**（TODO だらけの雛形で再構築）。`--fill-todos` は `TODO:` 接頭辞の文字列のみを対象とする「安全に上書きしてよい」ことを示す軽量な規約が既にあるが、**既に確定値が入っている（TODOではない）フィールドの「間違った値」を安全に検知・修正する手段は無い**。今回発見した耳タグのバグも、この「全面上書きか、TODO文字列のみ拾うか」の二択しかない現状の隙間から生じた。
- `buildAihintsFromIdentityMotif` に既にある `isStructuralOverride(s)`（構造的事実らしき文字列を検知する正規表現マッチング）は、「どのタグが構造由来か」を判別する発想の先例だが、現状は IdentityMotif 由来の重複除去にしか使われていない。

## 合意事項（User 確認済み）

1. 「構造的に安全に再生成できる部分」と「人手で仕上げた創作内容」の区別は、**AIHints に明示的な提供元マーカー（hash 等）を新設**する方式で行う（既存の TODO接頭辞/正規表現ヒューリスティックの拡張ではなく）。
2. 将来 GitHub Actions から自動実行する「構造的再同期」が差分を検知した場合は、**PR を自動作成して人間レビュー待ち**とする（`addon-ai-tag` へ直接 auto-commit はしない）。

## 提案する設計

### 1. 「構造的再同期」専用モードの新設（`tools/patch-aihints.mjs`）

**目的**: `--force` の全面上書きと `--fill-todos` の TODO限定という二択の間に、「構造的に導出可能な部分だけを安全に最新化する」第三の選択肢を用意する。

**構造的ソースフィールドの定義**（再同期の入力となるフィールド一覧）:
`TailsUnit`, `AppearanceDetail`（`#Element_Ear` エントリのみ）, `GenderType`, `ConceptAge`, `Height_cm`, `Num`。

**AIHints 側に新設する provenance フィールド（案）**:

```json
"AIHints": {
  "common": { "...": "..." },
  "forms": { "...": "..." },
  "_meta": {
    "structuralSourceHash": "sha256:...",
    "structuralEntries": {
      "common.silhouette_features": ["nekomata 11 tails", "exactly 11 tails total, no more no less"],
      "common.immutable_traits": ["cat ears (immutable)", "nekomata 11 tails (immutable count)"],
      "forms.corefolder.ai_tags": ["cat ears", "nekomata 11 tails"],
      "forms.humanoid.ai_tags": ["cat ears", "nekomata 11 tails"]
    },
    "lastStructuralResync": "2026-07-08"
  }
}
```

- `structuralSourceHash`: 構造的ソースフィールドを正規化・結合した文字列のハッシュ値。次回実行時に同じ手順でハッシュを再計算し、一致すれば「変更なし・スキップ」、不一致なら「再同期が必要」と判定する（論点2の解決）。
- `structuralEntries`: 前回の再同期で**実際に挿入した文字列そのもの**を配列パスごとに記録する。次回再同期時は「記録されている文字列が今も配列内に存在すれば削除→新しい構造的事実を挿入」「記録されている文字列が見当たらなければ（＝人間が編集・削除した）何もしない」という **find-exact-and-replace** 方式で処理する。人間が手を加えていない構造由来タグだけを安全に更新し、それ以外（人力で仕上げた創作内容）には一切触れない（論点1の解決）。
- `_meta` は `_DBLink`/`_DBLinkResolved` 同様、内部補助情報として UI/公開 API には露出させない想定。

**新モード名（案）**: `--resync-structural`。既定 dry-run、`--apply` で反映という既存の一貫した UX に合わせる。

### 2. GitHub Actions ワークフロー新設

新規ワークフロー `.github/workflows/aihints-structural-resync.yml`（仮称）:

- トリガー: `push: [addon-ai-tag]`, `paths: [data/Works_NumberTales/DataBases/**]`（`cf-api-sync.yml` と同系統のパスフィルタ）。
- 処理: `node tools/patch-aihints.mjs --work NumberTales --db Primary --all --resync-structural --apply` を実行。
- 差分が発生した場合のみ、新規ブランチへコミットし、`addon-ai-tag` 向けに **Pull Request を自動作成**（`peter-evans/create-pull-request` 等の既存 Action、または `gh pr create` を直接叩く）。
- 差分が無ければ何もしない（no-op、`_meta.structuralSourceHash` が一致するため）。
- 必要な権限: `contents: write` + `pull-requests: write`。`GITHUB_TOKEN` の既定権限で足りるかは要確認。`notify-ai-dataset.yml` が専用 PAT（`AI_DATASET_DISPATCH_TOKEN`）を使っている前例があり、リポジトリ設定で Actions への PR作成権限が絞られている場合は同様に専用トークンが必要になる可能性がある。
- 論点3への直接対応: このワークフローが「DB更新 → AIHints再計算」を初めて CI 内に実装する存在になる。

### 3. `develop` → `addon-ai-tag` の追従について（論点4）

- **`develop` 側に追加実装は不要**。AIHints 関連コード・スキーマは `CLAUDE.md`/`AGENTS.md` の既定方針どおり `addon-ai-tag` 限定のスコープを維持し、`develop` は通常のスキーマ・データ変更を続けるだけでよい。
- **`develop` → `addon-ai-tag` のマージ自体を自動化することは提案しない**。本リポジトリの「一方向マージは人間の判断を介する」という既定方針を尊重し、マージ自体は引き続き手動トリガーとする。自動化するのは「マージが実行され `addon-ai-tag` に `data/**` の変更が反映された後」の、AIHints 構造的再同期の部分のみ（上記2.）。
- **`addon-ai-tag` 側に必要な追加実装**:
  1. `tools/patch-aihints.mjs` への `--resync-structural` モード追加（上記1.）
  2. 新規 GitHub Actions ワークフロー（上記2.）
  3. （任意・優先度低）「develop に未マージのコミットがある」ことを検知して知らせる仕組み。既存の `github-triage` 系 scheduled task の枠組みを流用できる可能性があるが、今回の本題（構造的再同期）とは別軸のため深追いしない。

## 未解決・要検討事項（本ドキュメントでは結論を出さない）

- 構造的ソースフィールドのハッシュ計算に含める範囲の最終確定（例: `Height_cm` は現状 `--apply-identitymotif`/`--apply-appearancedetail` 経路でのみ体格タグに使われており、`--suggest` 系では未使用。ハッシュ対象に含めるかはモード横断の一貫性を見て判断する）。
- `structuralEntries` の記録粒度（配列パスごとの文字列リストで十分か、`forms.corefolder`/`forms.humanoid` のように動的なフォーム名を含むパスの表現方法）。
- PR 自動作成時のレビュー担当・マージ運用（誰が最終承認するか、コンフリクトが起きた場合の扱い）。
- `100BeautiesLab_CreationsAI`（`notify-ai-dataset.yml` の通知先リポジトリ）側で AIHints データがどう消費されているかは本リポジトリから不可視。将来的な連携設計時は、そちらのリポジトリ管理者との調整が別途必要。

## 影響範囲（今回のセッションで編集したファイル）

- `_work_in_progress/2026-07-08_progress_aihints-structural-resync-proposal.md`（本ファイル、新規）

実装対象ファイル（未着手、将来のタスク）:
- `tools/patch-aihints.mjs`（`addon-ai-tag` ブランチ、`--resync-structural` モード追加）
- `.github/workflows/aihints-structural-resync.yml`（`addon-ai-tag` ブランチ、新規）
- `docs/ai-hints-usage.md`（`addon-ai-tag` ブランチ、新モードの使い方を追記）

## 未完了タスク

- 本提案の優先度判断（いつ実装に着手するか）は User 判断待ち。
- 実装に着手する場合は `addon-ai-tag` ブランチで別タスクとして計画する。

## 参考リンク

- `_work_in_progress/2026-07-07_progress_tailsunit-dedicated-type.md`（TailsUnit 専用型移行）
- `_work_in_progress/2026-07-08_progress_numbertales-earshapetype-restructure.md`（EarShapeType 再設計、develop側）
- `.github/workflows/cf-api-sync.yml` / `.github/workflows/notify-ai-dataset.yml`
