# DB整備(ナンバーテールズ) フェーズ2 — Images フィールド更新

**作成日**: 2026-06-19  
**対象ブランチ**: `develop` → `addon-ai-tag` にマージ予定  
**対象ファイル**: `data/Works_NumberTales/DataBases/db_Primary.json`

---

## 目的

コミット `bee0f60` で実施した画像ファイルの移動・リネームに合わせて、  
`db_Primary.json` の `Images` フィールドのパス値を更新する。  
併せてフェーズ2仕様書（`_work_in_progress/.private/20260619_multi-char-images-phase2.md`）の  
**案B・案C・案D** を実装する。

---

## 変更内容

### 1. `arts_PNGPath` パス更新（bee0f60 対応）

| 旧パス（arts/ 相対） | 新パス（arts/ 相対） |
|---|---|
| `art_mothersDay2023` | `humanoids/art_mothersDay2023` |
| `art_numbertalesAniv2nd` | `humanoids/art_numbertalesAniv2nd` |
| `art_numbertalesAniv4th` | `humanoids/art_numbertalesAniv4th` |
| `chattingArt/chart_img50-ballingRole` | `chattingArt/chart_img50-humanoidBallingRole` |
| `chattingArt/chart_img58-noNipples` | `chattingArt/chart_img58-humanoidNoNipples` |
| `chattingArt/chart_img73-whereIsEho` | `chattingArt/chart_img73-humanoidWhereIsEho` |
| `chattingArt/chart_img87-tooOrdered` | `chattingArt/chart_img87-humanoidTooOrdered` |

その他のパス（`humanoids/`, `corefolders/`, `chattingArt/chart_imgXX-humanoid*` 等）は変更なし。  
クロスDB参照 `../../DB_SemiPrimary/arts/corefolders/autumnMoon/art_autumnMoon2025` は変更なし。

### 2. `designAlt_PNGPath` パス更新（bee0f60 対応）

| 旧パス（designAlt/ 相対） | 新パス（designAlt/ 相対） |
|---|---|
| `chattingArt/chart_img35-swimwear` | `chattingAlt/chart_img35-humanoidswimwear` |
| `eventArt/art_halloween2023A` | `eventArt/art_sphericateDay-halloween2023A` |
| `eventArt/art_halloween2023B` | `eventArt/art_sphericateDay-halloween2023B` |
| `subcostumes/chr-dsgn-alt_wip61-idol` | `catalog/chr-dsgn-alt_wip61-idol` |
| `art/art_img68-humanoidOnWorkSuit` | `arts/art_img68-humanoidOnWorkSuit` |

`chattingArt/chart_img66-corefolderHalloween` は変更なし。

### 3. char #93 に `humanoids/cnsp_chrst93` を追加

`arts_PNGPath` に新規エントリ追加（クリスマスヒューマノイドアート）。

### 4. 案B: `AIHints.concept_contains_forms` 追加

- `concept_PNGName` ありの全レコードに追加
- コアフォルダ画像ディレクトリ（`corefolder/{Num}/`）が存在するキャラ: `["corefolder", "humanoid"]`
- 零(Num:"0") / 百(Num:"00")（形態差分なし）: `["humanoid"]`
- 百零(Num:"000")（コアフォルダあり）: `["corefolder", "humanoid"]`

### 5. 案C: `Images.arts_metadata` 追加

各 `arts_PNGPath` エントリに対応するメタデータオブジェクトを追加。  
フィールド: `{ "path": str, "characters": [Num...], "form": "corefolder"|"humanoid"|null }`

form 推定ルール:
- `humanoids/**` → `"humanoid"`
- `corefolders/**` → `"corefolder"`
- `chattingArt/chart_imgXX-humanoid*` → `"humanoid"`
- `chattingArt/chart_imgXX-corefolder*` → `"corefolder"`
- `art_img0-developper`, `art_img00-developper` → `"humanoid"` (形態差分なし)
- `../../DB_SemiPrimary/arts/corefolders/**` → `"corefolder"`

`characters` はそのパスを参照している全キャラのNumリスト。

### 6. 案D: `Images.designAlt_metadata` 追加

各 `designAlt_PNGPath` エントリに対応するメタデータオブジェクトを追加。  
フィールド: `{ "path": str, "characters": [Num...], "form": "corefolder"|"humanoid"|null }`

| パス | form | characters |
|---|---|---|
| `chattingArt/chart_img35-humanoidswimwear` | `"humanoid"` | [35] |
| `eventArt/art_sphericateDay-halloween2023A` | `"corefolder"` | [44, 66, 85] |
| `eventArt/art_sphericateDay-halloween2023B` | `"corefolder"` | [44, 66, 85] |
| `catalog/chr-dsgn-alt_wip61-idol` | `null` | [61] |
| `chattingArt/chart_img66-corefolderHalloween` | `"corefolder"` | [66] |
| `arts/art_img68-humanoidOnWorkSuit` | `"humanoid"` | [68] |

---

## 影響範囲

- `data/Works_NumberTales/DataBases/db_Primary.json` のみ
- 変更行数: 500行超
- `_creations-ai` 側 `build-dataset.js` の再ビルドが必要（サブモジュール更新後）

## 未完了タスク

- [ ] `_creations-ai` でサブモジュール更新 + `node scripts/build-dataset.js --verbose`
- [ ] `addon-ai-tag` ブランチへのマージ
- [ ] 案B〜D に対応した `build-dataset.js` の `has_*` フラグ拡張（別タスク）
