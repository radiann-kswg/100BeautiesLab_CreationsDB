# 2026-09-11 進捗: 創作ガイドラインの新規タイトル補填 + `grilling` スキル取り込み

## 目的

- `guideline.md` / `guideline.en.md` に載っていなかった創作タイトル（ハンカクライブ／我ら美徳の桜花兄弟／アンオースドロジカ、および表に列が無かった豹変系女子）を補填する。
- 補填内容のすり合わせに使うため、Matt Pocock さんの `grilling` / `grill-me` スキルをリポジトリ共通スキルとして取り込む（`/grilling` が `Unknown command` だったため）。

## 変更点の要約

1. **スキル取り込み**（コミット `a9e0185`）: `.agents/skills/grilling/` `.agents/skills/grill-me/` を MIT ライセンス表記付きで逐語コピーし、`npm run agents:build` で `.claude/skills/` へミラー。`AGENTS.md` §9 に第三者スキル取り込みルールを追記。
2. **ガイドライン補填**（本ログ対象）: `/grilling` で 3 ラウンド（ラウンド 1: 進め方 6 問 / ラウンド 2: 値と統合方針 6 問 / ラウンド 3: 注釈文面と英訳 5 問）を実施し、全回答を User から取得したうえで両言語へ反映。詳細は `CHANGELOG.md` 同日エントリ。
3. **`data/db_meta.json`**: 獣爾騎兵の `Works_OfficialLinks` を新規登録。

## 合意事項（ルール）

- ガイドライン本文は原則 User 手動管理（`AGENTS.md`）。今回は **User の明示許可のもと、この作業に限り** エージェントが直接編集した。値・注釈文・英訳はすべて User 回答どおりで、エージェントは独自に決めていない。
- 公式サイト URL は `www.` 無しを正とする（運命線探偵78・獣爾騎兵）。
- 英語版の獣爾騎兵表記（`Shau'er Riders` vs `db_meta.json` の `Shou'ar Riders`）の統一は今回のスコープ外として保留。

## 影響範囲（編集したファイル）

- `guideline.md` / `guideline.en.md`
- `data/db_meta.json`（`#Works_ShouArRiders.Works_OfficialLinks`）
- `CHANGELOG.md` / 本ログ
- （スキル側）`.agents/skills/**` / `.claude/skills/**` / `AGENTS.md` / `.github/copilot-instructions.md`

## 検証

- `npm test`（Vitest）: 実行結果は PR #32 参照。
- `npx prettier --check` で Markdown 表の整形を確認。
- 公式サイト URL の実在確認は、リモート環境の外向き通信制限のため **未実施**（User 指定の URL をそのまま採用）。

## 未完了タスク / 申し送り

- [ ] 英語版ガイドラインの `Shau'er Riders` / `Shou'ar Riders` 表記統一（User 判断で別途）。
- [ ] 英語版「その他」列の Cross over が `※9`（日本語版は `OK`）という既存差異の要否確認（今回は不変）。
- [ ] `guideline.md` の 利用許可タグに残る旧称「#運命線探偵 OCTOGINTA」の扱い（`db_meta.json` では `OldTitles` に退避済み）。

## 参考リンク

- PR: https://github.com/radiann-kswg/100BeautiesLab_CreationsDB/pull/32
- 上流スキル: https://github.com/mattpocock/skills （MIT License）
