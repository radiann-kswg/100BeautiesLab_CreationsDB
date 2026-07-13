# 進捗ログの棚卸し（2026-07-14 / `develop`）

## 目的

前回（2026-07-13）の棚卸し後、`_work_in_progress/` 直下が再び 21 件（+README）まで増えたため、
`develop` ブランチを対象に進捗ログを棚卸しする。

## 方針（前回踏襲・User 合意）

- 退避判断は**書面上の「未完了」記載を鵜呑みにせず、実際に確認して裏取りする**。
  「確認待ち」のまま放置されていた項目は、この機会に確認して消化する。
- 単なる仕分けではなく、確認の結果として消化できた項目・新たに見つかった不具合は
  その場で対処し、対処内容を各ログと本ログへ残す。

## 実施内容

### 1. 裏取り（棚卸しの根拠づくり）

#### 1-1. Issue テンプレートの本番稼働（`issue-feature`）

ログには「`issues/new/choose` はサインインが必要で自動ツールから確認できないため、
**User がログイン済みブラウザで一度開く必要が残る**」と書かれていた。

`gh issue view 11` で確認したところ、**外部ユーザー `rabbit-rail` が 2026-07-09 に
Issue #11 を `data-correction.yml` テンプレート経由で起票済み**だった。

- 本文の見出しがテンプレート定義（対象作品 / 対象DB / 対象キャラクター名 / 該当フィールド名 /
  詳細 / URL / 確認事項）と**完全一致**
- 作品ドロップダウンに選択肢文字列「ナンバーテールズ (NumberTales)」がそのまま入っている
- 確認チェックボックスもチェック済み状態で記録されている

→ テンプレートのレンダリング・ドロップダウン・チェックボックスが本番で機能していることが、
**第三者による実利用という形で裏取りされた**（User の目視確認より強い証拠）。確認待ちを消化。

#### 1-2. Calling スキーマ重複の他作品影響（`fix_calling-schema-duplication`）

ログのチェックリストに「他作品への影響確認」「テストケース追加検討」が未チェックで残っていた。

**スキーマ調査**: 作品別 `db_type.json` に suffix 付き Calling 宣言が**まだ残っている**ことを発見。

| ファイル | 残存エントリ | 実データ使用数 |
| --- | --- | --- |
| `data/Works_NumberTales/DataBases/db_type.json` | `ForMasterCalling_JP` / `ForMasterCalling_EN` | Primary 96 / Secondary 6 / SemiPrimary 12 |
| `data/Works_UnauthedLogica/DataBases/db_type.json` | `ForMasterCalling_JP` / `ForMasterCalling_EN` | Primary 2 |

ログ自身が「今後 `ForMasterCalling` を追加する場合も base キーのみ登録パターンを遵守してください」と
注意を書き残していた箇所であり、当初は「その注意が守られずバグが再発している」と疑った。

**ブラウザ実地確認**（`python -m http.server` + Playwright / NumberTales Primary Num:1・Num:3 / JP・EN 両モード）:

- 「主人の呼び方」/「For Master Calling」の**行は 1 本だけ**（重複行なし）
- JP モード: `相棒 / partner, buddy`（JP・EN 併記）
- EN モード: `partner, buddy` のみ（JP は出ない）
- コンソールエラー 0 件 / 4xx 0 件

→ **表示バグは再現しない。** 理由は `pages/characters.js:7444-7484` の `parseLangSuffix(f.key)` 分岐で、
suffix 付きスキーマ宣言も base キーへ統合されるようになったため（`1fd78db` "API整備 refactorその17" で導入）。
2026-07-04 当時はスキーマ側での対処が必要だったが、その後 renderer 側が suffix 宣言に対して堅牢化された。
**スキーマを base キーへ寄せる整理は任意**（挙動は変わらない）。

> **調査中の誤検知メモ（記録として残す）**: 最初の確認スクリプトは JP モードで「EN 値が出ていない」と
> 判定したが、これは**偽陽性**だった。レンダラーがカンマ区切り値を別要素に分けて描画するため、
> `textContent` 上では `partner, buddy` が `partner,buddy`（区切りの空白が消える）となり、
> 生文字列での検索が空振りしていた。空白を除去して突き合わせ直したところ、JP モードでも
> `相棒 / partner, buddy` と**併記されている**ことが判明。これは正式名称・趣味など他フィールドと
> 同じ既定の bilingual 表示であり、重複行ではない（既存テストも `正式名称` に
> `'桜花 訫 / Trustia Cherrybroom'` を期待している）。**回帰として固定すべき性質は
> 「JP のみ表示されること」ではなく「行が 1 本であること」**である、と期待値を訂正した。

#### 1-3. コミット状態・同期状態

- `git status`: 追跡ファイルの未コミット変更なし。`origin/develop` と同期済み（0/0）。
- `unauthedlogica-index-alias` の「コミットは未実施（User の指示待ち）」は既に解消済み
  （`f3c18ae` "DB・API大幅整備 その20(代理周辺→アンオースドロジカ)" で着地済み）。

### 2. 確認の過程で見つけた不具合と対処

#### `data-correction` ラベルがリポジトリに未定義だった（修正済み）

`issue-feature` ログには「Issue管理ラベル（`data-correction` / `enhancement`）はテンプレート側で
指定済みだが、リポジトリ側にラベル自体が事前定義されているかは未確認（**無ければGitHubが自動作成する想定**）」
と書かれていた。**この想定は誤り**だった。

- `gh label list` の結果、リポジトリのラベルは GitHub 既定の 11 種のみで `data-correction` は**存在しない**。
- GitHub は Issue Forms の `labels:` に未定義ラベルが指定されても**自動作成せず、黙って無視する**。
- 実際、テンプレート経由で起票された Issue #11 の `labels` は**空配列**だった。

**対処**: User の承認を得て、ラベルを作成した。

```bash
gh label create data-correction --description "データ内容の誤り・修正報告" --color d4c5f9
```

以後のデータ修正 Issue には自動付与される。既存の Issue #11（クローズ済み）への遡及付与は行っていない。
`feature-suggestion.yml` の `labels: ["enhancement"]` は既定ラベルとして存在するため影響はなかった。

### 3. 回帰テストの追加（`tests/pages.characters.ui-output.test.js`）

`fix_calling-schema-duplication` の「テストケース追加検討」を消化するため、回帰テスト 2 件を追加した。

- `merges suffix-declared Calling schema entries into one bilingual row (JP)`
- `merges suffix-declared Calling schema entries into one row and drops JP in English mode (EN)`

固定した性質は **「行が 1 本であること」** と **「EN モードは EN のみになること」**。
併せてヘルパー `getDetailText()` / `countOccurrences()` / `squashSpaces()` を追加した
（`squashSpaces()` は上記の空白食い違いによる誤検知を防ぐためのもの）。

**空テストでないことの検証**: `pages/characters.js` の base 統合分岐（`if (langInfo && langInfo.base)`）を
一時的に無効化すると **2 件とも失敗する**ことを確認したうえで、`pages/characters.js` を復元した
（復元後、内容が `HEAD` と完全一致することを確認済み）。

### 4. 退避（6 件 → `.completed/`）

**`_work_in_progress/` 直下: 21 件 → 15 件（+README）**

| ログ | 退避理由 |
| --- | --- |
| `2026-07-13_progress_wip-tidy.md` | 前回の棚卸し作業ログ本体。未完了タスクなし |
| `2026-07-13_github-triage.md` | `2026-07-14_github-triage.md` へ世代交代 |
| `2026-07-04_progress_issue-feature.md` | 確認待ちを Issue #11 で消化（ラベル不具合も修正） |
| `2026-07-04_fix_calling-schema-duplication.md` | 他作品影響を実地確認・回帰テスト追加で消化 |
| `2026-07-13_progress_pkg-sync.md` | 実装・検証完了。残る技術負債は母艦 P4 へ引き継ぎ |
| `2026-07-13_progress_unauthedlogica-index-alias.md` | コミット済み確認。残る辞書ラベルは母艦 P3 へ引き継ぎ |

退避した 2 件（`issue-feature` / `fix_calling-schema-duplication`）には、移動前に確認結果を追記した。

### 5. 索引・台帳の更新

- `README.md`: トピック索引を残存 15 件へ再構成。「系列の補足」に Issue 機能系 / Calling 表示系 /
  pkg 追従系 / アンオースドロジカ Index 系の完結を追記。退避一覧・整理履歴に本棚卸しを追記。
- `2026-07-08_remaining-task.md`（母艦）: P3-3 / P4-1 の参照先を `.completed/` へ更新。
- `2026-07-03_current-task-ledger.md`: P2 から Issue テンプレート行を削除（解消済み）、
  ColorPalette の User レビュー待ちを追加。参照先を `.completed/` へ更新。

## 影響範囲（編集ファイル）

- `tests/pages.characters.ui-output.test.js`（回帰テスト 2 件 + ヘルパー 3 件を追加）
- `_work_in_progress/README.md`
- `_work_in_progress/2026-07-08_remaining-task.md`
- `_work_in_progress/2026-07-03_current-task-ledger.md`
- `_work_in_progress/2026-07-14_progress_wip-tidy.md`（本ファイル・新規）
- 退避した 6 件（`.completed/` へ移動、Git 管轄外。うち 2 件は移動前に確認結果を追記）
- GitHub リポジトリ設定: `data-correction` ラベルを新規作成（コードの変更ではない）

`pages/characters.js` は空テスト検証のため一時的に変更したが、**復元済み**（`HEAD` と内容一致を確認）。

## 検証

- `npm test`: 全件成功（下記「テスト結果」参照）
- ブラウザ実地確認: 上記「1-2」のとおり（コンソールエラー 0 件 / 4xx 0 件）
- 作業スクリプト（Git 管轄外）: `.cache/calling-check-20260714.mjs` / `.cache/calling-dump-20260714.mjs`

## 未完了タスク

- **なし**（棚卸し作業自体は完了）。引き継いだ残タスクは `2026-07-08_remaining-task.md`（母艦）および
  `2026-07-03_current-task-ledger.md` を参照。
- 本棚卸しの成果は**未コミット**（User の指示待ち）。

## 申し送り事項

### `.git/index.lock` の stale lock（**解消済み**）

本体ローカル（`D:\VisualStudio Code Userfile\100BeautiesLab_CreationsDB`）の `.git/index.lock` に
**2026-07-13 21:18 付の 0 バイトのロックファイルが残っていた**。

- 実行中の git プロセスは**存在しなかった**（`tasklist` で確認）
- 読み取り系（`git status` / `git log` / `git show`）は動作するが、
  **index を書き込む操作（`git add` / `git checkout --` / `git commit`）が失敗する**状態だった
- 本セッションで作成されたものではなく、**着手時点で既に存在していた**

**対処**: git プロセス不在を再確認のうえ、User の承認を得て `.git/index.lock` を削除。
`git add --dry-run` で index 書き込みが正常化したことを確認済み（コミットは未実施）。

> 参考: `2026-06-28_progress_conversationpattern-handoff.md`（母艦 P1）に記録されている
> stale lock は **sub2 側**のもので、本件（本体ローカル）とは別。sub2 側は未解消のまま。

### 任意項目（急がない）

- 作品別 `db_type.json`（NumberTales / UnauthedLogica）の `ForMasterCalling_JP` / `_EN` を
  base キー（`ForMasterCalling`）へ寄せるスキーマ整理。**表示挙動は変わらない**ため任意。
  実施する場合も、追加した回帰テストの期待値は変更不要。

## 参考

- `_work_in_progress/README.md`（トピック別索引・退避一覧・整理履歴）
- `.completed/2026-07-13_progress_wip-tidy.md`（前回の棚卸し）
- `CLAUDE.md` / `AGENTS.md`（`_work_in_progress/` の運用ルール・ブランチ運用方針）
