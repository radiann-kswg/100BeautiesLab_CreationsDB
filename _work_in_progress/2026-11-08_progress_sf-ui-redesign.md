# 2026-11-08 キャラシート UI を現代〜近未来 SF 風へ（閲覧者向けの視線誘導・motion 統一）

> 作業環境: Copilot worktree（ブランチ `radiann-kswg-sf-character-ui-redesign`、`develop` 起点）。
> `/grilling` ラウンド 1・2 で要件を詰めて合意済み。`/emil-design-eng` の原則と `/ponytail-review` の自己レビューを適用。
> 開発サーバ `http://127.0.0.1:5500/` で確認を実施し、`/pages/characters.html` の 200 応答と `asset-version: 2026.11.08.1` を確認済み。

## 目的

GitHub Pages のキャラシート（`pages/characters.html`）を、一次創作のキャラ紹介ページとして
「閲覧者がキャラの詳細を迷わず追える、現代〜近未来 SF 風」の見た目へ寄せる。
既存の navy × aqua 配色と schema 駆動の詳細スケルトンは維持し、**モーションの統一・視線誘導・開発者向け UI の退避** に絞る。
中流 `JsonCharacterDB-Framework` → 下流 `RadianNs_SecondaryWorksDB` へ `pages/` 単位で流れることを前提に、
作品名のハードコードを入れず、新設クラスは最小限にする。

## 合意事項（`/grilling` ラウンド 1・2・2026-11-08）

| # | 決定 |
| --- | --- |
| Q1 | スコープは `characters.html` 一式。`relations` / `index.html` はトークン整合の確認のみ |
| Q2 | テーマは `:root` の単一グローバル。将来 `data-work` 属性で上書きできる形にしておく |
| Q3 | 配色は現行の navy × aqua を進化させる（置き換えない） |
| Q4 | フォントはシステムスタック維持。SF らしさは `tabular-nums` / 字間 / ウェイトで出す |
| Q5 | モーションは抑制的に。`:active` 縮小 ~160ms、カード fade + 8px、全て 300ms 未満、transform / opacity のみ。`prefers-reduced-motion` では opacity のみ |
| Q6 | 詳細スケルトンは維持（schema 駆動のまま）。CSS + 最小限のクラス追加で表現する |
| Q7 | 冒頭の紹介文スロットは **User が手書き**。既定は空（空なら非表示）。エージェントは本文を書かない |
| Q8 | 参照解決 / デバッグ / SW リセット / 機能要望は閉じた `<details class="controls__advanced">`「詳細設定」へ退避 |
| Q9 | **sass toolchain は追加しない**。User の VS Code Live Sass Compiler で `.css` / `.css.map` を生成。`npx sass` も手編集もしない |
| Q10 | リファクタ・注釈は今回触る範囲のみ |
| Q11 | 変更量 500 行超は許容 |
| Q12 | CSS の反映手順: User の VS Code Live Sass Compiler で `.css/.css.map` を生成（実作業では本ブランチ作業中に再生成済み） |
| Q13 | ヒーローはレイアウト不変。CSS だけの「ドシエ」枠 + コーナーマーク。`$display` キーは増やさない |
| Q14 | 一覧カード: Index バッジを角に。hover の浮きは `@media (hover: hover)` でゲート。スタガーは初回描画のみ |
| Q15 | モバイルの詳細で「一覧へ戻る」行を sticky に |
| Q16 | セクション見出しに CSS カウンタ（`::before`）で `01` `02` … を付ける |
| Q17 | 新設 BEM クラスは `.site-header__intro` / `.controls__advanced` / `.grid-item__badge` / `.detail-hero__frame` / `.detail__placeholder` の 5 つに限定（`.section__label` は見送り、構造セレクタで代替） |
| Q18 | 既存のインラインスタイル等の整理は触った範囲のみ |

## 変更点の要約

### `pages/characters.sass`

- `:root` に motion / frame トークンを追加: `--ease-out` / `--ease-in-out` / `--dur-fast`(160ms) / `--dur-base`(240ms) / `--frame-line` / `--frame-glow`。
- `transition: all` を全廃し、`.btn` / `.chip` / `.ghost` / `.grid-item` / `.image-item` / `.model-viewer__launch-btn` / form 入力で色・影・transform の個別指定へ。
- `.grid-item`: `position: relative`、hover の浮き上がりを `@media (hover: hover)` でゲート、`:active { transform: scale(0.99) }`、右上に `.grid-item__badge`。
- `@keyframes fadeIn` を 20px → 8px へ。`.fade-in` は `--i` による最大 12 件・40ms 刻みのスタガー。
- `prefers-reduced-motion` ブロックを書き直し、transform / delay を止めて opacity のみ残す。
- 詳細: `.detail-body { counter-reset: section }`、`.detail-body .section > h3` と `.section__summary > .section__title` に `counter-increment` + `::before`（`decimal-leading-zero`）。構造セレクタだけなので `lib/section-renders/*` が出す `.section > h3` も無変更で番号が付く。
- 新設: `.detail-hero__frame`（コーナーマーク付き枠）、`.detail__placeholder`、`.controls__advanced`（閉じた `<details>` の見た目）、`.site-header__intro:empty { display: none }`。
- モバイルで `.detail-header` を sticky に。`.pill` / `.detail-stat__value` に `font-variant-numeric: tabular-nums`。

### `pages/characters.html`

- `<meta name="asset-version">` → `2026.11.08.1`。
- `#page-lead` に `site-header__intro` を付けて **空** にする（User が紹介文を手入力する前提）。
- `.control-row.small` を「相関図リンク + 言語トグル」の常時表示行と、`<details class="controls__advanced"><summary id="label-advanced">詳細設定</summary>` 配下へ分割。既存 ID はすべて維持。

### `pages/characters.js`

- 一覧カード: `.grid-item__badge`（主 Index の表示値）を先頭子要素として追加。初回描画のみ `fade-in` + `style="--i: N"` を付与し、再描画では付けない（モジュール変数 `listPaintedOnce`）。
- 詳細の未選択 / 未取得プレースホルダ → `el('div', { class: 'detail__placeholder' }, …)`。ヒーロー → `class: 'detail-hero detail-hero__frame'`。
- 文言辞書: `copy.lead` を削除し `copy.advanced`（JP「詳細設定」/ EN「Advanced settings」）を追加。`setText('#label-advanced', copy.advanced)`。

## 影響範囲（編集したファイル）

- `pages/characters.sass`
- `pages/characters.css`
- `pages/characters.css.map`
- `pages/characters.html`
- `pages/characters.js`
- `CHANGELOG.md`
- `_work_in_progress/2026-11-08_progress_sf-ui-redesign.md`（本ファイル）

`lib/` / `data/` / `tests/` / SW / API のレスポンス形状は不変。`pages/relations.*` と `index.html` は未変更（`relations.js` が使う `.btn.btn-primary` は維持）。

## 検証

| 観点 | 結果 |
| --- | --- |
| `npm test`（Vitest） | **通過**（79 files / 1430 tests、2026-11-08、ログは `.cache/test_output.txt`） |
| `pages/characters.css` / `.css.map` の再生成 | **通過**（User の VS Code Live Sass Compiler で再生成済み。手編集なし） |
| 開発サーバ疎通 | **通過**（`http://127.0.0.1:5500/pages/characters.html` が 200、`asset-version: 2026.11.08.1`） |
| ロード性能（2 回目以降 1000ms 未満） | `?c=NumberTales/Primary` / `?r=NTS` のコンソール値を継続確認（最終受け入れ時に再計測） |
| `prefers-reduced-motion` | reduced-motion ブロック反映を CSS で確認済み。最終受け入れ時に DevTools エミュレーションで再確認 |

## 未完了タスク

- [ ] User: `http://127.0.0.1:5500/pages/characters.html?c=NumberTales/Primary` で目視・性能（2 回目以降 1000ms 未満）・reduced-motion を確認（CSS は本 PR に同梱済み）
- [x] 下流（`JsonCharacterDB-Framework`）へ `pages/characters.{sass,css,css.map,html,js}` を対で取り込み（取り込み先で再コンパイルしても可）（2026-11-08: 生成物 CSS を `4f48192` で追従させたうえで中流 `77f9cf0` → 下流 `RadianNs_SecondaryWorksDB` `9bd961a` まで merge 済み。push は別途）
- [ ] 紹介文（`#page-lead`）の本文は User が任意のタイミングで記入
- [ ] （任意・別 PR）`@media (hover: hover) and (pointer: fine)` の 5 箇所重複を mixin 化、既存のインライン `style` の整理

## 参考リンク

- `CHANGELOG.md` の `feat: キャラシート UI を現代〜近未来 SF 風へ … (2026-11-08)`
- `docs/fork-sync.md`（下流への一方向同期のルール）
- `AGENTS.md`「GitHub Pages の軽量化・高速化（恒常対応）」（性能予算）
- `_work_in_progress/2026-11-02_progress_pages-load-time.md`（計測手順の先例）
