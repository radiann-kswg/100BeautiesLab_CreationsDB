# `ColorPalette` の配色スロット確定（並び替え・Role・色名・AppliesTo）

## 目的

既存の `ColorPalette` は `Hex`（設定画のカラーチップ＝作者指定色）だけが確定しており、
`Role` は被覆率の降順という機械的な仮値、`ColorName_JP/EN` は全件 `null`、`AppliesTo` は
色語照合による推測のままだった。これを User が `NTS-1` で手作業により確定させた形へ揃える。

## 合意事項（User 確定 / 2026-08-11）

### 配色スロット表（7 枠。並びがそのまま出力順）

| # | `ColorName_JP` | `ColorName_EN` | `Role` | 判定基準 |
| --- | --- | --- | --- | --- |
| 1 | 主色 | Primary Color | `#ColorRole_Primary` | 髪・共通配色以外の体毛などの地毛 |
| 2 | 主色(衣装) | Primary Color (Costume) | `#ColorRole_Primary` | 衣装の大半を占める色 |
| 3 | 副色 | Secondary Color | `#ColorRole_Secondary` | 耳毛・耳/尻尾の先端など地毛で二番目 |
| 4 | メインアクセントカラー | Main Accent Color | `#ColorRole_Accent` | 瞳の主色・キーチャーム等の強い差し色 |
| 5 | サブアクセントカラー | Sub Accent Color | `#ColorRole_Accent` | 瞳の副色・靴/手袋など控えめな差し色 |
| 6 | 副色（衣装） | Secondary Color (Costume) | `#ColorRole_Sub` | 衣装の二番目、または本体と衣装の調停色 |
| 7 | 補助色 | Auxiliary Color | `#ColorRole_Sub` | 全体のバランスを整えている色 |

- **「主色(衣装)」の Role は `#ColorRole_Primary`**（指示リストを正とする。`NTS-1` の
  実データは `#ColorRole_Secondary` だったため 1 行書き換えた）。
- **「副色(衣装) @`#ColorRole_Secondary`」の枠は運用しない**。衣装のセカンダリは常に
  6 番（`#ColorRole_Sub`）へ入れる。
- **色名の部位注記はアクセント枠のみ**。`AppliesTo` に瞳が含まれれば「瞳」、瞳以外が
  含まれれば「アクセサリー」を機械的に併記する
  （`メインアクセントカラー（瞳, アクセサリー）` / `Main Accent Color (Eye Color, Accessory Color)`）。

### 適用範囲

`ColorPalette` を持つのは **160 件**（NumberTales 151 / UnibyteLive 4 / DestinyFoxRecords 5）。
今回は **NumberTales / Primary（96 件）で試験導入**し、手応えを見てから残りへ展開する。

## 変更点の要約

### `tools/patch-colorpalette.mjs`（機能追加）

| 追加 | 内容 |
| --- | --- |
| `COLOR_SLOTS` | 上表のスロット定義。並び・`Role`・色名の唯一の出所 |
| `buildSlotColorName()` | アクセント枠の部位注記を `AppliesTo` から組み立てる |
| `applySlotAssignment()` | 割当に従って並べ替え、`Role` / `ColorName` を確定する |
| `collectSlotEvidence()` | 球体型姿・人姿での被覆率と色語ヒントを集める |
| `proposeSlotAssignment()` | 割当の**下書き**（要検証。単独では使えない） |
| `renderColorMap()` | 各配色が画像のどこに出ているかを粗いテキストマップで描く |
| `patchColorPaletteSlots()` | 上記を使って実データを更新する |
| CLI `--assign-slots` / `--slots <file>` / `--slot-report` / `--color-map` | 上記の入口 |

**`Hex` / `Formation` / `Note_JP` / `Note_EN` は既存値をそのまま持ち越す**
（作者指定色と創作内容には触らない）。

**7 枠のどれとも判定できない色が 1 つでも残るレコードは書き込まずスキップ**し、
`skipped-unassigned` として報告する。黙って補助色へ流さない。

### `data/db_meta.json`

`$EnumDef_ColorRole` の和名が逆さまだったので入れ替えた（User 確定）。

| キー | 変更前 | 変更後 |
| --- | --- | --- |
| `#ColorRole_Secondary` | 補助色 | **副色** |
| `#ColorRole_Sub` | 副色 | **補助色** |

### 実データ（NumberTales / Primary）

**5 件に適用済み**: Num **1 / 5 / 6 / 8 / 24**。

| Num | 主色 | 主色(衣装) | 副色 | メインアクセント | サブアクセント | 副色（衣装） | 補助色 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `#ED5D47` | `#FF8682` | `#FFAC8F` | `#E55951` | `#C9CDCB` | `#CEC7B6` | `#FFBFA7` |
| 5 | `#61DAAC` | `#4CD9E8` | `#7FE2C5` | `#009489` | — | `#408784` | — |
| 6 | `#FF76A2` | `#A783B5` | `#FFCEED` | `#185EBD` | — | `#6AA6D7` | — |
| 8 | `#E85764` | `#FF9E68` | `#FFA9A8` | `#FC6932` | — | `#BC4655` | — |
| 24 | `#E8AFD8` | `#AEB8DB` | `#FCE8EC` | `#0097C9` | — | `#C680AF` | — |

割当ファイルは `.cache/slots-NumberTales-Primary.json`（Git 管轄外）。
`node tools/patch-colorpalette.mjs --work NumberTales --db Primary --records <list> --assign-slots --slots <file> --apply` で再現できる。

## 検証

- `npm test` 全件成功（**67 ファイル / 1200 件**）。うち `tests/patch-colorpalette.test.js` に
  スロット確定のテストを 7 件追加。
  - 順序を崩した入力がスロット表の並びへ整列すること
  - `Role` / `ColorName_JP` が `NTS-1` の確定値と一致すること
  - アクセント枠だけ部位注記が付くこと
  - `Hex` / `Formation` / `Note` が持ち越されること
  - 割当外の色が `unassigned` として返ること（補助色へ流さない）
  - 未知のスロット名・存在しない `Hex` を弾くこと
- `--slot-report` を NumberTales / Primary 全 96 件で実行 → **下書きだけで全色を割り当てられた
  レコードは 0 件**。自動推定は単独では使えないことを確認した（後述）。

## 判ったこと（重要）

### 1. 自動推定だけでは配色スロットは決まらない

`AppearanceDetail` の色語・`DesignElement` と被覆率から下書きを作れるが、**96 件すべてで
不足**した。原因は 3 つ。

- 根拠に使う `AppearanceDetail` の `BodyPart` / `DesignElement` 自体が、画像を見て手動修正
  された経緯を持つ（User 指摘）。
- 近似色が競合すると被覆率が入れ替わる。`NTS-1` の `#FFAC8F`（副色 / 尻尾）と
  `#FFBFA7`（補助色）は RGB 距離 30 程度しかなく、球体型姿では後者が 21.8%、前者が 0.0% と出る。
- 前景マスクが淡いグレーを紙面として落とすため、足元・小物の色が欠けることがある
  （`NTS-1` の靴 `#C9CDCB` が人姿イラストで 0% になる）。

### 2. 配色マップは近似色を分離できる

`--color-map` で「どの色がどの領域に割り当てられたか」を図にすると、被覆率では潰れる
近似色が分離できる。Num 4 では `#8DE8ED` が尻尾先端、`#7AD9ED` が衣装の内側と読み取れた。
**透過画像（球体型姿）では特に有効**。背景付きの人姿イラストは前景マスク経由になるため
足元が欠けやすい。

### 3. `AppearanceDetail.BodyPart` の画像からの自動検出は未達

User から追加要望あり。色の分布だけでは部位そのものは決められない（姿とポーズで
髪・尻尾・衣装の位置関係が変わるため）。現状は `--color-map` の行頭に外接矩形の
5 等分目盛り（`頭`/`上`/`中`/`下`/`足`）を添えるところまで。**目盛りは部位判定ではない**。

## 残り 91 件の見通し（近似色の分離可能性で 3 分割）

各レコードの配色から**総当たりで最小 RGB 距離**を取り、分離できるかで分けたもの。
User の方針「迷うものを除いて適用」に従い、上から順に処理する。

| 区分 | 件数 | 内容 |
| --- | --- | --- |
| **分離可能（最小距離 35 以上）** | 33 | 目視と分布計測で判定できる。`0 00 5 6 7 8 10-alt 14 23 24 30 31 32 35 37 40 41 43 46 47 48 52 53 56 64 65 67-old 73 74 76 84 88 97` |
| **要注意（20〜34）** | 30 | 分布計測を併用すれば大半は判定できる見込み。`4 15 16 17 18 26 29 34 36 45 49 50 51 57 58 60 61 62 63 66 67 69 75 78 80 85 86 94 96 98` |
| **分離困難（20 未満）** | 33 | 目視では決められない。`2 3 9 10 11 12 13 19 20 21 22 25 27 28 33 39 42 44 55 68 70 71 72 77 81 87 89 92 93 99 000 2-alt` |

- 例: Num 3 の `#FFBC08` と `#FFBE0E` は距離 **6**（G が 2、B が 6 違うだけ）。どちらが
  衣装のどの部分かは作者にしか判らない。
- Num 1 も距離 13 で「分離困難」に入るが、User が手作業で確定させている。**距離は目安**であり、
  作者の意図が判っていれば分離困難な組でも確定できる。

## 未完了タスク

- **分離可能 33 件のうち未処理 28 件**のスロット確定（済: 5 / 6 / 8 / 24。`7` は
  `#5E7AA9` が尻尾先端と袴の両方に出るため保留）。
- **要注意 30 件**の判定。
- **分離困難 33 件**は User 確認待ち。近似色ペアのどちらがどの部位かを教えてもらう必要がある。
- 色数が 7 枠に満たないレコードで**どの枠を空けるか**は 1 件ずつの判断にしている
  （Num 5 / 6 / 8 / 24 はいずれも 5 色で、サブアクセントと補助色を空けた）。
- 残り 64 件（NumberTales の Secondary / SelfSecondary / SemiPrimary、UnibyteLive、
  DestinyFoxRecords）への展開。
- **`AppearanceDetail.BodyPart` の画像からの自動検出は未達**（上記「判ったこと 3」）。
- `Role` を変更したため、`addon-ai-tag` 側で `--apply-colorpalette --force-palette` の
  再実行が必要（`palette_priority` へ反映するため）。

## 参考リンク

- [`2026-07-13_progress_colorpalette-schema.md`](./2026-07-13_progress_colorpalette-schema.md) — `ColorPalette` スキーマ新設とチップ抽出
- `tools/patch-colorpalette.mjs` / `tests/patch-colorpalette.test.js`
- `data/db_meta.json`（`General.$VarsDef.$Def_ColorPalette` / `$EnumDef_ColorRole`）
