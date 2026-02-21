# 2026-02-21 README 整理・英訳補完

## 目的

- `README.md` を閲覧者が読みやすいように整理し、導線を明確化する
- README 冒頭のガイドライン章は極力編集せず、英訳は別ドキュメントで補完する

## 変更点の要約

- `README.md`
  - ガイドライン章の直後に「README ナビゲーション」を追加
  - 閲覧者向け/開発者向けの入口を整理
  - 技術仕様・API・キャラシート機能の詳細を `<details>` で折りたたみ化
  - 末尾の英語重複ブロックを削除し、英語版ドキュメントへのリンクに置換

- `docs/`
  - `docs/readme.en.md`: README の技術情報の英語版（全文英訳の受け皿）
  - `docs/guidelines.en.md`: README 冒頭ガイドライン章の読みやすい英訳（翻訳補助）
  - `docs/README.md`: docs 配下の目次

## 影響範囲（編集したファイル）

- `README.md`
- `docs/readme.en.md`
- `docs/guidelines.en.md`
- `docs/README.md`

## 検証

- Vitest: 既存テスト全件パス（8 passed）

## 未完了タスク / 次にやること（任意）

- 日本語ドキュメント（`docs/viewer-guide.md` 等）の英語版を作るかは要検討
- README の目次（アンカーリンク）をさらに整える場合は、GitHub の自動アンカー仕様に合わせて追従

## 参考リンク

- `docs/viewer-guide.md`
- `docs/db-update-guidelines.md`
- `docs/third-party-policy.md`
