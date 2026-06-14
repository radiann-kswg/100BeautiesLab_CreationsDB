# 和英ローカライズ ルールブック

> **対象**: Claude Code / GitHub Copilot / その他 AI 翻訳ツール  
> **目的**: 100BeautiesLab. Creations DB の全作品における `_EN` フィールドの英訳を、既存実装と一貫した形式で生成・補完するための規則集  
> **最終更新**: 2026-06-14

---

## 0. 最優先原則

1. **既存の `_EN` 値を上書きしない**: `field_EN` が存在し、かつその値が対応する `field`（JP）の値と異なる場合は上書き禁止（すでに人間が監修した英訳）。
2. **スキーマ駆動**: `db_type.json($DefType)` に登録されていないフィールドへ `_EN` を勝手に追加しない。
3. **キー順序**: `field_EN` は必ず対応する `field`（JP）の **直後** に挿入する。末尾への追記は禁止。
4. **コード生成時のパターン**: `Object.assign` を使わず、`insertAfterKey()` + `db.map()` パターンを使う（→ [実装メモ](#実装メモ)）。

---

## 1. 代名詞ルール（GenderType 別）

| GenderType | 代名詞 | 備考 |
|---|---|---|
| `FemaleNeutral` | `she` / `her` | |
| `MaleNeutral` | `he` / `him` | |
| `Female` | `she` / `her` | |
| `Male` | `he` / `him` | |
| `Neutral` | `ze` / `zir` | ネオプロナウン。**`they/them`・`he/she`・`him/her` は使わない** |
| `undefined` / 未設定 | 代名詞を避ける | 名前やキャラクター呼称で代替 |

### 1-1. `ze/zir` 活用一覧（Neutral キャラクター専用）

| 文法役割 | 形式 | 例 |
|---|---|---|
| 主格（Subject） | `ze` | `Ze is a NumberTales who...` |
| 目的格（Object） | `zir` | `...serving zir master` |
| 所有格（Possessive adj.） | `zir` | `...zir unique ability` |
| 再帰（Reflexive） | `zirself` | `Ze did it zirself` |
| 文頭大文字 | `Ze` / `Zir` / `Zirself` | 文頭では大文字化 |

> **非標準複合形への注意**: `him/herself` や `his/herself` は英語の慣習で `himself/herself` の代わりに書かれることがある。これらも `zirself` に置換する。
> 
> **`ThirdPersonCalling_EN` は対象外**: `彼/彼女` → `he/she` のように「このキャラが他者を呼ぶスタイル」を示す呼称フィールドは、キャラクター自身の代名詞ではないため `ze` に変換しない。

### 1-2. 世界観的背景（なぜ `ze/zir` を採用したか）

ナンバーテールズ（数秘術ベースの霊獣型）・運命線探偵78（異能調査者）・獣爾騎兵（獣人型改造人間）等は「人間の性別概念から外れた存在」として設定されている。英語圏の創作においても `ze/zir` は「第三の性を持つ種族・神霊・人間以外の知性体」の代名詞として機能することが確認されており、百花繚乱研究所の創作世界観の英語演出として採用した。（参考: ChatGPT「Ze Zir 言語学文化分析」2026-06-14）


---

## 2. 固有名詞マッピング（確定済み）

| JP 表記 | EN 表記 | 備考 |
|---|---|---|
| `百(ハゲム)` | `Hudret` | Num 00「Hudret Norumber」の略称 |
| `零(レイ)` | `Zera` | 開発者キャラ。`Rei` は不正解 |
| `サンジ(惨事)` | `Troubleforcer` | Num 34 の通称 |

---

## 3. フィールド別英訳ルール

### 3-1. `CodeName_EN`

**ルール**: 漢数字を1桁ずつ対応する英語数詞に変換し、ハイフン（`-`）で連結する。

| 漢字 | 英語 |
|---|---|
| 〇 | Zero |
| 一 | One |
| 二 | Two |
| 三 | Three |
| 四 | Four |
| 五 | Five |
| 六 | Six |
| 七 | Seven |
| 八 | Eight |
| 九 | Nine |

**実例:**

| JP | EN |
|---|---|
| `一` | `One` |
| `(二)` | `(Second)` ※特殊例外：括弧保持、Second |
| `一〇` | `One-Zero` |
| `六六` | `Six-Six` |
| `七〇` | `Seven-Zero` |
| `(二〇)` | `(Two-Zero)` ※括弧は保持 |

**注意**: `七〇` = `Seventy` ではなく `Seven-Zero`。複合英数詞（Seventy, Sixty-six 等）は使わない。

**作品固有の CodeName_EN** は全く別体系なので注意:  
- FLInvestigator78: タロットカード名（`Fool`, `Magician`, `High-Priestess` 等）  
- SinisterChangingGirls: `Lust o'clock in Midnight` 等  
- DestinyFoxRecords: SI 単位系（`Metre_SI-L`, `Kelvin_SI-Θ` 等）

---

### 3-2. `TailsUnit_EN`（NumberTales 固有）

**基本形式**（枝分かれ型）:

```
Fox (branched) type: N tails (upper: X clusters xY, lower: Z clusters xW)
```

- `xY` = その上段/下段グループの合計本数（束の数 × 本数）
- `upper:` と `lower:` は存在する束グループの分だけ記載

**単一クラスターのみの場合**:

```
Fox (branched) type: N clusters xM tails
```

**単純型**（枝分かれなし）:

```
Single fox-type tail
Twin fox-type tails
Three fox-type tails
... Nine fox-type tails
Seven fox-type tails  ← Seven は既存値があれば保持
```

**特殊型**:

```
Single bud-type tail (1 large cluster + 9 small clusters)
Eleven nekomata-type tails
Two scorpion-type tails (each with 11 clusters/segments)
```

**実例（Num 66〜70）**:

| Num | EN |
|---|---|
| 66 | `Fox (branched) type: 2 clusters x6 tails` |
| 67 | `Fox (branched) type: 7 tails (upper: 2 clusters x6, lower: 1 cluster x1)` |
| 68 | `Fox (branched) type: 8 tails (upper: 2 clusters x6, lower: 1 cluster x2)` |
| 69 | `Fox (branched) type: 9 tails (upper: 2 clusters x6, lower: 1 cluster x3)` |
| 70 | `Seven fox-type tails` ※既存値を保持 |

---

### 3-3. 呼称フィールド（`*PersonCalling_EN` / `ForMasterCalling_EN`）

#### 3-3-1. JP フィールドの書式規則

JP `*Calling` フィールドは次の書式を持つ：

- **セミコロン `;`**: カテゴリ区切り（代名詞 → 指示表現 → 敬称/参照形の優先順）
- **スラッシュ `/`** または **カンマ `,`**: 同カテゴリ内の複数候補
- **`*xxx`**: 指示・代名詞のショートカット（`*いつ`, `*れ`, `*の子` 等）
- **`~`**: 名前プレースホルダー（例: `~さん` = `[Name]-san`）
- **`[※xxx]`**: 参照形（例: `[※名前呼び]`, `[※二人称]`）
- **`\n`**: 文脈別の複数パターン区切り

EN でもこの構造（`;`, `/`, `\n`）をそのまま維持する。

#### 3-3-2. 共通翻訳ルール

| 要素 | EN 翻訳 | 備考 |
|---|---|---|
| `[※名前呼び]` | `[*by name]` | 統一表記 — `[*Name calling]` は使わない |
| `[※二人称]` | `[*second-person calling]` | 統一表記 |
| `[※三人称]` | `[*third-person calling]` | 統一表記 |
| `[※その時により変わる]` | `[*Varies depending on the situation]` | |
| `彼/彼女` | `he/she` | ThirdPersonCalling 内では GenderType 非依存 |
| `あんた` | `guy/girl(s) (anta; rough)` | `you (anta)` は使わない |
| romaji 注釈 | `(romaji; 補足)` | 括弧**内**に全注釈を収める |
| 例外付き注釈 | `(*shi; exceptions apply)` ○ / `(*shi); exceptions apply` ✗ | |
| 複数文脈 | `\n` で区切る | JP と同じ区切り数を維持 |

#### 3-3-3. 指示表現（`*` 系）の EN 翻訳

| JP 指示表現 | EN 翻訳 | 用法 |
|---|---|---|
| `*いつ` / `*イツ` | `this/that/who/what/which/them (as personal or objective)` | あいつ/こいつ系・主語目的語両用 |
| `*れ` / `*レ` | `this/that/who/what/which/them (as objective)` | あれ/それ系・主に目的語 |
| `*いつ/*れ`（組み合わせ） | `this/that/who/what/which/them (as personal or objective)` | 両用 |
| `*ちら` | `that/this person (*chira, formal)` | 丁寧な指示 |
| `*やつ` / `*奴(*やつ)` | `that fellow (*yatsu)` または `that guy/gal (*yatsu)` | 粗野な指示 |
| `*の方` | `that person` | 丁寧・ロマナイズ不要 |
| `*の人` | `that/this person` | 中立・ロマナイズ不要 |
| `*の子` | `that/this/which kid` | カジュアル |
| `*の子/*っち` | `that/this/which kid (*no-ko), ~-cchi` | バリアント統合 |
| `*の子;~(な)コ` | `that/this kid (*no ko; ~na ko)` | バリアント統合（括弧内） |
| `*の者` | `that/this/which one (as personal)` | 格式ある指示 |

> **注意**: `"that/this/who/which/them guy/girl"` 形式や `"that/this/whom one"` 形式は旧パターン。新規翻訳では上記の `(as personal or objective)` / `(as objective)` 形式を使う。

#### 3-3-4. 敬称サフィックスの EN 変換

| JP 敬称 | EN 変換 | 備考 |
|---|---|---|
| `~君` / `~クン` | `~-kun` | `Mr/Ms.~` は不正解 |
| `~さん` / ロール名+さん | `~-san` / `Client-san` 等 | ロール名はそのまま前置 |
| `~ちゃん` | `~-chan` | |
| `~殿` | `~-dono` | |
| `~様` / `~さま` | `~-sama` または `sir/lady.~(~-sama; very honorific)` | |
| `~先輩` | `~-senpai` / 単独では `senpai` | |
| `~(な)コ` | `~-na-ko (adjectival)` | |
| `~(な)ヤツ` | `~ one (*na yatsu; adjectival)` | |

#### 3-3-5. `ThirdPersonCalling_EN` 書式

**標準形 1（代名詞あり）:**
```
he/she; [指示表現 or 敬称/参照形]; [*by name or 参照]
```

**標準形 2（代名詞なし）:**
```
[指示表現 or 敬称/参照形]; [*by name or 参照]
```

実例（NT db_Primary の Num を参照）:
```
"he/she; [*by name]"                                                          ← Num 3
"he/she; ~-kun/~-san"                                                         ← Num 19
"[*by name]"                                                                  ← Num 11
"this/that/who/what/which/them (as personal or objective); [*by name]"        ← Num 18, 32, 41
"he/she; this/that/who/what/which/them (as objective); [*by name]"            ← Num 17
"he/she; that/this/who/which/what/them (as personal or objective); [*by name]" ← Num 23
"that person, that fellow (*yatsu); ~-dono"                                   ← Num 7
"~-san\nsenpai (*toward NumberTales)"                                         ← db_Secondary 0xB
"~-dono / this/that/who/what/which/them (*itsu, as personal or objective)"    ← db_Secondary 0xE
```

文脈注釈（`ナンバーテールズに対して：先輩` 等）→ `senpai (*toward NumberTales)` 形式で `\n` 区切り。

#### 3-3-6. `ForMasterCalling_EN` 書式

| パターン | 書き方 | 備考 |
|---|---|---|
| 名前プレースホルダー | `~` | チルダ記法 |
| ロール称号+名前 | `Instructor.~` / `Trainer.~` | ピリオド+チルダ |
| 敬称+名前 | `~-senpai` / `~-kun` | チルダ-ダッシュ-単語 |
| 先生 | `Teacher [Name]` | 名前の前 |
| ～兄さん/姉さん | `~-bro/sis (-niisan/-neesan), big bro/sis` | |
| 角括弧参照型 | `[*Adapts to the master's preferences]` | `[Free Style]` ラベルは含めない |
| 括弧内注釈 | `Master.~ (*shi; exceptions apply)` | 括弧を閉じる前に全注釈を収める |
| ロール名+さん | `Client-san` 等 | `クライアントさん` → `Client-san`（`Client` のみは不正解） |
| 複数の呼び方 | `\n` で区切る | |

複数候補をスラッシュ区切りにする場合、共通修飾語は前置：  
`Holy Father/Mother`（`Father / Holy Mother` ではない）

#### 3-3-7. `FirstPersonCalling_EN` 書式

| JP 一人称 | EN 形式 |
|---|---|
| `ぼく` / `僕` | `I (boku; masc. casual)` |
| `オレ` / `俺` | `I (ore; masc. rough)` |
| `わたし` / `私` | `I`（女性マーカー不要なら省略可） |
| `ママ` | `Mama` |
| `こっち` | `I/me (kocchi; informal self-ref.)` |
| `オイラ` | `I (oira)` |
| `俺っち` | `I (orecchi)` |
| 方言・古語 | `I (archaic masc. dialect)` 等コンテキスト注釈を付ける |
| 複数の一人称（文脈別） | `\n` で区切る |

#### 3-3-8. `SecondPersonCalling_EN` 書式

| JP 二人称 | EN |
|---|---|
| `あなた` | `you (neutral/polite)` |
| `あなた様` | `you (very polite)` |
| `あんた` | `guy/girl(s) (anta; rough)` |
| `キミ` / `君` | `you (familiar)` |
| `お前` / `おまえ` | `you (omae; rough/familiar)` |
| `[※三人称]` | `[*third-person calling]` |
| `貴殿(きでん)` | `your lordship (kiden; rare)` |
| 名前呼び | `[*by name]` |

#### 3-3-9. DB 別 ThirdPersonCalling_EN 対応状況

| DB | 状況 |
|---|---|
| NT db_Primary | 全件あり（2026-06-14 修正: Num 5/7/14/19/32/40/41/51） |
| NT db_SemiPrimary | 全件あり（2026-06-14 修正: 200-dev） |
| NT db_Secondary | 0xA–0xF 追加済（2026-06-14）。他レコードに ThirdPersonCalling なし |
| FL db_Primary | 全件あり |
| FL db_PrimaryDealer | 全件あり（2026-06-14 修正: `*のこ` / `~君` 各1件） |
| DestinyFoxRecords | 全件あり |
| ShouArRiders | 全件あり |
| Proxies | 全件あり |
| PastDivers | 全件あり |
| SinisterChangingGirls | 未確認（要チェック） |
| UnauthedLogica | 未確認（要チェック） |

---

### 3-4. `Character_EN` / `Hobby_EN` / `SpecialSkill_EN` / `Favor_EN` / `Unlike_EN`

- 複数行は `\n` で区切る
- `Unlike_EN`: 日本語ネットスラング系補足（例: `'G'`）は省略し主要語のみ記載
- `hideText` オブジェクトの場合: `{ hideText: '???' }` の sibling として `_EN` キーを追加

---

### 3-5. `NumerospecAbout_EN`（NumberTales 固有）

1〜2行の簡潔な説明文。複数行は `\n` で区切る。  
主語を省いた体言止め or 動詞句で統一:

```
"Guarantees mental and physical health"
"Makes others declutter\nThis eliminates waste and excess from the master's daily life"
"Shares the blessings of prayer"
```

---

### 3-6. `Summary_EN`

- 既存値が JP と異なる（人間監修済み）場合は上書き禁止
- 2〜4段落が多い。段落間は `\n` 区切り（`\n\n` ではなく `\n`）
- キャラクター名は `'N(Name)'` 形式（例: `'96(Rota)'`）
- he/she は GenderType に従う（→ セクション 1）
- セリフを引用する場合はダブルクォート: `"I want a body where hard work never betrays me."`

---

### 3-7. `Backgrounds_EN` / `InStory_EN` / `RelationNotes_EN`

**`Backgrounds_EN`**: 1〜2文の背景情報。固有名詞（人名・型番等）はそのまま保持。

**`InStory_EN`**: 作品内の役割・立場説明。特殊ユニット型は `"Unit.N+M type"` 形式。

**`RelationNotes_EN`**: 各キャラとの関係メモ。  
- キャラクター名: `'N(Name)'` 形式（例: `'6(Sics)'`）または `\"Quoted Name\"` 形式  
- 独自の呼称スタイルを持つキャラは、そのスタイルをそのまま反映:  
  例) `Looks up to '6(Sics)' as her "Sister.6(Sics)"`（`nee-sama` というロマナイズより実際の呼称形式）
- 複数行は `\n` で区切る

---

### 3-8. `Relation.Comments_EN`

**フォーマット**: ダブルクォートで囲む（JSON 内ではエスケープ `\"`）

```json
"Comments_EN": "\"A truly wonderful person.\""
```

**上書き条件**: `entry.Comments_EN === entry.Comments`（= まだ JP のまま）の場合のみ上書きする。

**代名詞**: 言及対象キャラの GenderType に従う（→ セクション 1）。例外なし。

**セリフ形式**: 台詞はそのままの文体を保つ。  
- `w`（笑）→ `hehe`（`lol` は使わない）  
- `はぁ…` → `*Sigh*...`  
- 絵文字（`♡` `♪` `☆` `★`）は JP 原文のまま保持（`♥` 等に変換しない）

---

### 3-9. `ConversationPattern` 配下の英訳フィールド

`ConversationPattern` オブジェクトに以下の `_EN` フィールドを対応する JP フィールドの直後に挿入:

| JP フィールド | EN フィールド |
|---|---|
| `TalkingTone` | `TalkingTone_EN` |
| `TopicPreference` | `TopicPreference_EN` |
| `TalkFrequency` | `TalkFrequency_EN` |
| `PreferredTopics` | `PreferredTopics_EN` |
| `AvoidedTopics` | `AvoidedTopics_EN` |
| `ConversationNotes` | `ConversationNotes_EN` |

**`DialogueExamples`（DE）の処理**:

```json
{
  "value_JP": "（JP の台詞）",
  "value_EN": "（翻訳した台詞）",
  "about": "（JP の状況説明）",
  "about_EN": "（翻訳した状況説明）"
}
```

- 元のフォーマット:
  - `value` が文字列 → `value_JP` にリネーム、`value_EN` を追加
  - `value` がオブジェクト `{value: "..."}` → `value_JP` にリネーム、`value_EN` を追加
- `about` が存在し `about_EN` が未存在の場合のみ `about_EN` を追加

---

## 4. 作品別固有ルール

### 4-1. NumberTales

- `TailsUnit_EN`: セクション 3-2 参照
- `CodeName_EN`: 漢数字→桁別英語数詞（セクション 3-1）
- `NumerospecAbout_EN`: 体言止め or 動詞句
- `corefolder` は**全文小文字**（`CoreFolder` ではない）

### 4-2. FLInvestigator78

- `CodeName_EN`: タロットカードの公式英語名（例: `High-Priestess`, `Hermit`）
- `ArcanamspecAbout_EN`: NumerospecAbout_EN と同じ形式
- `EffectText_EN`: ランク説明固定文（例: `"Dangerous"`, `"No Benefit"`, `"Expected"`）
- `For79thDealerCalling_EN` / `For80thDealerCalling_EN`: ForMasterCalling_EN と同形式

### 4-3. ShouArRiders

- `BeastspecName_EN`: 獣の属性を英訳した固有名詞
- `BeastspecAbout_EN`: NumerospecAbout_EN と同形式

### 4-4. PastDivers

- `ChronoholderName_EN`: `ChronoRize`, `ChronoFreeze` 等の固有 EN 名
- `ChronospecName_EN`: 詩的な英語表現（`"Beginning of Impulse"` 等）
- `ChronoizedAbout_EN`: 複数段落可

### 4-5. DestinyFoxRecords / Proxies

- `CodeName_EN`: SI 単位系（`Metre_SI-L`, `Kelvin_SI-Θ` 等）
- `InStory_EN` / `Backgrounds_EN`: メタキャラクター向けの簡潔な説明

---

## 5. フォーマット・表記規則

### 5-1. 括弧・ブラケット

| 用途 | 記法 | 例 |
|---|---|---|
| 参照・補足 | `[*説明]` | `[*by name]`, `[*Adapts to the master's preferences]` |
| ロマナイズ注釈 | `(romaji; 補足)` | `(ore; masc. rough)`, `(shi; exceptions apply)` |
| 注釈のセミコロン | 括弧**内**に収める | `(*shi; exceptions apply)` ○ / `(*shi); exceptions apply` ✗ |

### 5-2. 特殊ユニット・役職名

| JP | EN |
|---|---|
| `Unit.N+M 型` | `Unit.N+M type` |
| `～教官` | `Instructor.~` |
| `～トレーナー` | `Trainer.~` |
| `先生` | `Teacher [Name]` |
| `～先輩` | `~-senpai` |
| `～君/くん` | `~-kun` |
| `～ちゃん` | `~-chan` |
| `～兄さん/姉さん` | `-bro/sis (-niisan/-neesan), big bro/sis` |

### 5-3. 絵文字・特殊文字

| JP 原文 | EN 処理 |
|---|---|
| `♡` | そのまま `♡`（`♥` に変換しない）|
| `♪` | そのまま `♪` |
| `☆` / `★` | そのまま `☆` / `★` |
| `w`（笑） | `hehe` |
| `はぁ…` | `*Sigh*...` |
| `（※検閲で削除されている…）` | `(* censored...)` |

### 5-4. 架空コンテンツ名

JP タイトル + ローマ字副題（`タイトル(ローマ字副題)` 形式）の場合、ローマ字副題のみを使用:  
例) `御伽の電子妖精(テールズ ｅ-フェアリーズ)` → `Tales e-Fairies`

---

## 6. スキップ条件

以下の場合は `_EN` フィールドを追加・変更しない:

1. `field_EN` がすでに存在し、値が対応 JP フィールドの値と**異なる**（人間監修済み）
2. 対応する JP フィールドが `null` または空文字列
3. 対応する JP フィールドが `hideText` オブジェクトで、かつ `_EN` 版の追加場所が定義されていない
4. `_Search` で複数レコードにマッチする参照（ambiguous reference）

---

## 7. 実装メモ（スクリプト向け）

### キー順序を保つ insertAfterKey パターン

```javascript
function insertAfterKey(obj, baseKey, enKey, enValue) {
  if (enKey in obj) return obj;  // すでに存在する場合はスキップ
  const keys = Object.keys(obj);
  const idx = keys.indexOf(baseKey);
  const result = {};
  if (idx === -1) {
    for (const k of keys) result[k] = obj[k];
    result[enKey] = enValue;
  } else {
    for (let i = 0; i <= idx; i++) result[keys[i]] = obj[keys[i]];
    result[enKey] = enValue;
    for (let i = idx + 1; i < keys.length; i++) result[keys[i]] = obj[keys[i]];
  }
  return result;
}

// 必ずこのパターンで使う（Object.assign は使わない）
db = db.map(rec => {
  if (rec.Num !== TARGET_NUM) return rec;
  let current = rec;
  current = insertAfterKey(current, 'FieldJP', 'FieldJP_EN', 'EN value');
  // ... 追加フィールド分だけ current = insertAfterKey(...) を連鎖
  return current;
});
```

**禁止パターン**: `Object.assign(rec, insertAfterKey(...))` — 新規キーが末尾に追記されキー順序が崩れる。

### Comments_EN の上書き判定

```javascript
function setCommentEN(record, type, targetNum, enText) {
  const entries = record.Relation?.[type];
  if (!entries) return;
  for (const entry of entries) {
    // String() で比較することで "00"（文字列）も安全にマッチ
    if (String(entry.Num) === String(targetNum)
        && entry.Comments
        && entry.Comments_EN === entry.Comments) {
      entry.Comments_EN = enText;
    }
  }
}
```

---

## 8. 参照先ドキュメント

| 対象 | 参照先 |
|---|---|
| スキーマ全体 | `data/db_type.json ($DefType)` |
| API/SW 仕様 | `docs/api-sw-spec.md` |
| 実装方針 | `docs/implementation-playbook.md` |
| 英訳作業進捗 | `_work_in_progress/2026-06-12_progress_translation-style-unified.md` |
