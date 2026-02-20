# 2026-02-20 CHANGELOG更新の復旧（直近半年分）

## 目的

- `CHANGELOG.md` の更新が停滞していたため、直近半年（2025-08〜2026-02）の Git 更新履歴を確認し、主要な変更点を `CHANGELOG.md` に追記する。
- 今後、重要な仕様変更があった際に `CHANGELOG.md` も同時更新する運用ルールを Copilot 指示書へ明文化する。

## 変更点の要約

- `CHANGELOG.md` に、2025-08 / 2025-10 / 2025-12 / 2026-01 / 2026-02-03 / 2026-02-18 の項目を追記。
- `.github/copilot-instructions.md` に、重要な仕様変更時は `CHANGELOG.md` を更新するルールと、大規模更新チェックリストへの追記を実施。

## 影響範囲（編集したファイル）

- `CHANGELOG.md`
- `.github/copilot-instructions.md`
- `_work_in_progress/2026-02-20_changelog-refresh.md`

## 未完了タスク

- なし（Vitest の全テスト成功を確認）。

## 参考

- コミット抽出例: `git log --since="2025-08-20" --date=short --pretty=format:"%h %ad %s" --name-only`
- 期間別確認例: `git log --since="2025-10-01" --until="2025-12-31" ...`
