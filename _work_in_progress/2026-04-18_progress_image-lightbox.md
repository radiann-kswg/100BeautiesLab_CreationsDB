# 2026-04-18 画像ライトボックス実装

## 目的

- キャラシート詳細の画像ギャラリーに、クリックで拡大表示できるポップアップ機能を追加する。
- 既存の詳細ビュー構造を崩さず、キーボード操作と閉じる操作も確保する。

## 変更点の要約

- pages/characters.html にライトボックス用のダイアログDOMを追加。
- pages/characters.js に画像カード生成ヘルパー、ライトボックス開閉処理、Esc/背景クリック/閉じるボタン対応を追加。
- pages/characters.sass / pages/characters.css に拡大表示UIと画像ズームトリガーのスタイルを追加。
- pages/characters.html の asset-version を更新。

### 2026-04-18 追補: スタイル崩れ確認に伴う微調整

- 詳細ギャラリーの画像カードを縦積み flex に統一し、キャプションの有無で画像ボタンの高さが崩れにくいよう調整。
- 画像ズームトリガーに `height: 100%`、角丸継承、`overflow: hidden` を付与し、画像角とフォーカス枠の不整合を抑制。
- 「さらに表示」領域をカード風の見た目へ揃え、詳細ギャラリー内で浮いて見えにくいようにした。
- ライトボックスダイアログを `overflow: auto` / `overscroll-behavior: contain` に変更し、小画面や長いキャプションでも収まりが崩れにくいようにした。
- キャプションに上端罫線を追加し、画像と説明文の境界を明確化した。

## 影響範囲

- pages/characters.html
- pages/characters.js
- pages/characters.sass
- pages/characters.css

## 未完了タスク

- ブラウザ上での最終目視確認（この環境ではブラウザ DOM を直接取得できないため、ローカル起動までは実施）
- 必要に応じた微調整

## 検証

- pages/characters.html / pages/characters.sass / pages/characters.css のエディタエラー: 問題なし
- ローカル HTTP サーバー経由で `pages/characters.html` の取得応答を確認
- `tests/pages.characters.syntax.test.js`: pass

## 参考リンク

- pages/characters.html
- pages/characters.js
- pages/characters.sass
- pages/characters.css
