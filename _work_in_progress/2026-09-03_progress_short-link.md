# 2026-09-03 進捗: キャラシートの短縮リンク（インデックスバッジ直リンク）

- 作成: 2026-09-03
- 状態: ✅ 実装完了（自動テスト成功 / 実機目視は未実施）
- 環境: `main`（本体ローカル）/ ブランチ `develop`

## 目的

キャラ詳細の直リンク（圧縮ロケータ `?c=NumberTales/Primary/Num:57`）は正確だが長い。
相関図で使っているインデックスバッジ（`NTS-57` / `FLI-M16`）を URL に使えるようにして、共有しやすくする。

## 合意事項（ルール）

- 文法: `characters.html?b=<Works_Code>-<バッジ>[/<DB>]`（例: `?b=NTS-57`, `?b=FLI-M16/PrimaryDealer`）。
- バッジの組み立ては相関図と同じ `lib/graph/graph-badge.js`（`Works_Code` + `$IndexDef.$badge` 宣言）。
  キャラシート側に独自の規則は持たない。
- `b` は読み取り時に `c` 形式（work / db / idx / idxKey）へ解決してから通常経路へ合流する。
  表示後の URL は従来どおり `c` 形式へ書き換わる（**正は引き続き `c`**）。
- DB 省略時は DB カタログ順に走査して最初に一致した DB を採る。
  生成側（「短縮リンクをコピー」ボタン）はカタログ先頭以外の DB のときだけ `/<DB>` を付ける。

## 実データ上の前提（着手前に確認）

全 9 作品・全 DB でバッジを組み立てて重複を確認した（`.cache` 相当の一時スクリプト、リポジトリには残していない）。

| 観点 | 結果 |
| --- | --- |
| 作品をまたいだ重複 | 0 件（`Works_Code` が作品間で一意） |
| 作品内・DB をまたいだ重複 | 44 件。すべて「同じキャラの派生 DB」（FLI `Primary` ↔ `PrimaryDealer` / `MinorsDealer`、UBL `Primary` ↔ `PrimaryPerformer`） |
| バッジが空 | 3 件（`db_temp.json` の空レコードのみ） |

派生 DB の重複は `/<DB>` 付与で区別する。同一 DB 内の一意性は既存の `tests/graph.badge.test.js` が担保している。

## 変更点

| ファイル | 内容 |
| --- | --- |
| `lib/viewer-locator.js` | `SHORT_LOCATOR_PARAM`（`b`）/ `parseShortLocator()` / `buildShortQueryString()` を追加。`globalThis.ViewerLocator` ミラーにも載せた |
| `pages/characters.js` | `main()` 冒頭で `b` を退避 → SW 初期化後に `resolveShortLocator()` で `c` 形式へ解決。`openDetail()` 後に `updateShortLinkButton()` で短縮リンクを組み立て、ヘッダのボタンへ載せる。クリックで clipboard へコピー（不可なら `prompt`） |
| `pages/characters.html` | 詳細ヘッダに `#btn-copy-short` を追加。`asset-version` を `2026.09.03.1` へ |
| `tests/lib.viewer-locator.test.js` | 短縮ロケータの分解・生成・往復テストを追加 |
| `AGENTS.md` / `CHANGELOG.md` | 直リンク文法の追記・変更履歴 |

## 検証

- `vitest run tests/lib.viewer-locator.test.js tests/pages.characters.url-params.test.js tests/graph.badge.test.js tests/pages.characters.ui-output.test.js` → 199 件成功
- `npm test` → 70 ファイル / 1279 件成功（2026-09-03）
- `npm run agents:build` → `.github/copilot-instructions.md` を再生成。`npm run agents:check` → 生成物は正典と一致
- 実機目視（ローカル HTTP サーバーで `?b=NTS-57` / `?b=FLI-M16/PrimaryDealer` を開く、ボタンでコピー）は **未実施**

## 未完了・補足

- 相関図（`pages/relations.html`）側のノードから短縮リンクを出す導線は未実装（必要になったら `buildShortQueryString()` を流用）。
- `b` の解決は DB を順に fetch するため、DB 数の多い作品（FLI）で省略形を開くと最大 5 DB 分の取得が走る。SW キャッシュが効くので現状は許容。
- Prettier 整形は行っていない（対象 4 ファイルは変更前から整形対象外の状態だったため、無関係な差分を避けた）。
