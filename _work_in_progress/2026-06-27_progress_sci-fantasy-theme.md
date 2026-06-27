# 2026-06-27 進捗ログ — サイトUI 紺×水色 サイエンスファンタジー化

## 目的

GitHub Pages 公開サイトのスタイルシートを「紺色と水色基調の近代サイエンスファンタジー」へ刷新し、
キャラクターシートUIを「よくあるキャラ紹介ページ」風の見やすい構成へ近づける。

## 合意事項（User 確認済み）

- 配色・質感: 紺×水色＋微弱な発光/星屑グリッドの方向で OK。
- 詳細UI: キャラ紹介ページ風ヒーロー帯構成を採用（JS 変更可）。
- 対象範囲: 共通デザインシステム（`pages/characters.*`）＋ API GUI（`api/stylesheet.*`）。
- ブランチ: `develop` に反映 → 完了後 `addon-ai-tag`（サブブランチ）へマージ（develop→addon の一方向）。

## 実行環境メモ（重要）

- Linux サンドボックス VM 上で `sass`（dart-sass, /tmp にローカル導入）は利用可。
- `npm test`（Vitest）は当環境では起動不可（`rolldown` の Linux ネイティブバイナリ不在 / node_modules が Windows 向け）。→ 本体テストは User のローカル（Windows）で実行。
- 編集ツールが**大容量ファイルの書込で末尾切断**を起こす事象が発生（`pages/characters.js` 8200行台、`pages/characters.css` 2000行台、`CHANGELOG.md` 800行台）。対策として、JS/CHANGELOG は HEAD 復元＋スクリプト挿入、`.css` は正なる `.sass` から `sass` 直生成で復旧。以後、大容量ファイルは編集ツールを使わず確定書込を採用。

## 変更点の要約

### Stage1: テーマCSS（characters / api）

- `pages/characters.sass` / `pages/characters.css`
  - `:root` パレット刷新（紺×水色）。新トークン: `--bg-deep` / `--panel` / `--accent-bright` / `--azure` / `--glow` / `--border-strong`。既存変数名は維持し `var(--*)` 参照を一括追従。
  - `body` 紺グラデ背景、`body::before` 微細グリッド＋星屑、`.site-header` 紺ガラス＋上端発光ライン、`.site-header h1` / `.name` 白→水色グラデ文字、`.card` ガラス質＋発光バー、`.poster` 額装、`.pill` / `th` / `.tag` 可読性向上。
- `api/stylesheet.sass` / `api/stylesheet.css`: 同テーマへ統一。
- `pages/characters.html`: `<meta name="asset-version">` → `2026.06.27.1`。

### Stage2: キャラ紹介ヒーロー帯（JS）

- `pages/characters.js` `renderDetail()` + CSS: 詳細を「枠付き発光バナー」構成へ再構成。`.detail` 縦積み化、上部 `.detail-hero`（`.detail-hero__portrait` ＋ `.detail-hero__main`: 名前/英名/チップ/クイックステータス）、下部 `.detail-body`（ギャラリー＋各セクション）。クイックステータス `.detail-quickstats` / `.detail-stat` を追加。
  - 既存の基本情報テーブル・各セクション・`img.poster`・`.name-en` は不変（全 UI 回帰テストのセレクタを保持）。
  - スキーマ駆動: クイックステータスは `$DetailLayout.quickStats` 明示時のみ表示し、その項目は基本情報テーブルから除外（**1 項目 1 箇所**）。既定では非表示。
  - 値解決は基本情報テーブルと同じ `resolveBasicField` を再利用（辞書/和英/`$alt`/`hideText` を踏襲）。
- 対応 CSS（`.detail-hero*` / `.detail-quickstats` / `.detail-stat`）を追加。クラッタ低減のため背景テクスチャ `opacity 0.28`、ヒーロー発光控えめ、`.detail-header h2` をパンくず化。
- 情報量バランス/可読性: 詳細ギャラリーを多列小型化（`minmax(180px,1fr)`）、ヒーローポートレート縮小、本文系フォント拡大（14〜15px）、テーブル行間拡張。

## 検証

- `node --check pages/characters.js`: OK。
- `sass` で `pages/characters.sass` / `api/stylesheet.sass` ともコンパイル成功 → `.css` を再生成（波カッコ均衡・末尾健全を確認）。
- jsdom で `renderDetail('#Works_PastDivers', yayoi)` を直接実行（`.cache/verify_ui.mjs`）: 13/13 合格（ヒーロー構造＋クイックステータス既定オフ＝重複解消を確認）。
  - クイックステータス4タイル生成（先頭「正式名称: 桜花 訫 / Trustia Cherrybroom」）、`.kv-table` 9行・`.name-en`・poster・基本情報値（所属/正式名称）すべて維持。

## 残作業 / 反映

- User ローカルで `npm test`（Vitest）グリーン確認済み（本セッションで報告）。
- `.css` は dart-sass 生成のため、Live Sass Compiler 特有のベンダープレフィックス（例: Firefox `::-moz-placeholder`）が一部欠落。機能影響は軽微。User が VS Code で `.sass` を保存し直せば正規の整形・プレフィックス付きで再生成される。
- git: `develop` へコミット → `addon-ai-tag` へマージ（develop→addon の一方向、ルール準拠）。
- 検証用一時ファイルは `.cache/`（Git 管轄外）: `verify_ui.mjs` / `verify_theme_preview.html`。
