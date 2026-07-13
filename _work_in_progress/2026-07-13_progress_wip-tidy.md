# 進捗ログの棚卸し + `addon-ai-tag` への機能マージ（2026-07-13）

## 目的

`develop` の変更が積み上がり `_work_in_progress/` 直下が 34 件まで膨らんだため、

1. 進捗ログの棚卸し（完了ログの `.completed/` 退避・索引の再構成）
2. `develop` → `addon-ai-tag` への一方向マージ（未マージ 7 コミット）

を実施する。

## 方針（User 合意）

- 退避判断は**書面上の「未完了」記載を鵜呑みにせず、実際に確認して裏取りする**。
  「確認待ち」のまま放置されていた項目は、この機会にまとめて確認して消化する。
- 退避範囲: 明確に完了した 13 件 + ブラウザ目視で消化した 4 件。
- マージは本体ローカル（`develop` は clean かつ `origin` と同期済みのため安全）で実施する。

## 実施内容

### 1. 裏取り（棚卸しの根拠づくり）

#### 1-1. 本番実 API での確認（`database.numbertales-radiann.net`）

| 確認項目 | ログ上の記載 | 実際の本番 | 結論 |
| -------- | ------------ | ---------- | ---- |
| `GET /api/v1/meta` | 「R2 未同期・503」 | ✓ グローバルメタが返る | 復旧済み |
| `GET /api/v1/NumberTales/Secondary/records` | 「38 件（`0xFF` 漏洩）」 | ✓ 37 件（`0xFF` 除外） | 是正済み |
| `GET /api/v1/NumberTales/Secondary/search?q=0xFF` | 「D1 の `is_private` は未是正」 | ✓ `[]` | **D1・FTS とも是正済み** |
| FTS 健全性（退行の有無） | — | ✓ `?q=ハジメ` / `?q=Nekomata`（8件）とも正常 | 退行なし |
| `GET /api/v1/works` | 「Workers 疎通確認は未実施」 | ✓ `#Works_CommonReferences` を含む | **疎通確認完了** |
| `GET /api/v1/CommonReferences/dbs` | 同上 | ✓ 5DB が `layer: "References"` 付きで返る | レイヤー畳み込みも機能 |

#### 1-2. ブラウザ目視確認（Playwright + `python -m http.server`）

`pages/characters.html`（NumberTales Primary）で Num:22 / 4 / 11 / 9 を確認。全ケースで**コンソールエラー 0 件・4xx 0 件**。

- **`_DBCrossLinkPath`（Num:22）**: ギャラリーは初期 6 枚制限のため「さらに N 枚の画像を表示」ボタン押下後、
  `_DBCrossLinkPath` 経由の `/data/Works_NumberTales/Images/DB_SemiPrimary/arts/corefolders/autumnMoon/art_autumnMoon2025.png`
  が正しく解決・表示されることを確認（`naturalWidth > 0`）。
  あわせて `GET /pages/v1/works/Works_NumberTales/db/Primary?enrich=1&resolve=1` の応答で、
  `Images.arts_PNGPath[3]` の生値が `_DBCrossLinkPath` ラッパーのまま**無改変**であり、解決済み URL は
  `_enrichment.images` へ**追記のみ**されている（設計どおりの非破壊）ことを確認。
- **TailsUnit 参考画像（Num:4）**: 「尻尾ユニット」セクションに `attr/tailsUnit/attr_tailsUnit4.png` が表示。
  参考画像を持たない Num:9 / 11 では非表示。VRM サムネイルも同時に表示（`vrm_corefolder4.png`）。
- **`NumberMarkLocation` / `IdentityMotif` 廃止**: 全ケースで両フィールドの表示が消えていることを確認。
  `AppearanceDetail`（外見デザイン詳細）は正常に描画され、参考画像（`attr/numberMark/*`・`attr/costumeItem/*`・`attr/emblem/*`）も表示。
- **EarShapeType 独立軸化**: Num:9 =「耳: 狐の耳 (先がアクセントカラー)」、Num:11 =「耳: 猫の耳 (フードに隠れている)」。
  **尻尾が Nekomata でも耳は Cat** という独立軸化の意図どおりの表示を確認。

> 補足: 初回チェックで一部の画像が読み込み失敗に見えたが、原因は
> (a) 折りたたみ `<details>` 内の lazy 画像が未読込、(b) ギャラリーの初期 6 枚制限、の 2 点。
> `<details>` を開き「さらに表示」ボタンを押した状態で再測定して全て解消（実バグではない）。

#### 1-3. コミット状態の確認

- `git status` クリーン・`origin/develop` と同期済み（0/0）。
- `data/Works_Proxies/` が消えている・`tests/legacy-work-alias.test.js` 等が追跡下にある
  → **「コミットは未実施（User の指示待ち）」と書かれていた 3 ログは実際にはコミット済み**だった。
- `npm test`: **30 ファイル / 301 件 全成功**。`remove-nummark-identitymotif` に「既存不具合」として
  記録されていた `TailsUnit_PNGName` 拡張子欠落もグリーンに戻っており、解消済みと確認。

### 2. 退避（17 件 → `.completed/`）

各ログの「未完了タスク」欄へ上記の確認結果を追記したうえで退避。内訳は `README.md` の
「2026-07-13 棚卸しで追加退避（17件）」を参照。

**`_work_in_progress/` 直下: 34 件 → 17 件（+README）**

### 3. 索引・台帳の更新

- `README.md`: トピック別索引を残存 17 件に再構成。「系列の補足」に TailsUnit 系 / `*_DBLink`・画像横断参照系 /
  Cloudflare 実 API 系の完結を追記。「整理履歴」に本棚卸しを追記。
- `2026-07-08_remaining-task.md`（母艦）: 退避ログから残タスクを引き継ぎ。
  **P3（User の創作入力待ち）** と **P4（技術的な追従・既知の負債）** を新設。
- `2026-07-03_current-task-ledger.md`: 全面改訂（P1 ConversationPattern / P2 User レビュー待ち /
  P3 創作用語DB / P4 技術負債 / P5 AIHints）。

### 4. `develop` → `addon-ai-tag` マージ

（後述「マージ結果」節に記録）

## 影響範囲（編集ファイル）

- `_work_in_progress/README.md`
- `_work_in_progress/2026-07-08_remaining-task.md`
- `_work_in_progress/2026-07-03_current-task-ledger.md`
- `_work_in_progress/2026-07-13_progress_wip-tidy.md`（本ファイル・新規）
- 退避した 17 件（`.completed/` へ移動、Git 管轄外）
  - 移動前に確認結果を追記: `r2-sync-outage` / `global-references` / `dbcrosslinkpath` /
    `tailsunit-image-reference` / `remove-nummark-identitymotif` / `numbertales-earshapetype-restructure` /
    `works-merge-dfr-proxies`

## 検証

- `npm test`: 30 ファイル / 301 件 全成功（コード変更なし・ドキュメントのみのため退行リスクなし）
- 本番実 API・ブラウザ目視の結果は上記「1. 裏取り」のとおり
- 作業スクリプト（Git 管轄外）: `.cache/browser-check-20260713.mjs` / `.cache/ear-check.mjs` / `.cache/sw-enrich-check.mjs`

## 未完了タスク

- なし（棚卸し作業自体は完了）。引き継いだ残タスクは `2026-07-08_remaining-task.md` および
  `2026-07-03_current-task-ledger.md` を参照。

## 参考

- `_work_in_progress/README.md`（トピック別索引・退避一覧・整理履歴）
- `CLAUDE.md` / `AGENTS.md`（ブランチ運用方針: `develop` → `addon-ai-tag` の一方向マージのみ）
