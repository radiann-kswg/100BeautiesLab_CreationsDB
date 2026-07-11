# AppearanceDetail 参考画像の一括登録（NumberTales Primary）

## 目的

`data/Works_NumberTales/Images/DB_Primary/attr/` 配下へ追加された外見詳細画像（NumberMark ほか）を、`db_Primary.json` の `AppearanceDetail[].img_PNGName` へ登録し、キャラシートの外見詳細セクションで表示できるようにする。

## 変更点の要約

### 実装（前セッションから継続）

- `pages/characters.js`: `buildAppearanceDetailImageUrl` helper を追加。`DesignElement` の `#Element_*` から `attr/<lowerCamel>` を自動導出（判別不能時は従来互換 `img/`）。
- `lib/section-renders/appearanceDetail.js`: `img_PNGName` をライトボックス対応（`createGalleryImageItem`）で描画。
- `docs/wrapper-summary-registry.md`: 上記仕様を追記。

### データ登録（本セッション）

- `db_Primary.json` の `img_PNGName` を **153 件** 更新（値は拡張子なしの `#PNGFileName` 規約）。
- 番号のみのファイル（例: `attr_numberMark13`）は、そのレコードの `#Element_NumberMark` 全エントリ（corefolder/humanoid 等）へ共通登録。
- suffix 付きは Attrs 記述と照合して個別割当:
  - `28`: 胸=`28` / 左肩数式=`28-leftMath` / 右肩数式=`28-rightMath` / イヤリング=`28-earingFront`
  - `31`: 胸=`31` / 左肩数式=`31-leftMath`
  - `76`: 胸=`76` / ヘッドセット耳=`76-headset`
  - `97`: 胸(暗色)=`97-1` / トップハット(白)=`97-2`
  - `10`: corefolder(赤)=`10` / humanoid(暗色)=`10alt` ※色記述ベースの推定。**要User確認**
  - `costumeItem11-hairpin` / `costumeItem71-number` / `emblem22-brooch` / `emblem61-heartkey` / `emblem77-facemaking` / `motif88-piano`: 各対応エントリへ登録

### 保留（未登録）

- `attr_numberMark2alt.png` — 「バイナ(Binor)」表記のデザイン差分で、レコード2に対応エントリが無い
- `attr_numberMark28-earingBack.png` — `img_PNGName` が単一値のため Front 面のみ採用（複数枚対応は将来課題）
- `attr_halo99.png` — レコード99に `#Element_Halo` のエントリが未定義
- `attr/tag/` の2枚（`attr_img10alt-調整中.png` / `attr_img2alt-試用.png`）— 試用・調整中の扱いのため対象外

## 影響範囲

- `data/Works_NumberTales/DataBases/db_Primary.json`（img_PNGName 153件）
- 表示系は前回実装分（`pages/characters.js` / `lib/section-renders/appearanceDetail.js`）

## 検証

- 編集後 JSON parse 成功（スクリプト内検証 + 再読込確認: set=153 / null=788）
- `npm test`（`data.sanity` / `data.shape`）: 39 passed / 0 failed

## 未完了タスク

- [ ] `10` / `10alt` の corefolder/humanoid 割当の正誤確認（User確認待ち）
- [ ] 保留4枚の扱い（`2alt` 用エントリ追加、`earingBack` の複数画像対応、`halo99` 用エントリ追加、`tag/` の正式化）
- [ ] 必要なら Cloudflare R2/D1 同期（`scripts/migrate.mjs`）と `pages/characters.html` の asset-version 更新判断

## 参考

- 作業スクリプト（Git管轄外）: `.cache/analyze-appearance-images.mjs` / `.cache/apply-appearance-images.mjs` / 適用ログ `.cache/appearance-images-applied.txt`
