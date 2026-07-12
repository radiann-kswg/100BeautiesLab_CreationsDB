# NumberTales VRMアバター 3Dビューア導入

## 目的

`data/Works_NumberTales/VRMs/DB_Primary/corefolder/{4,16,20,25}/` に格納された VRM 3Dモデル（`vrm_corefolder<Num>.vrm` + 同名 `.png` サムネイル）を、キャラシート上で画像と同様に「DB側から参照できる」ようにする。User の要望に基づき、単なる参照（ダウンロードリンク等）ではなく、three.js + `@pixiv/three-vrm` によるブラウザ内3Dビューア（回転・拡大操作）まで実装する（簡易ダウンロードリンクは不要という明示指示）。

## 変更点の要約

1. **スキーマ**: `data/Works_NumberTales/DataBases/db_type.json` に `Images` と並ぶ新規トップレベル `VRMs`（`corefolder_VRMPath`: `#VRMFilePath[]`）を追加。`$display.sectionWrapper: "vrmViewerSection"` で専用レンダラーへ委譲。`data/db_meta.json` の `$DetailLayout.subFields` に `VRMs` を追加し、standalone section 描画ルートに乗せた。
2. **設計方針（`TailsUnit` パターンの踏襲）**: 既存の `Images`/`ImageProcessor`（PNG専用に決め打ち）パイプラインには一切手を入れず、`TailsUnit`（構造化データ + 専用 section-renderer + client側URL構築ヘルパー）と同じ設計に寄せた。これにより `lib/data-common.js`（enrich/SW共通処理）・Cloudflare Workers 側は無改修。
3. **UI**: `lib/section-renders/vrmViewer.js`（新規）が `vrmViewerSection` を登録。サムネイル即時表示 + 「3Dビューアを起動」ボタン + 3Dステージのカードを描画し、ボタン押下時にのみ three.js 一式を動的 `import()` する（通常のページ閲覧・VRM非保持キャラでは一切ロードしない、このサイト初のconditional dynamic import）。
4. **メモリリーク対策**: `renderDetail`（`pages/characters.js`）が別キャラ描画で `#detail` を丸ごと差し替えると3Dビューアのcanvasはリスナー登録済みのまま検出不能になり得るため、`requestAnimationFrame` ループ内で毎フレーム `canvas.isConnected` を確認し、DOMから切断されたら自動でループ停止・`renderer.dispose()`/`controls.dispose()` を行う自己完結型のクリーンアップとした（`characters.js` 本体側の改修は不要）。
5. **URL構築**: `pages/characters.js` に `buildVrmAssetUrl(relPath, ext)`（`buildTailsUnitImageUrl` と同じ役割分担、`Images` ではなく `VRMs` 配下を組み立てる）を追加し、`renderStandaloneFieldSection` の helpers に配線。
6. **three.js / `@pixiv/three-vrm` の同梱（vendor）**: User確認済み方針（外部CDNではなくリポジトリ同梱）に基づき、`npm pack three@0.185.1 @pixiv/three-vrm@3.5.5` で取得した配布物のうち必要最小限のファイル（`three.module.min.js`+`three.core.min.js`、`examples/jsm` の `GLTFLoader.js`/`OrbitControls.js`/`BufferGeometryUtils.js`/`SkeletonUtils.js`、`three-vrm.module.min.js`）を `pages/vendor/` へ配置。ライセンス（両者MIT）・更新方法は `pages/vendor/THIRD_PARTY_NOTICES.md` に記載。`pages/characters.html` に import map（`three` / `three/addons/` / `@pixiv/three-vrm`）を追加。
7. **CSS**: `pages/characters.sass` の末尾に `.model-viewer` 系スタイルを追加。`characters.css` への反映は、環境にVS Code拡張の自動コンパイルが無いため `npx sass` で一度全体コンパイルした差分を確認したところ、**このリポジトリの通常のビルド経路（VS Code拡張）が行っているとみられる autoprefixer 処理（`-webkit-backdrop-filter`/`-o-object-fit`/`-moz-user-select` 等）を再現できず、無関係な既存ルールに regression 差分が出る**ことが判明したため、raw な全体再コンパイルは破棄。代わりに、コンパイル結果から新規追加分（`.model-viewer*`）のみを抽出し、既存 `characters.css` の末尾（`sourceMappingURL` コメントの直前）へ手動で追記する形にした（既存内容は完全に無改変、CRLF改行を維持）。

## 影響範囲（編集・新規ファイル）

- `data/Works_NumberTales/DataBases/db_type.json`（`VRMs` スキーマ追加）
- `data/db_meta.json`（グローバル、`$DetailLayout.subFields` に `VRMs` 追加）
- `data/Works_NumberTales/DataBases/db_Primary.json`（`Num: 4, 16, 20, 25` へ `VRMs.corefolder_VRMPath` 追加）
- `lib/section-renders/vrmViewer.js`（新規）
- `pages/characters.js`（`buildVrmAssetUrl` 追加、helpers配線、import追加）
- `pages/characters.html`（import map追加、`asset-version` 更新）
- `pages/characters.sass` / `pages/characters.css`（`.model-viewer` 系スタイル）
- `pages/vendor/three/**`, `pages/vendor/three-vrm/**`, `pages/vendor/THIRD_PARTY_NOTICES.md`（新規）
- `tests/data.shape.test.js`（`VRMs.corefolder_VRMPath` の値規約・参照ファイル実在チェック追加）
- `tests/section-renders.vrmViewer.test.js`（新規、`vrmViewerSection` の登録・match・空値時null・カードDOM構築の検証）
- `CHANGELOG.md` / `docs/wrapper-summary-registry.md` / `docs/schema-meta-processing.md` / `CLAUDE.md` / `.github/copilot-instructions.md`

## 検証

- `npm test`: 全27ファイル・254件成功（新規/更新テスト含む）。
  - `tests/data.shape.test.js`: `VRMs.corefolder_VRMPath` の値が `corefolder_PNGPath` と同じ「フォルダ/拡張子なしファイル名」規約であること、参照先の `.vrm`/`.png` が実在することを確認。
  - `tests/section-renders.vrmViewer.test.js`: `vrmViewerSection` の登録・`$display.sectionWrapper` 解決・空配列時に `null` を返すこと・サムネイル/起動ボタンを含むカードDOMの構築（three.js を import せずに検証可能なことで「クリックまで遅延ロード」設計を裏付け）。
- **ブラウザ実機確認（Playwright + ローカル `python -m http.server`、`pages/characters.html`）**: 実施済み。
  - Num16（VRMあり）: 折りたたみ`<details>`内にサムネイル表示、起動前は `pages/vendor/**` へのリクエストが0件（遅延ロード確認）。「3Dビューアを起動」クリック後にthree.js一式（7ファイル）を取得し、canvas生成・VRM読み込み成功（エラー表示なし、コンソールエラー0件）。スクリーンショットでキャラの顔が正しくレンダリングされていることを確認。
  - マウスドラッグで `OrbitControls` によるカメラ回転を確認（正面 → 後頭部側のスクリーンショットで検証）。
  - Num16 → Num20（別のVRM保持キャラ）へ遷移後もコンソールエラー0件（`canvas.isConnected` チェックによるレンダリングループ自動停止・破棄が機能）。
  - Num1（VRM非保持キャラ）では `.model-viewer` セクションが一切表示されない。
  - **発見・修正したバグ**: 初回実装では `buildVrmAssetUrl` がカテゴリフォルダ名（`corefolder`）を組み込んでおらず、`.vrm`/`.png` 取得が404になっていた（`corefolder_PNGPath` 同様、フォルダ名はフィールド名接頭辞由来のため）。`pages/characters.js` の `buildVrmAssetUrl(relPath, ext, folderHint)` に folderHint 引数を追加し、`lib/section-renders/vrmViewer.js` が `VRMs` オブジェクトの `<category>_VRMPath` キーからカテゴリ名を導出して渡すよう修正（将来 `humanoid_VRMPath` 等を追加する場合も同じ仕組みで動く）。修正後に上記確認をすべて再実施しグリーン。

## 未完了タスク

- `humanoid_VRMPath`（`VRMs/DB_Primary/humanoid/` は現状空フォルダ）は、実データが投入された時点で `corefolder_VRMPath` と同じパターンで追加する。
