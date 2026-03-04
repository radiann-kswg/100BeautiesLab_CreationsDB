# 2026-03-04 進捗ログ: 希望タスク フェーズ0（基盤整備）

## 目的

- 希望タスクのうち、フェーズ0「基盤の整備（docs + typo検知）」を先に実施し、以降の仕様変更で混乱しにくい状態にする。

## 変更点の要約

- 閲覧者向けガイドに「用語ミニ辞書（Works/DB/DefType/VarsDef + APIスコープ）」を追加
- 進捗ログ原文で混入していた誤リンク `pages/character.html` を `pages/characters.html` に修正
- Markdown 内の既知誤リンクを継続検知する Vitest を追加

## 影響範囲（編集したファイル）

- `docs/viewer-guide.md`
- `_work_in_progress/2026-02-21_remaining-task.md`
- `_work_in_progress/2026-03-04_remaining-task.md`
- `tests/docs.links.test.js`

## 検証

- `npm test`（Vitest）: 全テスト通過

## 未完了タスク

- 必要なら、誤リンク検知の対象（例: 他の頻出 typo）を追加

## 参考リンク

- 閲覧者ガイド: `docs/viewer-guide.md`
- テスト: `tests/docs.links.test.js`
