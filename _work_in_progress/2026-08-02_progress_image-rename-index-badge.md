# 2026-08-02 進捗: 画像ファイル名をインデックスバッジ（作品コード付き）へ一括改名

> **ステータス: 完了（`npm test` / `data:order:check` 通過）**
> 作業ローカル: **sub1**（`README.LOCAL.md` の分担で「DB の更新作業」担当）／ブランチ: `develop`
> 関連: [`2026-08-02_progress_relations-graph.md`](./2026-08-02_progress_relations-graph.md) Phase 2-a（`$badge` 宣言の新設）

---

## 目的

相関図ページ（Phase 2-a / 2-c）で **インデックスバッジ**が宣言駆動で実装された
（`lib/graph/graph-badge.js` ＋ 各作品 `db_type.json` の `$IndexDef.$badge` ＋ `data/db_meta.json` の `Works_Code`）。

一方、画像ファイル名の識別子は作品ごとに体系がバラバラで、バッジと二重管理になっていた。

| 作品 | 旧ファイル名 | 旧識別子の導出元 |
| --- | --- | --- |
| NumberTales | `cnsp_img57` | `Num` そのまま |
| FLInvestigator78 | `crddsn_imgFLM16` | `FL` + `M`(Major) + `SuitNum` |
| ShouArRiders | `cnsp_imgEZ13` | `EZ` + `dict_Beast.json` の `Num` |
| PastDivers | `cnsp_imgCL3G3` | `CL` + 辞書 Num + `G` + `Generation` |
| SinisterChangingGirls | `cnsp_imgDrcNE` | `Drc` + 方位 |
| DestinyFoxRecords | `design_imgSITh` | `SI` + 次元記号（`Unit` 値とは別体系） |

**ファイル名の識別子部分を、実装済みバッジの `full` 表記（`Works_Code` + `-` + バッジ本体）へ揃える。**

## User との合意事項

1. **バッジ表記は作品コード付き（`full`）** — `NTS-57` / `FLI-M0` / `SAR-EZ1` / `DFR-SIL`
2. **対象は識別子を含む命名すべて** — `img` だけでなく `corefolder` / `numberMark` / `tailsUnit` ほか
3. **ファイル名に使えなかったバッジは User が typedef で解決** — 下記
4. 変更量が 500 行を大きく超えることは着手前に共有済み（User 承認）

### 作業中に User が入れた宣言

| 作品 | 対応 | 経緯 |
| --- | --- | --- |
| DestinyFoxRecords | レコードへ **`Unit_Badge`** を新設し `$badge: { keys: ["Unit_Badge"] }` | `Unit` の生値に `-(normal)` / `-(tangent)` / `-(quaternion)` があり、そのままではファイル名に使えなかった |
| 〃 | ケルビンの `Unit_Badge` を `SIH` → **`SITH`** へ | 作業途中に User 指定 |
| ShouArRiders | `dict_Beast.json` へ **`Beast_Badge`** 列（`EZ1`〜`EZ13`）を追加し、`$badge` を `{ key: "Beast", codeFrom: "Beast_Badge" }` の**辞書参照**へ | レコードへ手書きせず辞書で解決したい、との User 指定 |

---

## 変更点の要約

| 項目 | 件数 |
| --- | ---: |
| 画像ファイルの `git mv` | **640**（+ SAR の再改名 12 = 延べ 652 回） |
| JSON の画像参照の張り替え | **733 箇所 / 12 ファイル** |
| 追従したテスト | **4 ファイル / 13 件** |
| 対象外（識別子を含まないイベント年月ベースの命名） | 37 |
| 孤児（JSON から参照が無い画像）のうち改名 | 4 |
| 孤児のうち見送り | 10 |
| 解消した既存のリンク切れ | 2 |

### 作品別の改名件数

| 作品 | 件数 |
| --- | ---: |
| NumberTales | 574 |
| DestinyFoxRecords | 28 |
| FLInvestigator78 | 12 |
| ShouArRiders | 12 |
| SinisterChangingGirls | 10 |
| PastDivers | 2 |
| UnibyteLive | 2 |

### 命名の種別ごとの件数

`img` 296 / `corefolder` 186 / `numberMark` 94 / `catalog` 11 / `tailsUnit` 11 /
`costumeItem` 6 / `halo` 6 / `weakening` 5 / `emblem` 5 / `tag` 3 / `wing` 2 / `keycapper` 2 /
`motif` 1 / `snsicn` 1 / `fullpower` 1 / `pm` 1 / `wip` 1 / `chrst` 1 /
`sphericateDay…-img{n}`（イベント名の中に識別子を持つもの）3

---

## 実装方針（どう識別子を切り出したか）

ファイル名を `{prefix}_{kind}{旧識別子}{残り}` と見て、**旧識別子だけ**を `full` へ差し替えた。
`{残り}`（`-humanoid` / `-1` / `-newyear2023` 等）は触っていない。

旧識別子は**推測せず、参照元レコードから導ける候補の最長前方一致**で検出した。候補は
`full` / バッジ本体 / インデックスの生値とハイフン除去形 / `Num_Badge` / `Unit_Badge` /
`Num` の基底部分に加え、作品ごとの旧体系（`FL`+バッジ、`EZ`+干支番号、`CL`+バッジ、`Drc`+バッジ、
DFR の旧 SI 記号）を明示した。**未検出は 0 件**。

### 決めた細則

- **共有ファイル（複数レコードが参照）** — 既存の連名表記（`art_img34,43-parody`）に倣い、
  カンマ区切りで全バッジを並べる（`art_imgNTS-34,NTS-43-parody`）。15 件。
- **`_DBCrossLinkPath` 経由の参照は帰属先から除外** — 借用であって所有ではないため。
  これにより DFR の `dsgn_imgRN2`（Primary ラジアン ⇔ Proxy 2 代目）が Proxy 側の `DFR-G2` に落ち着いた。
- **末尾の単一大文字（`A` / `-B`）** — 「同番号の別レコードを区別する記号」として使われている場合は、
  区別をバッジが担うので落とす。落とすと衝突する場合は残す。
  - 落とした例: `cnsp_img67-A`（`Num:"67-old"`）→ `cnsp_imgNTS-67B`、`cnsp_img67-B`（`Num:67`）→ `cnsp_imgNTS-67A`
    （**旧ファイル名の A/B とバッジの A/B が逆転していた**のが、バッジ側を正として解消された）
  - 残した例: `cnsp_img14-A` / `-B`（同一レコードの別カット）→ `cnsp_imgNTS-14-A` / `-B`
- **対象外** — `sphericateDay202305` / `birthday2025` / `autumnMoon2024` / `destinyFoxRec-2021` /
  `numbertalesAniv2nd` / `mothersDay2023` / `pr_officialCard_202504` などイベント年月ベースの命名。
  ただし `art_sphericateDay202309-img9` のように**中に識別子を持つもの**は差し替えた
  （→ `art_sphericateDay202309-imgNTS-9`）。

### 解消した既存のリンク切れ

いずれも改名前から存在していたもの。

| レコード | JSON の値 | 実ファイル | 対応 |
| --- | --- | --- | --- |
| DFR セコンド | `design_imgSITec` | `design_imgSIT.png`（参照なしで放置） | 実体を `design_imgDFR-SIT.png` へ改名し、JSON をそこへ向けた |
| DFR メトレ | `cnsp_imgSIL` | `cnsp_imgPhysU-m.png`（参照なしで放置） | **User が実体を `cnsp_imgDFR-SIL.png` へ改名し JSON も更新**（本作業と並行） |

→ 作業後、`data/**` の画像参照は**リンク切れ 0 件**。

---

## 影響範囲（編集したファイル）

### 画像（`git mv` のみ・内容は無改変）

`data/Works_{NumberTales,DestinyFoxRecords,FLInvestigator78,ShouArRiders,SinisterChangingGirls,PastDivers,UnibyteLive}/Images/**`

### JSON（画像参照の値のみ・キー順と整形は不変）

- `Works_DestinyFoxRecords/DataBases/db_Primary.json` / `db_Proxy.json`
- `Works_FLInvestigator78/DataBases/db_Primary.json` / `db_PrimaryDealer.json`
- `Works_NumberTales/DataBases/db_Primary.json` / `db_Secondary.json` / `db_SelfSecondary.json` / `db_SemiPrimary.json`
- `Works_PastDivers/DataBases/db_Primary.json`
- `Works_ShouArRiders/DataBases/db_Primary.json`
- `Works_SinisterChangingGirls/DataBases/db_Primary.json`
- `Works_UnibyteLive/DataBases/db_Primary.json`

> `Images` フィールドだけでなく **`AppearanceDetail[].img_PNGName`** と
> **`TailsUnit[].TailsUnit_PNGName`** にも画像参照がある。両方を更新した。

### スキーマ / 辞書

- `Works_ShouArRiders/DataBases/db_type.json` — `$IndexDef.$badge` を辞書参照へ
  （`{ "keys": [{ "key": "Beast", "codeFrom": "Beast_Badge" }] }`）
- `Works_ShouArRiders/Dictionaries/dict_Beast.json` — `Beast_Badge` 列（User 追加）

### コード / テスト

- `lib/graph/graph-badge.js` — ヘッダ JSDoc を実態へ更新（旧ファイル名の表を「改名前の姿」と明記し、
  **バッジからファイル名を組み立てる実装は入れない**旨の理由を追記）
- `tests/data.shape.test.js` — `attr_tailsUnit{N}` → `attr_tailsUnitNTS-{N}`（11 件）
- `tests/extract-palette.test.js` — 実 PNG のパスとフィクスチャ
- `tests/patch-colorpalette.test.js` — 実 PNG のパスとフィクスチャ
- `tests/pages.characters.ui-output.test.js` — TailsUnit 参照画像の src

---

## 検証

| 項目 | 結果 |
| --- | --- |
| `npm test` | **904 / 906 成功**（残る 2 件は下記の既存の赤） |
| `npm run data:order:check` | ✅ **0/1310 レコード整列**（差分なし） |
| 画像参照のリンク切れ | ✅ **0 件**（作業前は 2 件） |
| 改名先の重複・既存ファイルとの衝突 | ✅ **0 件** |
| 識別子の未検出 | ✅ **0 件** |
| `git mv` の失敗 | ✅ **0 件**（640 + 12） |

### 残る赤 2 件は本作業と無関係（既存）

```
FAIL tests/graph.badge.test.js > 実データ不変条件 > UnibyteLive/temp のバッジが一意かつ非空
FAIL tests/graph.model.test.js > 実データ不変条件 > Works_UnibyteLive/temp のノードキーが一意
```

原因は `data/Works_UnibyteLive/DataBases/db_temp.json`（**`.gitignore` の `*_temp.json` 対象**で
Git 管理外のローカル作業ファイル）。2 レコードとも `{Alphabet:"A", AlphaGen:1}` でバッジが `Ag1` に重複する。

**本作業由来でないことを実測で確認済み**: `db_temp.json` を一時退避して `npm test` を実行すると
**53 ファイル / 904 件が全件成功**。退避後は元に戻し、バックアップとの一致を確認した。
テストは `db_*.json` を glob で拾うため、作業用の一時 DB も検査対象に入る。

---

## 未完了タスク / 申し送り

- **孤児 10 件は据え置き**（JSON から参照が無く、レコードとの紐付けが取れないため帰属を推測しなかった）。
  User の判断が要るもの:

  | ファイル | 見送りの理由 |
  | --- | --- |
  | `attr_numberMark223-lot` | `Num:223`（`223`）と `Num:"223-jw"`（`223JW`）のどちらか一意に定まらない |
  | `cnsp_imgPhysU-m` → **User が対応済み** | （`cnsp_imgDFR-SIL.png` へ改名済み） |
  | `design_imgPh9` / `ArchFaith` / `pr_officialCard_202504` / `pr_officialCard_202510` | 識別子を含まない（作品全体の資料画像） |
  | `art[EN]_sphericateDay202202` | 識別子を含まない |
  | `chr-dsgn_NTsCatalog-Summary` / `cnsp-fg_NTsClass` / `cnsp-fg_NTsCoreFolder` / `cnsp-fg_NTsHumanoid` | 同上 |

- **ShouArRiders の `db_type.json` に残る `Beast_Badge` の子要素宣言**（`$IndexDef.$type` 内）は、
  辞書参照へ切り替えたため**レコード側では使われない**。宣言を残すか外すかは User 判断。
  残しても `$display.auto: false` なのでキャラシート表示・キー順ともに影響しない。
- **`cnsp_imgSIL` 以外の画像未作成**は無し（リンク切れ 0 件）。
- **新規画像を足すときの命名**: `{prefix}_{kind}{Works_Code}-{バッジ本体}{接尾辞}`。
  バッジからファイル名を自動生成する実装は入れていない（接尾辞・連名が復元できないため）。
  DB へ実名を手書きする従来の運用は変わらない。
- 本作業中、User が並行して 3 コミット（`c80bc85` / `0e9a723` / `5b7e931`）を作成。
  いずれも DFR の `Unit_Badge` 関連で、本作業の変更ファイルとは重複していない。

---

## 参考リンク

- [`2026-08-02_progress_relations-graph.md`](./2026-08-02_progress_relations-graph.md) — 相関図ページ（バッジの実装元）
- [`lib/graph/graph-badge.js`](../lib/graph/graph-badge.js) — `$badge` 宣言の解釈
- [`docs/schema-meta-processing.md`](../docs/schema-meta-processing.md) — `$IndexDef` / `#PNGFileName` / `$subfolder`
- [`docs/api-sw-spec.md`](../docs/api-sw-spec.md) — `$Def_DBCrossLinkPath`（画像パスのDB横断参照）
- [`AGENTS.md`](../AGENTS.md) — 正典（SSOT）
