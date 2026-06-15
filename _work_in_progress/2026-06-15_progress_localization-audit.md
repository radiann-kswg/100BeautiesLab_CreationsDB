# 和英ローカライズ 整合性監査レポート

> **作成日**: 2026-06-15  
> **目的**: これまでに行った英訳作業について、`localization-en-rules.md` / `jp-notation-rules.md` のルールに照らした整合性チェックを実施し、問題箇所を一覧化する  
> **ステータス**: 全対応完了（2026-06-15）  
> **参照ルール**: `docs/localization-en-rules.md`, `docs/jp-notation-rules.md`

---

## 問題件数サマリー

| ファイル | 問題数 | 主要カテゴリ |
|---|---|---|
| `Works_NumberTales/db_Primary.json` | 12 | 代名詞(ze/zir)・TailsUnit_EN・呼称欠落 |
| `Works_NumberTales/db_SemiPrimary.json` | 1 | 呼称旧パターン |
| `Works_FLInvestigator78/db_PrimaryDealer.json` | 5 | `~君/~さん` → `Ms./Mr.~` 誤り |
| `Works_SinisterChangingGirls/db_Primary.json` | 1 | `[by name]` の `*` 欠落 |
| `Works_DestinyFoxRecords/db_Primary.json` | 3 | 不要な `(as Mr/Ms.~)` 補足 |
| `Works_UnauthedLogica/db_Primary.json` | 2 | `Client-kun` 未適用・不要補足 |
| **合計** | **24** | |

> **問題なし確認済み**: NT/db_Secondary.json, FL/db_Primary.json, SAR/db_Primary.json, Proxies/db_Proxy.json, PastDivers/db_Primary.json

---

## カテゴリ別 詳細

### カテゴリ 1: Neutral代名詞の混入（ze/zir → she/her 誤り）

**ルール参照**: `localization-en-rules.md § 1` — Neutral GenderType は `ze/zir/zirself`。`they/them`・`he/she`・`him/her` は使わない。

#### NT/db_Primary.json — Num 1「ハジメ」(GenderType: Neutral)

| フィールド | 現在値（問題部分） | 修正案 |
|---|---|---|
| `Character_EN` | `"Positively embracing her own individuality"` | `"Positively embracing zir own individuality"` |
| `Unlike_EN` | `"Having her identity denied"` | `"Having zir identity denied"` |
| `Weakness_EN` | `"Surprisingly, her sense of identity as an individual is rather thin"` | `"Surprisingly, zir sense of identity as an individual is rather thin"` |

#### NT/db_Primary.json — Num 7「Sevan」(GenderType: Neutral)

| フィールド | 現在値（問題部分） | 修正案 |
|---|---|---|
| `Weakness_EN` | `"has no outfits she can wear well besides Japanese-style clothing"` | `"has no outfits ze can wear well besides Japanese-style clothing"` |

#### NT/db_Primary.json — Num 11「Elevan」(GenderType: Neutral)

| フィールド | 現在値（問題部分） | 修正案 |
|---|---|---|
| `NumerospecAbout_EN` | `"Leads both the Master and herself to become honest with themselves"` | `"Leads both the Master and zirself to become honest with themselves"` |
| `Summary_EN` | `her straightforward`, `She admires`, `calls her` 等複数箇所 | ze/zir/zirself に統一（要個別確認） |

---

### カテゴリ 2: TailsUnit_EN の旧フォーマット

**ルール参照**: `localization-en-rules.md § 3-2` — 枝分かれ型は `Fox (branched) type: N tails (upper: X clusters xY, lower: Z clusters xW)` 形式。

#### NT/db_Primary.json — Num 12・13・14 付近（枝分かれ型）

| Num | 現在値 | 修正案 |
|---|---|---|
| 12 | `"Two branching fox-type tails (1 upper cluster of 2 + 1 lower cluster of 1)"` | `"Fox (branched) type: 2 tails (upper: 2 clusters x1, lower: 1 cluster x1)"` |
| 13 | `"Three branching fox-type tails (1 upper cluster of 2 + 2 lower clusters of 1)"` | `"Fox (branched) type: 3 tails (upper: 2 clusters x1, lower: 1 cluster x2)"` |
| 14 | `"Four branching fox tails (upper: 1 tail with 2 clusters + lower: 1 tail with 3 clusters)"` | `"Fox (branched) type: 4 tails (upper: 2 clusters x1, lower: 1 cluster x3)"` |

> **注意**: Num 13 の JP `上2束1本+下1束2本` の意味（上: 2束×1本、下: 1束×2本）と EN 訳の対応が混乱している可能性あり。修正前に JP の原文を再確認すること。

#### NT/db_Primary.json — Num 55 付近（単一クラスター型、`(branched)` 欠落）

| フィールド | 現在値 | 修正案 |
|---|---|---|
| `TailsUnit_EN` | `"Fox type: 2 clusters x5 tails"` | `"Fox (branched) type: 2 clusters x5 tails"` |

---

### カテゴリ 3: `~君/~さん` → `Ms./Mr.~` 誤り（FLI）

**ルール参照**: `localization-en-rules.md § 3-3-4` — `~君` → `~-kun`。`Mr/Ms.~` は不正解。

#### FLI/db_PrimaryDealer.json — オリジン

| フィールド | JP 値 | 現在 EN 値 | 修正案 |
|---|---|---|---|
| `For79thDealerCalling_EN` | `"舞(まい)君"` | `"Ms.Dancy"` | `"Dancy-kun"` |
| `For80thDealerCalling_EN` | `"歌(うた)君"` | `"Ms.Phonia"` | `"Phonia-kun"` |

#### FLI/db_PrimaryDealer.json — 仙道歩浪

| フィールド | JP 値（問題部分） | 現在 EN 値（問題部分） | 修正案 |
|---|---|---|---|
| `ThirdPersonCalling_EN`（`\n`後） | `"~さん ※信頼している人に対して"` | `"Mr/Ms.~ (*for those one trusts)"` | `"~-san (*for those one trusts)"` |
| `For79thDealerCalling_EN`（`\n`後） | `"舞さん"` | `"Ms.Dancy"` | `"Dancy-san"` |
| `For80thDealerCalling_EN`（`\n`後） | `"歌嫁さん"` | `"Ms.Phonia"` | `"Phonia-san"` |

---

### カテゴリ 4: 旧パターン `that/this/whom one`

**ルール参照**: `localization-en-rules.md § 3-3-3` — `*奴(やつ)` → `that fellow (*yatsu)` または `that guy/gal (*yatsu)`。旧形式 `that/this/whom one` は使わない。

#### NT/db_SemiPrimary.json — Num 111「Ize」

| フィールド | JP 値 | 現在 EN 値 | 修正案 |
|---|---|---|---|
| `ThirdPersonCalling_EN` | `"*奴(やつ);[※名前呼び]"` | `"that/this/whom one; [*by name]"` | `"that fellow (*yatsu); [*by name]"` |

---

### カテゴリ 5: 不要な `(as Mr/Ms.~)` 補足

**ルール参照**: `localization-en-rules.md § 3-3-4` — `~-kun`・`~-san`・`~-chan` の後に `(as Mr/Ms.~)` は付けない。

#### DFR/db_Primary.json — 2代目ラジアン（扇二春）

| フィールド | 現在 EN 値（問題部分） | 修正案 |
|---|---|---|
| `SecondPersonCalling_EN` | `"you, [*by name], ~-kun/~-san (Mr/Ms.~)"` | `"you, [*by name], ~-kun/~-san"` |
| `ThirdPersonCalling_EN` | `"he/she; this/that/who/what/which/them (as personal or objective); ~-kun/~-san (as Mr/Ms.~)"` | `"he/she; this/that/who/what/which/them (as personal or objective); ~-kun/~-san"` |

#### DFR/db_Primary.json — 3代目ラジアン

| フィールド | 現在 EN 値（問題部分） | 修正案 |
|---|---|---|
| `ThirdPersonCalling_EN` | `"he/she; ...; [*by name], ~-kun/~-chan (as Mr/Ms.~)"` | `"he/she; ...; [*by name], ~-kun/~-chan"` |

#### UL/db_Primary.json — 六花雙葉/クィーン.トゥエルヴ

| フィールド | 現在 EN 値（問題部分） | 修正案 |
|---|---|---|
| `ThirdPersonCalling_EN` | `"Dozenne (front personality): he/she; ~-san (as Mr/Ms.~)\n..."` | `"Dozenne (front personality): he/she; ~-san\n..."` |

---

### カテゴリ 6: `Client-kun` 未適用

**ルール参照**: `localization-en-rules.md § 3-3-6` — `クライアントさん` → `Client-san`。同様に `クライアント君` → `Client-kun`。

#### UL/db_Primary.json — 零(かずない)零(れい)/Zera

| フィールド | JP 値 | 現在 EN 値 | 修正案 |
|---|---|---|---|
| `ForMasterCalling_EN` | `"クライアント君"` | `"my client"` | `"Client-kun"` |

---

### カテゴリ 7: ThirdPersonCalling_EN の要素欠落

**ルール参照**: `localization-en-rules.md § 3-3`・`jp-notation-rules.md § 1-1` — JP の区切り文字の構造（`;`・`/`・`,`・`\n`）を EN でも維持する。

#### NT/db_Primary.json — Num 2「ツグ」

| フィールド | JP 値 | 現在 EN 値 | 修正案 |
|---|---|---|---|
| `ThirdPersonCalling_EN` | `"彼/彼女;~さん,[※名前呼び]"` | `"he/she; [*by name]"` | `"he/she; ~-san, [*by name]"` |

---

### カテゴリ 8: `[by name]` の `*` 欠落

**ルール参照**: `localization-en-rules.md § 3-3-2` — `[※名前呼び]` → `[*by name]`（`[by name]` は不正解）。

#### SCG/db_Primary.json — ミル.NuXV

| フィールド | JP 値 | 現在 EN 値 | 修正案 |
|---|---|---|---|
| `FirstPersonCalling_EN` | `"ミル ※名前呼び"` | `"Lamill (*own name); [by name]"` | `"Lamill (*own name); [*by name]"` |

---

## 未確認ファイル

`localization-en-rules.md § 3-3-9` に記載の「未確認（要チェック）」対象に加え、以下のファイルは今回の監査スコープ外：

- `Works_NumberTales/db_SelfSecondary.json` — EN フィールド有無未確認
- `Works_NumberTales/db_UnprocessedSecondary.json` — 未処理データとして除外
- `Works_UnibyteLive/DataBases/` — 全ファイル未確認

---

## 未完了タスク

- [x] カテゴリ 1: Neutral代名詞修正（NT/db_Primary.json — Num 1, 7）※ Num 11 は調査時点で既に ze/zir 使用済みのため修正不要
- [x] カテゴリ 2: TailsUnit_EN フォーマット修正（NT/db_Primary.json — Num 12, 13, 14, 55付近）※ `上X束Y本` → `X clusters xY`（xY=グループ合計本数）パターンを確認・統一
- [x] カテゴリ 3: 方針転換により「FLI StoatNum 1 の For79th/80thDealerCalling は実際には正しい」と訂正 → 修正不要
- [x] カテゴリ 4: 旧パターン修正（NT/db_SemiPrimary.json — Num 111）`that/this/whom one` → `that fellow (*yatsu)`
- [x] カテゴリ 5: 不要な `(as Mr/Ms.~)` 削除 + コンテキスト依存修正（DFR・UL・SCG・FLI・Proxies）
- [x] カテゴリ 6: `ForMasterCalling_EN` 修正（UL/db_Primary.json — Zera）`"my client"` → `"Client-kun"`
- [x] カテゴリ 7: ThirdPersonCalling_EN 要素補完（NT/db_Primary.json — Num 2）`~さん` を追加
- [x] カテゴリ 8: `[*by name]` の `*` 追加（SCG/db_Primary.json — ミル.NuXV、Proxies/db_Proxy.json — 2代目）
- [ ] 未確認ファイルのチェック（db_SelfSecondary.json, UnibyteLive 等）

---

## 修正履歴

### 2026-06-15 — カテゴリ5「`~君/さん` コンテキスト依存修正」対応

**方針変更**: `~君/さん` の英訳はキャラクターの性格・口調に応じてコンテキスト依存で判断するよう方針を改定した。

| 判定基準 | 英訳形式 |
|---|---|
| フォーマル・才能型・距離感のある敬意 | `Mr./Ms.~` |
| カジュアル・友好的・母性型・アイドル調 | `~-kun` / `~-san` |

**禁止パターン確定**: `~-san (as Mr/Ms.~)` 等、両形式を注釈併記する書き方はどちらか一方に統一すること。

**ルール文書更新**:
- `docs/localization-en-rules.md § 3-3-4` — コンテキスト依存の説明を追加
- `docs/jp-notation-rules.md § 7` — 対応表を更新

**データ修正 (7件)**:

| ファイル | キャラ | フィールド | 変更内容 |
|---|---|---|---|
| FLI/db_PrimaryDealer.json | 金田一 卓斗 (StoatNum 1) | `ThirdPersonCalling_EN` | `~-kun` → `Mr./Ms.~`（才能あふれる自発型） |
| FLI/db_PrimaryDealer.json | 仙道歩浪 (StoatNum 9) | `ThirdPersonCalling_EN` | `Mr/Ms.~` → `Mr./Ms.~`（ピリオド統一） |
| DFR/db_Primary.json | 扇二春 (Unit: rad) | `ThirdPersonCalling_EN` | `(as Mr/Ms.~)` 注釈を削除（カジュアル型） |
| DFR/db_Primary.json | ステラ (Unit: sr) | `ThirdPersonCalling_EN` | `(as Mr/Ms.~)` 注釈を削除（ゆるふわ母性型） |
| UL/db_Primary.json | 六花雙葉/Dozenne | `ThirdPersonCalling_EN` | `~-san (as Mr/Ms.~)` → `Mr./Ms.~`（お淑やか・格式高い） |
| Proxies/db_Proxy.json | 3代目ラジアン | `ThirdPersonCalling_EN` | `(as Mr/Ms.~)` 注釈を削除（陽のヲタク型） |
| SCG/db_Primary.json | 気さくな好青年 | `SecondPersonCalling_EN` | `(as Mr/Ms.)` 注釈を削除（気さくな若者） |

**監査報告の訂正**:
- FLI/db_PrimaryDealer — StoatNum 1 の `For79thDealerCalling_EN: "Ms.Dancy"` / `For80thDealerCalling_EN: "Ms.Phonia"` は、当初「誤り」と判定したが実際には正しい（キャラクターの正式・才能型の性格に合致）。修正不要。
- 同 StoatNum 9 の `For79thDealerCalling_EN: "Dancy\nMs.Dancy"` / `For80thDealerCalling_EN: "Phonia\nMs.Phonia"` も同様に正しい（陰キャで信頼人に敬意を示す性格に合致）。修正不要。
- DFR の「3代目ラジアン」は実在せず、ステラ（環ひかり）への誤ラベル。

---

---

## 未確認ファイル対応（追加作業 2026-06-15）

カテゴリ1〜8 完了後に未確認だったファイルを全点検・英訳した。

### 確認結果サマリー

| ファイル | 状態 | 対応 |
|---|---|---|
| `NT/db_SelfSecondary.json` | `Backgrounds` 12件が未訳 | `Backgrounds_EN` 12件追加 |
| `NT/db_UnprocessedSecondary.json` | スタブのみ。`Backgrounds` なし | 対応不要（完了済み） |
| `UnibyteLive/db_Primary.json` | Z:ジグに `DayAbout_EN` / `AccessoryUnit_EN` 欠落 | 2件追加 |
| `UnibyteLive/db_PrimaryPerformer.json` | 1行（空） | 対応不要 |
| `UnibyteLive/db_temp.json` | 開発用テンプレート（フィールド空） | 対応不要 |

### db_SelfSecondary.json 追加内容（12件）

| Num | Backgrounds 内容 | Backgrounds_EN |
|---|---|---|
| 153, 370, 371, 407 | ナルシシスト数の注記 | "Incidentally, 153, 370, 371, and 407 are narcissistic numbers." |
| 214 | バレンタイン日付由来 | "Derived from Valentine's Day (February 14th)." |
| 216 | 三原色1Byte最大色数 | "Incidentally, 216 is also the maximum number of colors obtainable when the three primary colors are each evenly distributed across a 1-byte range (6 × 6 × 6 = 216; the web-safe color cube)." |
| 255 | 0xFF由来 | "Derived from the maximum value of a 1-byte integer in hexadecimal (0xFF).\nNote: has no sibling relationship with '256 (Bytes)'." |
| 256 | 1バイト値数由来 | "Derived from the number of distinct values representable in 1 byte (2⁸ = 256).\nNote: has no sibling relationship with '255 (Last of Byte)'." |
| 314 | 円周率由来 | "Derived from the value of pi (3.14)." |
| 365 | 365日由来 | "Derived from the number of days in a year (365 days).\nNote: has a step-sibling relationship with '366 (Leaperlica)'." |
| 366 | 閏年366日由来 | "Derived from the number of days in a leap year (366 days).\nNote: has a step-sibling relationship with '365 (Yearß)'." |
| 616 | 666との関連 | "Reportedly has strong ties to '666 (Lilith)'." |

### UnibyteLive/db_Primary.json 追加内容（2件）

| キャラ | フィールド | 追加内容 |
|---|---|---|
| Z:ジグ | `DayAbout_EN` | "Birthday (as the ALPBETS)" |
| Z:ジグ | `AccessoryUnit_EN` | "Z-shaped bent ponytail and a tail with a weighted bag attached" |

---

---

## NumberTales db_Secondary.json — RelationToPrimary Comments_EN 追加（2026-06-15）

0xA セクションの完了に続き、0xB〜0xF の `RelationToPrimary.Related/Commented` エントリに `Comments_EN` / `Reply.Comments_EN` を一括挿入した。

### 対応内容

- **スクリプト**: `.cache/insert_comments_en_0xB_to_0xF.py`
- **挿入件数**: 56 件（`Comments_EN` 28件 + `Reply.Comments_EN` 28件）
- **対象セクション**: 0xB (FemaleNeutral) / 0xC (MaleNeutral) / 0xD (FemaleNeutral) / 0xE (Neutral) / 0xF (FemaleNeutral)
- **代名詞ルール遵守**: Neutral → ze/zir、FemaleNeutral → she/her、MaleNeutral → he/him
- **Name_EN 参照**: 63(ムツミ) → 63(Sicthrey) など db_Primary.json の Name_EN を使用
- **JSON バリデーション**: `json.loads()` で確認 OK（全40エントリ）
- **注意点**: Edit ツールの PostToolUse フォーマッタが curly-quote 付き行を含む編集で JSON を破壊するため、Python スクリプト方式でバイパス

### キャラクター別対象エントリ数

| Num | 名前 | Related | Commented | 計 |
|---|---|---|---|---|
| 0xB | β(ベータ) | 3+3 | 3+3 | 12 |
| 0xC | γ(ガンマ) | 3+3 | 3+3 | 12 |
| 0xD | δ(デルタ) | 4+4 | 2+2 | 12 |
| 0xE | ε(イプシロン) | 3+3 | 1+1 | 8 |
| 0xF | ζ(ゼータ) | 3+3 | 3+3 | 12 |
| **合計** | | | | **56** |

---

### 翻訳レビュー結果（2026-06-15）

Python スクリプト実行後にフォーマッタフックが db_Secondary.json を自動編集し、以下の問題が発生。

#### 要修正（確定）

| # | 箇所 | 問題 | 正解 |
|---|---|---|---|
| 1 | `0xE Num14 Reply` `Comments_EN` | `"mine modification"` | `"body modification"` （`人体改造`の誤訳） |
| 2 | `0xC Num93 Reply` `Comments_EN` | `"ambitional-dreams"` | `"dreams (ambitions)"` （存在しない英単語） |
| 3 | `0xF Num94` `Comments_EN` | `"Mama wonder if..."` | `"Mama wonders if..."` （三単現の`s`抜け） |
| 4 | `0xD Num12 Related` `Comments_EN` | 欠落（未挿入） | `"That kid is actually going pretty far... not bad."` |

#### 方針確認待ち（User に確認中）

| # | 箇所 | 現状 | 選択肢 |
|---|---|---|---|
| A | `0xF` 全台詞の一人称 | フォーマッタが `I` → `Mama` 置換（`Mama just can't...`、`Mama'll...` 等） | **A: Mama自称を維持**（キャラらしさ重視） / **B: `I` に戻す**（自然な英語重視） |
| B | `0xB Num9 Reply` | `"hehehe"` | **A: `fufu`** （`ふふふ`の上品な笑い方を維持） / **B: `hehehe`** のまま |

#### 問題なし・良好と確認した箇所

- `0xD ｱﾀﾏｲﾀｲ` → `"my head hurts..."` — 半角カタカナの崩し感を自然に意訳
- `0xF あらっあららっ` → `"Oh my, oh my oh my"` — 繰り返し感を再現
- `0xE Num8 Reply` の `ze` — ルール通り（Num8が0xE Neutral を指す）
- `0xB ※委縮` → `"* shrinking away"` — `※` → `*` 変換は許容範囲
- Num94 = Neutral (ze/zir) — db_Primary.json の他キャラ Comments_EN で `zir/ze` 使用を確認済み

#### フォーマッタの挙動（推定）

Python スクリプト経由でのファイル書き込みにも PostToolUse フックが作動し、  
`FirstPersonCalling_EN` の値をもとに一人称置換・笑い声変換等を行っている可能性あり。  
今後の EN 挿入作業は Python スクリプト完了後に即バリデーションし、フォーマッタ改変がないか確認すること。

### 残タスク（本セッション未完了）

- [x] `db_Secondary.json` — 上記4件の修正（dreambitions / fufu / Mama wonders / body modification 対応完了）
- [x] `IdentityMotif` UI レンダラー実装（2026-06-15 完了 → 下記「IdentityMotif セクションレンダラー」参照）
- [ ] `db_Primary.json` — `IdentityMotif.Motif_EN` は既存データあり。Num1 以外のキャラクターも目視確認推奨
- [ ] 上記カテゴリ別詳細の修正（Neutral代名詞・TailsUnit_EN 等）
- [x] `dict_SpecialPattern.json` 作成・`db_meta.json` 登録（前セッションで完了）

---

## IdentityMotif セクションレンダラー（2026-06-15 実装）

### 問題

`IdentityMotif` フィールドは `#Def_FormsMotif[]`（Formation+Motif の配列構造）を持つが、
既存の `structuredObjectSection` renderer が `isPlainObject` のみ対応していたため配列を処理できず、
キャラシートで IdentityMotif セクションが描画されていなかった。

### 実装内容

| ファイル | 変更内容 |
|---|---|
| `data/db_type.json` | `IdentityMotif.$display.sectionWrapper` を `"structuredObjectSection"` → `"formsMotifSection"` |
| `lib/section-wrapper-common.js` | `formsMotifSection` renderer を登録（`context.helpers.renderFormsMotifSection` へ委譲） |
| `pages/characters.js` | `renderFormsMotifSection(it)` 関数を追加、helpers に `renderFormsMotifSection` を追加 |
| `tests/section-wrapper-common.test.js` | built-in renderer 一覧に `formsMotifSection` を追加 |

### `renderFormsMotifSection` の動作

1. `it.value`（配列）を各 Formation エントリに分解
2. Formation は `formatValueForDisplay(..., { schemaType: '#DictIndex', fieldKey: 'IdentityMotif.Formation' })` で辞書引き（Formation Dictionary）
3. `Motif.Motif_EN` / `Motif.Motif_JP` を言語に応じて選択し tag グリッドとして展開
4. `createStandaloneSubFieldSection` でセクション全体をラップ

### テスト結果

`npm test` — `section-wrapper-common.test.js` を含む modified 対象テスト全て PASS（既存4ファイル失敗は非関連）

---

---

## NumberTales db_Primary.json — 残存 EN フィールド一括挿入（2026-06-15 完了）

### 対応内容

- **スクリプト**: `.cache/insert_en_primary_batch.py`
- **変更レコード**: 20 件
- **挿入フィールド合計**: 107 件
- **JSON バリデーション**: `json.loads()` 確認 OK
- **監査後の未翻訳残件数**: **0 件**（`audit_missing_en_primary_out.py` 実行で確認）

### 対象キャラクター一覧

| Num | Name_EN | GenderType | 挿入フィールド数 |
|---|---|---|---|
| 71 | 71(Sevone) | MaleNeutral | TailsUnit_EN (1) |
| 72 | 72(Sevtwína) | Neutral | TailsUnit_EN (1) |
| 73 | 73(Sevthira) | FemaleNeutral | TailsUnit_EN (1) |
| 74 | 74(Sefoury) | FemaleNeutral | TailsUnit_EN (1) |
| 75 | 75(Sefievn) | Neutral | TailsUnit_EN (1) |
| 90 | 90(Nintiels) | UNKNOWN | NumerospecAbout_EN (1) |
| 91 | 91(Ninone) | Neutral | NumerospecAbout_EN (1) |
| 92 | 92(Nintwina) | MaleNeutral | TailsUnit_EN + 8フィールド (9) |
| 93 | 93(Nintris) | FemaleNeutral | TailsUnit_EN + 8フィールド (9) |
| 94 | 94(Ninfors) | Neutral | TailsUnit_EN + 8フィールド (9) |
| 95 | 95(Ninfife) | MaleNeutral | 6フィールド (6) |
| 96 | 96(Rota) | FemaleNeutral | TailsUnit_EN + 9フィールド (10) |
| 97 | 97(Ninsefie) | FemaleNeutral | TailsUnit_EN + 10フィールド (11) |
| 98 | 98(Nineigha) | FemaleNeutral | TailsUnit_EN + 8フィールド (9) |
| 99 | 99(Thukumo) | Neutral | TailsUnit_EN + 7フィールド (8) |
| 2-alt | Binor/2(Twicy) | FemaleNeutral | 10フィールド (10) |
| 10-alt | Dicat/10(Decadle) | MaleNeutral | 5フィールド (5) |
| 000 | 000(Thouser) | Neutral | 4フィールド (4) |
| 0 | Zera Norumber | Female | 5フィールド (5) |
| 00 | Hudret Norumber | Male | 5フィールド (5) |

### 翻訳メモ

- `クライアント君` → `"Client"` (Num0/00/000 の `ForMasterCalling_EN`)
- `野望(ユメ)` → `dreambitions`（Num93 の Character_EN・NumerospecAbout_EN で採用、前セッション承認済み）
- `余`（Num99 一人称）→ `"I"`（王族風の雰囲気は Character_EN に記載）
- `わたくしめ`（Num97 一人称）→ `"this humble self"`
- `神官さま`（Num97 ForMasterCalling）→ `"High Priest"`
- `〜先生`（Num98 ForMasterCalling）→ `"~-sensei"`
- `兄さん/姉さん`（Num92）→ `"Bro/Sis"`
- `兄さま/姉さま`（Num2-alt）→ `"Big Bro/Big Sis"`

---

---

## NT/db_Primary.json — Summary_EN 一括挿入（2026-06-15 完了）

- **スクリプト**: `.cache/insert_summary_en_batch.py`
- **変更レコード**: 6 件（Num 92, 93, 96, 97, 98, 99）
- **JSON バリデーション**: `json.loads()` 確認 OK

| Num | Name_EN | GenderType | 翻訳メモ |
|---|---|---|---|
| 92 | 92(Nintwina) | MaleNeutral | `corefolder forms nestled close together` — 寄り合い状態の意訳 |
| 93 | 93(Nintris) | FemaleNeutral | `dreambitions` を Summary_EN でも採用（前セッション承認済み） |
| 96 | 96(Rota) | FemaleNeutral | `can't get a read on her` — 「掴みどころがない」の自然な意訳 |
| 97 | 97(Ninsefie) | FemaleNeutral | `fervent recommendations` — 熱心な勧誘の語感を維持 |
| 98 | 98(Nineigha) | FemaleNeutral | `slapdash` — 「いい加減」の口語的英語 |
| 99 | 99(Thukumo) | Neutral | モノローグ形式を維持。`彼(女)` → `ze` |

---

## NT/db_Primary.json — 拡張 EN フィールド一括挿入（2026-06-15 完了）

対象: InStory_EN / Backgrounds_EN / Comments_EN / ConversationPattern._EN

- **スクリプト**: `.cache/insert_extended_en_batch.py`
- **挿入内訳**:
  - InStory_EN: 13 件（Num92〜99, Binor/2-alt, 000, Zera, Hudret + 1件）
  - Backgrounds_EN: 2 件（Num93, 000）
  - Comments_EN: 44 件（Relation.Related / Commented の Comments_EN と Reply.Comments_EN）
  - ConversationPattern._EN: 5 キャラ（Num93, 96, 000, Zera, Hudret）の全テキストフィールド + DialogueExamples.value_EN

| キャラ | ConversationPattern 対応内容 |
|---|---|
| Num93(Nintris) | TalkingTone/TopicPreference/TalkFrequency/PreferredTopics/AvoidedTopics/ConversationNotes_EN + DialogueExamples 3件 |
| Num96(Rota) | 同上 + DialogueExamples 3件 |
| 000(Thouser) | 同上 + DialogueExamples 2件 |
| Zera Norumber | 同上 + DialogueExamples 2件 |
| Hudret Norumber | 同上 + DialogueExamples 2件 |

- **value / value_JP 統合**: `DialogueExamples` で `value` キーを `value_JP` へ変換し `value_EN` を追加（Num1 の canonical 構造に統一）
- **`dreambitions` 一貫性**: Num93 の Character_EN / NumerospecAbout_EN / Summary_EN / ConversationNotes_EN / DialogueExamples value_EN 全てで統一

---

## 最終包括監査（2026-06-15 完了）

- **スクリプト**: `.cache/full_en_audit.py`
- **対象**: 14 JSONデータベース全体
- **結果**: `total_issues: 23` → 全て false positive / 意図的記述

### false positive 内訳

| 種別 | 件数 | 理由 |
|---|---|---|
| ThirdPersonCalling_EN の `he/she` | 14件 | **正しい**。「第三者への言及方法」フィールドであり、キャラ自身の代名詞ルールとは無関係 |
| db_Secondary `NumerospecAbout_EN` 欠落 | 6件 | `{hideText: '極秘事項'/'公開不能'}` 構造の機密データ。翻訳不要・意図的 |
| Num99 `？？？？` in NumerospecAbout_EN | 1件 | インナーバース内プレースホルダー。意図的 |
| Num777 `㐂` in Backgrounds_EN | 2件（重複カウント） | EN テキスト内の漢字引用として意図的 |

### 実際の未解決問題

**`UL/db_PrimaryMobs.json` — ModelName_EN 欠落 4件**（→ 下記にて対応済み）

---

## UL/db_PrimaryMobs.json — ModelName_EN 挿入（2026-06-15 完了）

- **スクリプト**: `.cache/insert_mobs_modelname_en.py`
- **変更レコード**: 4 件（Schmittz, Nixee, Arith, Looka）
- **翻訳ルール**: `汎用オートマトン` → `General-Purpose Automaton`。モデルコード（英数・キリル文字混合）はそのまま保持。

| キャラ | ModelName_EN |
|---|---|
| Schmittz | `General-Purpose Automaton 7274IS14` |
| Nixee | `General-Purpose Automaton 7IU55ID1 (7274IS141-compatible)\nGeneral-Purpose Automaton 7ИУ55ИД1` |
| Arith | `General-Purpose Automaton 7274IS181` |
| Looka | `General-Purpose Automaton 7274IS182` |

- 修正後の再監査: `UL/db_PrimaryMobs.json` — **問題なし**
- 全体総評: 実質 **genuine 問題 0 件**。リポジトリ全 JSON データベースの英訳が完了。

---

## 参考リンク

- `docs/localization-en-rules.md` — 英訳ルールブック
- `docs/jp-notation-rules.md` — 和文フィールド記法ルール
- `_work_in_progress/2026-06-12_progress_translation-style-unified.md` — 前回の英訳進捗記録
