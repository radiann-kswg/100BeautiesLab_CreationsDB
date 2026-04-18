# 2026-04-18 画像ライトボックス実装

## 目的

- キャラシート詳細の画像ギャラリーに、クリックで拡大表示できるポップアップ機能を追加する。
- 既存の詳細ビュー構造を崩さず、キーボード操作と閉じる操作も確保する。

## 変更点の要約

- pages/characters.html にライトボックス用のダイアログDOMを追加。
- pages/characters.js に画像カード生成ヘルパー、ライトボックス開閉処理、Esc/背景クリック/閉じるボタン対応を追加。
- pages/characters.sass / pages/characters.css に拡大表示UIと画像ズームトリガーのスタイルを追加。
- pages/characters.html の asset-version を更新。

## 影響範囲

- pages/characters.html
- pages/characters.js
- pages/characters.sass
- pages/characters.css

## 未完了タスク

- エディタエラー確認
- 画像ポップアップ周辺のテスト実行
- 必要に応じた微調整

## 参考リンク

- pages/characters.html
- pages/characters.js
- pages/characters.sass
- pages/characters.css
