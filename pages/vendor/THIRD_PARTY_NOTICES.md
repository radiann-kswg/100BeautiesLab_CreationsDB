# サードパーティ ライブラリ 同梱物（pages/vendor/）

`pages/characters.js` の VRM 3Dビューア機能（`lib/section-renders/vrmViewer.js`）が、
ボタン押下時に動的 `import()` するライブラリをここに同梱している。GitHub Pages 上の
ビルドレスな静的サイトという構成上、外部CDNに依存せずリポジトリへ直接ファイルを
コミットする方針とした（`_work_in_progress/2026-07-12_progress_vrm-viewer.md` 参照）。

## 同梱物・バージョン・取得元

| ライブラリ | バージョン | ライセンス | 配置 |
| --- | --- | --- | --- |
| [three.js](https://github.com/mrdoob/three.js/) | 0.185.1 | MIT | `three/build/three.module.min.js`, `three/build/three.core.min.js`, `three/addons/**` |
| [@pixiv/three-vrm](https://github.com/pixiv/three-vrm) | 3.5.5 | MIT | `three-vrm/three-vrm.module.min.js` |

`three/addons/**` は three.js 本体パッケージの `examples/jsm/` 配下から、`GLTFLoader.js` の
実行に必要な最小限のファイルのみ抽出したもの（`loaders/GLTFLoader.js` / `controls/OrbitControls.js` /
`utils/BufferGeometryUtils.js` / `utils/SkeletonUtils.js`）。

いずれも `npm pack <package>@<version>` で取得した公式配布物をそのまま配置しており、
改変は行っていない。各ディレクトリの `LICENSE` ファイルに原文を同梱する。

## 更新方法

1. `npm pack three@<新バージョン> @pixiv/three-vrm@<新バージョン>` で新しい配布物を取得する。
2. 上記の対応表と同じファイルを抽出し、`pages/vendor/three/` / `pages/vendor/three-vrm/` を丸ごと置き換える。
3. `pages/characters.html` の import map（`three` / `three/addons/`）のパスに変更がないか確認する。
4. 本ファイルのバージョン番号を更新する。
