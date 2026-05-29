# 2026-05-29 進捗: 創作作品ガイドラインを言語別ファイルへ集約

## 目的

- 一次/二次創作ガイドラインの本文と「二次創作 OK/NG リスト」(画像) を 1 系統に集約し、複数ファイルで重複・分散している状態を解消する。
- 現行ガイドラインの文面は **一言一句変更しない** ことを最優先制約とする。

## 変更点の要約

- 新規: `guideline.md`（和文・正本） / `guideline.en.md`（英文）をリポジトリ直下に追加。
  - 和文・英文とも README.md 冒頭の現行本文を verbatim で移植。
  - 「二次創作 OK/NG リスト」は PNG への外部リンクを廃止し、Markdown 表として書き起こし（注釈 ※1〜※9 も含む）。
- 更新: `README.md` の冒頭ガイドライン章本文を削除し、`guideline.md` / `guideline.en.md` への案内リンクのみへ簡略化。ナビゲーション節と末尾 EN セクションのリンクも `guideline*.md` 側へ差し替えた。
- 削除: `docs/guidelines.en.md`（paraphrased な英訳メモ。新 `guideline.en.md` に統合）。
- 同期: `CONTRIBUTING.md`、`.github/copilot-instructions.md`、`docs/README.md` の参照を `guideline.md` / `guideline.en.md` 体制へ差し替え。
- 履歴: `CHANGELOG.md` に集約作業を追記。

## 影響範囲

- `guideline.md`（新規）
- `guideline.en.md`（新規）
- `README.md`
- `docs/guidelines.en.md`（削除）
- `docs/README.md`
- `CONTRIBUTING.md`
- `.github/copilot-instructions.md`
- `CHANGELOG.md`

## 検証

- `tests/docs.links.test.js` は既知の誤 UI リンク（正: `pages/characters.html`）のみを検査するため、本変更で破綻しないことを確認済み。
- ガイドラインに関わる文面は README からの移植であり、本文の改変は行っていない（OK/NG リストの表化のみ新規追加要素）。

## 未完了タスク

- なし（本セッションのスコープでは完了）。
- 必要に応じて `SecondaryWorksPermissionList_*.png` の扱い（残置 / 削除）を別途検討。
