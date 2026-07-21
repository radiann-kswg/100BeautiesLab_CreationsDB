# 2026-07-22 進捗: エージェント指示書の SSOT 化と Codex 本採用

- ブランチ: `develop`
- 状態: 🟢 実装・検証完了（成果は未コミット）
- 関連: `CHANGELOG.md`（2026-07-22 エントリ）/ `2026-07-22_progress_wip-tidy.md`（同日の棚卸し）

## 目的

OpenAI Codex を本採用するにあたり、従来の 2 エージェント（Claude / Copilot）だけでなく Codex にも
同じ「AGENTS 設定」が渡るようにする。あわせて、技術・運用ルールの二重管理を解消して SSOT にする。

## 背景・課題（着手前の実測）

| 系統 | 正典 | Claude 入口 | Copilot 入口 | Codex 入口 |
| --- | --- | --- | --- | --- |
| ロールプレイ | `AGENTS.md`（115行） | `CLAUDE.md`（`@AGENTS.md`） | `roleplay.instructions.md` | ✅ 直読み |
| 英訳補助 | `docs/localization-en-rules.md` | `data/CLAUDE.md` | `localization-en.instructions.md` | ❌ 入口なし |
| **技術・運用ルール** | **❌ 正典なし** | `CLAUDE.md` 512行 | `copilot-instructions.md` 936行 | ❌ 届かない |

- 技術ルールには正典が無く、実体が 2 ファイルに存在。「仕様判断が固まったら**両方へ反映**する前提」と
  明記されており、**設計として二重管理**になっていた。
- 実際に乖離済み: Copilot 側だけが「日本語注釈・コメント標準化ガイド」（227行）を持ち、
  Claude 側だけが「ブランチ運用方針」「サブローカル並行作業運用」「禁止事項（まとめ）」
  「主要ドキュメント参照先」を持っていた。
- Codex はルート `AGENTS.md` しか読まないため、**スキーマ駆動方針もブランチ運用も禁止事項も渡らない**。

## 合意事項（User 判断）

- **案C を採用**: `AGENTS.md` を唯一の source とし、Copilot 版は生成する。
  - 採用理由: Copilot が `AGENTS.md` を自動で読むかどうかを本環境から検証できず、
    純粋なポインタ方式（案A）だと「Copilot だけ技術ルールを失う」事故になり得る。
    生成方式なら Copilot 側の対応状況に**依存しない**。既存の `build-roleplay-prompts.mjs` の前例とも揃う。
- **一気に全実装**（変更量 500 行超の事前確認済み）。

## 変更点の要約

### 1. `AGENTS.md` を唯一の正典（SSOT）へ

- ロールプレイ仕様（§0〜§8）はそのまま維持。
- §9「入口ファイルとの関係」を **SSOT 構成表**へ改訂し、Codex 行・生成物の明示・更新手順を追加。
- 以降に**技術・運用ルール全文**を統合。旧 2 ファイルを突き合わせ、
  **どちらか一方にしか無かった節をすべて収録**した。

### 2. `CLAUDE.md` を薄い入口へ

- `@AGENTS.md` で正典を取り込み。
- 残したのは (a) `@` 非展開環境向けの声カード＋基本ルール最小要点、
  (b) **Claude 固有の実行環境メモ**（Cowork サンドボックス / PowerShell の `npm.cmd` フォールバック /
  `PostToolUse` の Prettier フック / `data/CLAUDE.md` への導線）、(c) 指示書更新手順。

### 3. `.github/copilot-instructions.md` を生成物へ

- `tools/build-agent-instructions.mjs`（新規）が
  `tools/agent-instructions/copilot-header.md` ＋ `AGENTS.md` 本文を連結して生成。
- **正典本文は一切変換しない**。ツール名の機械置換は情報を失い差分レビューを難しくするため、
  「本文中の『エージェント』は Copilot を指す」という読み替えをヘッダーで宣言する方式にした。

### 4. Codex 入口の整備

- ルート `AGENTS.md` は Codex が直読みするため追加設定不要。
- `data/AGENTS.md` を**新設**（`data/CLAUDE.md` と対称）。これまで `data/` 配下のパススコープ指示が
  Claude と Copilot にしか無く、Codex だけ英訳補助ルールを受け取れなかった。
- `data/CLAUDE.md` / `localization-en.instructions.md` にも 3 入口の対称性を明記。

### 5. スキルの正典を `.agents/skills/` へ一本化

- 調査で判明: `~/.agents/skills/` は**エージェント共通**のスキル置き場で、Claude Code も読み込む
  （本セッションの利用可能スキル一覧に `~/.agents/skills/` 配下の cloudflare 系が入っていることで確認）。
  Codex 固有品は `~/.codex/skills/.system/` に別置きされている。
- したがって `.agents/skills/` を正典、`.claude/skills/` を逐語ミラー（生成物）とした。
- 文言をツール中立化（「Codex 自身が」→「エージェント自身が」）。

### 6. ズレ検出（ビルド忘れ対策）

- npm scripts: `agents:plan`（dry-run） / `agents:build`（生成） / `agents:check`（差分で exit 1）。
- `tests/agent-instructions.sync.test.js`（新規）が再生成結果とコミット済み生成物の一致を検証。

## 設計上の安全策

- **既定は dry-run**: `--write` を明示するまで書き込まない（`normalize-field-order.mjs` の作法を踏襲）。
- **削除は明示的に**: ミラー先にのみ存在する余剰ファイルは既定で消さず報告のみ。消すなら `--prune`。
- **改行の正規化**: `.gitattributes` が `* text=auto` のため、比較時に CRLF → LF 正規化してから突き合わせる
  （Windows チェックアウトで `--check` が誤検知しないように）。

## 検証

- `npm test`: **42 ファイル / 569 件すべて成功**（着手前 41/564 → 新規テスト 5 件追加）。
- **ガードの実効性を実地確認**: `.github/copilot-instructions.md` へ意図的にドリフトを注入して
  `npm run agents:check` を実行し、**exit 1 で検出**されることを確認。再生成で復旧することも確認済み。
- **内容欠落の検査**: 旧 `CLAUDE.md`（181件）・旧 `copilot-instructions.md`（318件）の
  太字ルールラベル計 499 件を新正典へ機械的に突き合わせ、未収録分を 1 件ずつ精査。
  結果、大半は表記ゆれ（`ES6+モジュール` → `ES6+ モジュール`、`!important 濫用` → `` `!important` 濫用`` 等）で
  内容は保持されていた。取りこぼしていた実体 2 件（`HTTPS 通信` / `README.LOCAL.md` の「配布方法」）は
  正典へ追記して回収した。
- **生成物の往復**: `agents:build` → `agents:check` が `0/2 件が要更新` で一致することを確認。

## 意図的に落としたもの

- 旧 `copilot-instructions.md` 末尾の「## まとめ」節（重要なポイント 7 項目＋締めの段落）。
  いずれも本文の再掲であり、正典の肥大化を避けるため収録しなかった。
- 「コードフォーマット: 手動整形（将来的に Prettier 導入予定）」。
  実態と乖離していた（`.claude/settings.json` の `PostToolUse` フックで Prettier が自動実行される）。

## 影響範囲（編集ファイル）

**正典・入口**

- `AGENTS.md`（正典化。ロールプレイ＋技術/運用ルール統合）
- `CLAUDE.md`（薄い入口へ全面書き換え）
- `data/AGENTS.md`（新規）/ `data/CLAUDE.md`（対称入口の明記）
- `.github/instructions/localization-en.instructions.md`（同上）

**生成物（手で編集しない）**

- `.github/copilot-instructions.md`
- `.claude/skills/localize-en-draft/SKILL.md`

**ツール・テスト**

- `tools/build-agent-instructions.mjs`（新規）/ `tools/agent-instructions/copilot-header.md`（新規）
- `tests/agent-instructions.sync.test.js`（新規）
- `package.json`（`agents:plan` / `agents:build` / `agents:check`）
- `.agents/skills/localize-en-draft/SKILL.md`（スキル正典・文言中立化）

**記録**

- `CHANGELOG.md`（2026-07-22 エントリ）
- `_work_in_progress/2026-07-22_progress_agents-ssot.md`（本ファイル）

## 未完了タスク

- **本作業の成果は未コミット**（User の確認・指示待ち）。
- `.agents/` は git 未追跡のままなので、コミット時に含めるか判断が必要
  （スキル正典なので**含める想定**だが、User の「今は保留」判断を尊重して本作業では追加していない）。

## 申し送り事項

1. **Copilot が `AGENTS.md` を直読みするかは未検証**。本方式は読まなくても成立する（生成物を配置するため）
   が、もし読むことが確認できれば将来 `copilot-instructions.md` を薄いポインタへ縮められる。
2. **`addon-ai-tag` への波及**: 本改修は指示書構造の変更なので、`develop` → `addon-ai-tag` の
   一方向マージで取り込む必要がある（逆マージ禁止）。
3. ルール追加時の手順が変わった: **`AGENTS.md` を編集 → `npm run agents:build` → 生成物ごとコミット**。
   `.github/copilot-instructions.md` を直接編集しても次のビルドで上書きされる。

## 参考

- `AGENTS.md` §9（入口ファイルとの関係・更新手順）
- `tools/build-agent-instructions.mjs`（JSDoc に設計原則を記載）
- `CHANGELOG.md` 2026-07-22 エントリ
