# 2026-03-04 進捗ログ: トップページ導線/README 折りたたみ改善

## 目的

- 最優先タスク 2「トップページの Markdown 破綻の修正」
- 最優先タスク 3「トップページの誘導改善」

GitHub Pages のトップ（`/`）に入口ページを設け、UI/API/ガイドラインの場所が分かりやすい状態にする。
あわせて GitHub 側 README の折りたたみ（`<details>`）内 Markdown 互換性を上げる。

## 変更点の要約

- GitHub Pages トップ用に `index.html` を追加し、以下へ誘導するボタンを配置
  - キャラシート UI: `/pages/characters.html`
  - API（GUI）: `/api/`
  - ガイドライン: GitHub の README（JP ガイドライン章）
- `README.md` のナビゲーションを「デプロイ先 URL（CNAME）」中心に整理し、入口リンクを明確化
- `README.md` の `<details>` に `markdown="1"` を付与し、Markdown パーサ差異による崩れを起こしづらくした

## 影響範囲（編集したファイル）

- `index.html`（新規）
- `README.md`
- `CHANGELOG.md`

## 未完了タスク

- GitHub Pages 上で `/` にアクセスして、トップ導線（UI/API/ガイドライン）が意図通りに機能するかの目視確認
- README の折りたたみ表示が崩れていた実症状が再現しないか（GitHub 側）を再確認

## 参考リンク

- GitHub Pages（CNAME）: https://database.numbertales-radiann.net/
- リポジトリ: https://github.com/radiann-kswg/100BeautiesLab_CreationsDB
