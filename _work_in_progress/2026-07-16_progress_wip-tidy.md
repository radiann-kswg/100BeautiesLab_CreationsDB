# 進捗ログの棚卸し（2026-07-16 / `develop`）

## 目的

前回（2026-07-14）の棚卸し後、`_work_in_progress/` 直下が 21 件（+README）まで増えたため、
`develop` ブランチを対象に進捗ログを棚卸しする。本作業は `develop` → `addon-ai-tag` の
2 ブランチ横断棚卸しの**前半（develop パス）**。

## 方針（前回踏襲・User 合意）

- 退避判断は**書面上の「未実施/確認待ち」記載を鵜呑みにせず、実際に確認して裏取りする**。
- ブラウザ実地確認は User が開いていたローカルサーバー（`127.0.0.1:5500`）とは別ポート
  （`127.0.0.1:8123`・SW ヘッダー付き自前サーバー）で Playwright を回し、ポート衝突を避けた。
- 棚卸し成果は**未コミットで残す**（User の確認後にコミット指示を出す運用・User 選択）。

## 実施内容

### 1. 裏取り（ブラウザ実地確認 + コミット状態）

検証スクリプト: `.cache/verify-wip-20260716.mjs`（Git 管轄外・再実行可）。
対象 HEAD は `develop` の `6646d50`（`origin/develop` と 0/0 同期）。

#### 1-1. グローバル辞書解決の復旧（`global-dict-resolution-fix` / `f78cfdb`）

ログには「ブラウザ実地確認: 未実施（要 User 確認）」と残っていた。Playwright Chromium で確認し、
グローバル辞書由来フィールドが**素値でなく和英併記で復旧**していることを裏取りした。

| レコード | フィールド | 表示（実地確認） |
| --- | --- | --- |
| NT/Primary Num:1・57 | 所属 | `百花繚乱研究所 / HundredBeauties Laboratory` |
| 〃 | 種族 | `ポータブルヒューマノイド(妖獣型) / Portable Humanoid (Tale-Beast Appearance-Type)` |
| 〃 | 性別 | `無性別中性型 / Neutral`（`Neutral` → dict_GenderType 解決） |
| NT/Secondary 0xA | 作者名 | `散狐アタスト / @AtastMaifox / …`（`sec_DesignedBy` 由来。改修前は素値 `Atast`） |
| NT/Primary Num:57（EN） | 所属/種族/性別 | `HundredBeauties Laboratory` / `Portable Humanoid …` / `Neutral`（英語のみで正しい） |

- コンソール pageerror 0 件 / 4xx 0 件。
- → 「グローバル辞書だけが素値落ちする」症状は**再現しない**。確認待ちを消化。

#### 1-2. 公式サイトリンクの表示（`official-links` / `6646d50`）

ログには「ローカル HTTP サーバー上でのビジュアル確認は User 環境での目視を推奨」と残っていた。
「作品情報」欄（`#meta-work-links`, hidden=false）に公式リンクが表示・クリック可能であることを確認。

| 作品 | 公式リンク（実地確認） |
| --- | --- |
| NumberTales | `公式サイト → https://www.numbertales-radiann.com/` ＋ `リクエストナンバー受付 → …/request.html` |
| FLInvestigator78 | `公式サイト → https://fateline-investigator78.com/` ＋ `公式タロット制作メンバー募集中 → …/official-tarot_recruitment.html` |

- すべて `target="_blank" rel="noopener noreferrer"`（`buildSafeExternalUrl()` の `http/https` 限定込み）。
- EN モードで `Official Site (JAPANESE ONLY)` / `Request Number Reception (JAPANESE ONLY)` へラベル切替を確認。
- pageerror 0 件 / 4xx 0 件。確認待ちを消化。

#### 1-3. コミット状態・同期状態

- `git status`: 追跡ファイルの未コミット変更なし（未追跡の日次 triage 2 件を除く）。
- `origin/develop` と 0/0 同期。`url-params`（`a36ba32`）・`global-dict-fix`（`f78cfdb`）・
  `official-links`（`6646d50`）はいずれも**コミット済み＆push 済み**。

### 2. 退避（6 件 → `.completed/`）

**`_work_in_progress/` 直下: 21 件 → 15 件（+ 棚卸しログ本体 1 件で 16 件・+README）**

| ログ | 退避理由 |
| --- | --- |
| `2026-07-14_progress_global-dict-resolution-fix.md` | 辞書和英併記の復旧をブラウザ実地確認で消化（残: `addon-ai-tag` マージ） |
| `2026-07-16_progress_official-links.md` | 公式リンク表示をブラウザ実地確認で消化（残: Worker `/works` → 母艦 P4-6） |
| `2026-07-14_progress_url-params.md` | 圧縮ロケータ `?c=` + 錦野姉妹 Dealer 対応まで完了・コミット済み |
| `2026-07-14_progress_wip-tidy.md` | 前回の棚卸し作業ログ本体。未完了タスクなし |
| `2026-07-14_github-triage.md` | `2026-07-16_github-triage.md` へ世代交代 |
| `2026-07-15_github-triage.md` | 同上（未追跡ファイル） |

退避した 2 件（`global-dict-resolution-fix` / `official-links`）には、移動前に確認結果を追記した。

### 3. 索引・台帳の更新

- `README.md`: トピック索引の triage 行を `2026-07-16` へ更新、`global-dict-resolution-fix` 行を除去（残 15 件）。
  「系列の補足」に「キャラシート URL / 辞書解決系」「公式サイトリンク系」の完結を追記。
  退避一覧に「2026-07-16 棚卸しで追加退避（6件）」、整理履歴に本棚卸しを追記。
- `2026-07-08_remaining-task.md`（母艦）: P4 に `Works_OfficialLinks` の Worker `/works` 明示追加（P4-6）を追加。
- `2026-07-03_current-task-ledger.md`: 「2026-07-16 棚卸しで完了・退避したもの」節を追加、triage 参照を `2026-07-16` へ更新。

## 影響範囲（編集ファイル）

- `_work_in_progress/README.md`
- `_work_in_progress/2026-07-08_remaining-task.md`
- `_work_in_progress/2026-07-03_current-task-ledger.md`
- `_work_in_progress/2026-07-16_progress_wip-tidy.md`（本ファイル・新規）
- 退避した 6 件（`.completed/` へ移動、Git 管轄外。うち 2 件は移動前に確認結果を追記）

コード（`pages/` `lib/` `data/` 等）への変更は本棚卸しでは**なし**（確認は読み取り + ブラウザ操作のみ）。

## 検証

- ブラウザ実地確認: 上記「1-1」「1-2」のとおり（pageerror 0 件 / 4xx 0 件）。
- コミット/同期状態: `git log` / `git status` / `git rev-list --count` で確認（0/0）。
- `npm test` は本棚卸しでは再実行していない（コード無変更のため。直近の `f78cfdb` 時点で 370 件、
  `6646d50` 時点で 373 件成功を各ログで確認済み）。

## 未完了タスク

- **なし**（develop パスの棚卸し作業自体は完了）。引き継いだ残タスクは下記「申し送り」と
  `2026-07-08_remaining-task.md`（母艦）を参照。
- 本棚卸しの成果は**未コミット**（User の指示待ち）。

## 申し送り事項

### `addon-ai-tag` パス（本棚卸しの後半）への引き継ぎ

- **`develop` → `addon-ai-tag` の一方向マージ**を実施する。特に `f78cfdb`（グローバル辞書解決の
  妥当性判定修正）は `addon-ai-tag` でも同じテスト失敗が出るため取り込みが必要。逆マージ（`addon-ai-tag`
  → `develop`）は禁止（`CLAUDE.md` ブランチ運用方針）。
- `addon-ai-tag` 側の進行中ログ（本 `develop` にも存在する `aihints-structural-resync-proposal` /
  `aihints-palette-deadlock` / `addon-ai-tag-reverse-merge-incident`）は、`addon-ai-tag` パスで
  実地の実装状況と突き合わせて棚卸しする。

### 母艦 P4 へ引き継いだ技術負債

- `Works_OfficialLinks` の Worker `/works` レスポンス明示追加（P4-6）。

## 参考

- `_work_in_progress/README.md`（トピック別索引・退避一覧・整理履歴）
- `.completed/2026-07-14_progress_wip-tidy.md`（前回の棚卸し）
- `.cache/verify-wip-20260716.mjs`（本棚卸しの実地確認スクリプト）
- `CLAUDE.md` / `AGENTS.md`（`_work_in_progress/` の運用ルール・ブランチ運用方針）
