# AppearanceDetail データクリーンアップ（#5〜99 一括変換）

## 目的

`data/Works_NumberTales/DataBases/db_Primary.json` の `AppearanceDetail` において、
#1〜4 で User が手動調整したデータ構造に合わせて #5〜99 を自動変換する。

---

## 変更点の要約

Node.js スクリプト（インライン、スクラッチパッド実行）で 3 ステップ変換を適用:

### Step 1: `#Element_Expression` 変換（71 件）

- **判定条件**: BodyPart が null / `[]` / `["#BodyPart_Head"]` のみ、かつ全 Attrs が表情キーワードと一致
- **除外対象**: `#Element_TailsUnit`, `#Element_Ear`, `#Element_NumberMark`, `#Element_Emblem`, `#Element_Expression`
- **変換内容**: `DesignElement` を `"#Element_Expression"` に変更、`BodyPart` を `null` に統一
- **表情判定キーワード（JP）**: 表情・笑顔・笑み・微笑み・微笑・にっこり・ニヤリ・無表情・眼差し・顔つき・顔付き・眠そう・な顔・そうな顔

### Step 2: Formation 統合（282 件 → 141 ペア統合）

- **判定条件**: humanoid + corefolder の同キャラ内で `DesignElement` / `BodyPart` / `Attrs` / `Laterality` が完全一致（`JSON.stringify` 比較）
- **除外対象**: `#Element_TailsUnit`, `#Element_Ear`（形態差異あり）
- **変換内容**: humanoid 側の `Formation` を `null` に変更、corefolder 側を削除

### Step 3: CostumeItem の BodyPart 推論（113 件割り当て、6 件手動待ち）

- `DesignElement === "#Element_CostumeItem"` かつ `BodyPart` が null または空の要素が対象
- `Attrs[].value_JP` をキーワードマッチ（括弧内表記を除去してからマッチ）
- 最初にマッチしたルールを採用（優先順あり）

---

## 影響範囲（編集ファイル）

- `data/Works_NumberTales/DataBases/db_Primary.json` — 唯一の変更対象（変換後サイズ: 1,717,508 bytes）

---

## テスト結果

変換後に `npm test` 実行 → **136/136 PASS** ✅

---

## 手動入力待ちの項目（6 件）

以下の CostumeItem は `BodyPart` が未割り当てのまま。User による手動入力が必要:

| キャラ | value_JP                 | 理由                                     |
| ------ | ------------------------ | ---------------------------------------- |
| Num:6  | 六角形のブローチ         | ブローチの装着位置が文脈から不明         |
| Num:33 | 大きなピンクのボウリボン | リボンの装着位置（頭・首・腰など）が不明 |
| Num:35 | 2パターンの衣装          | BodyPart 複数該当のため汎用除外          |
| Num:60 | 2パターンの衣装          | 同上                                     |
| Num:61 | 2パターンの衣装          | 同上                                     |
| Num:65 | 青いリボンアクセント     | リボンの装着位置が文脈から不明           |

---

## 発見した既存データ不整合（自動修正なし・手動確認推奨）

### Num:8 — corefolder の JP/EN 値スワップ

corefolder の要素 4〜7 で、JP と EN の値が隣接要素間でスワップされている状態。
（例: 要素 4 の value_EN が要素 5 の内容、要素 5 の value_EN が要素 4 の内容、など）
→ Attrs の `JSON.stringify` 比較が一致しないため、Formation 統合は正しくスキップ済み。
→ ただし表示時に JP/EN が混在する可能性あり。**手動修正推奨。**

### Num:32 — corefolder の重複 Attrs + Emblem 混在

- corefolder の全 Attrs が重複して格納されている（1 属性が 2 回リストされる）
- Emblem 要素に「自信ありげな表情」（表情系）と「頬に黄色い横線メイク」（Emblem 系）が混在
- 重複 Motif 要素も存在
  → **手動修正推奨。**

### Num:60 — humanoid の表情 + 衣装混在要素

humanoid 側の 1 要素に以下が混在:

- 「凛とした美しい顔つき」「感情的で好意にまっすぐな表情(推し活中)」（→ 表情）
- 「ピンクのハチマキ(ヲタク衣装)」（→ CostumeItem）

allAttrsExpression が false になるため Expression 変換はスキップ済み（正しい挙動）。
→ 要素を分割するには**手動修正が必要。**

---

## 第2回推敲（2026-06-30 続き）

User が #1〜8 を手動調整後、同様のパターンを #9〜99 に適用した。

### 適用した変更（22 件）

| 対象                                              | 内容                                                 |
| ------------------------------------------------- | ---------------------------------------------------- |
| Num:33 [7] "大きなピンクのボウリボン"             | BodyPart null → `["#BodyPart_Hair"]`（三つ編み末端） |
| Num:33 [10] "白いフリルカラー"                    | Motif → CostumeItem + `["#BodyPart_Neck"]`           |
| Num:46 [6] "溌剌としていてどこか落ち着きのない顔" | Motif → Expression（humanoid 固有表情）              |
| Num:61 [13] "青い靴"                              | Motif → CostumeItem + `["#BodyPart_Foot"]`           |
| Num:65 [7] "青いリボンアクセント"                 | BodyPart null → `["#BodyPart_Neck"]`（画像確認）     |
| Num:71 [3] "かんざし付きの青いポニーテール"       | Motif → CostumeItem（かんざし = 物理アクセサリー）   |
| Num:71 [9] "青い靴"                               | Motif → CostumeItem + `["#BodyPart_Foot"]`           |
| Num:73 [11] "赤い靴"                              | Motif → CostumeItem + `["#BodyPart_Foot"]`           |
| Num:74 [9] "灰色の下駄"                           | Motif → CostumeItem（BP:Foot 維持）                  |
| Num:75 [10] "黄色い靴"                            | Motif → CostumeItem + `["#BodyPart_Foot"]`           |
| Num:76 [8] ネクタイスカーフ                       | 重複 Attrs を除去（1件→正常）                        |
| Num:76 [6]/[8] ネクタイスカーフ                   | 重複除去後に同一確認 → Formation null でマージ       |
| Num:76 [14→13] "青い靴"                           | Motif → CostumeItem + `["#BodyPart_Foot"]`           |
| Num:88 [12] "青い靴"                              | Motif → CostumeItem + `["#BodyPart_Foot"]`           |
| Num:96 [10] "ハイヒール(普段着)"                  | Motif → CostumeItem（BP:Foot 維持）                  |

テスト: **136/136 PASS** ✅

## 第3回推敲（2026-06-30 続き2）

### #Element_EarUnit → #Element_Ear グローバル化（User 対応）

- User が `db_Primary.json` 全 EarUnit (92件) を `#Element_Ear` に一括改名
- `data/db_meta.json` にグローバル宣言 (`DesignElement_JP: "耳の形状"`) を追加
- JS コードに EarUnit ハードコードなし → 動作影響なし、テスト 136/136 PASS ✅

### Num:33 [8] 条件付き混在要素の分割

元: `#Element_CostumeItem` BP:Head で 3 Attrs を 1 要素にまとめていた  
→ EN 値のシフトズレ（TailsUnit の EN が誤混入）も同時修正

分割後:
- [8] `#Element_Expression` BP:null "高慢な表情（オンラインモード）" / "haughty expression (online mode)"
- [9] `#Element_Expression` BP:null "涙目の表情（オフラインモード）" / "teary expression (offline mode)"
- [10] `#Element_CostumeItem` BP:Head "耳を覆うメイドキャップ" / "ear-covering maid cap"

### Num:76 髪の EN 値統一 → Formation マージ

- humanoid EN `"dark blue medium-long hair"` → `"navy blue medium-length hair"` (より自然な英文を採用)
- corefolder / humanoid が一致 → Formation: null でマージ完了

テスト: **136/136 PASS** ✅

## 第4回推敲（2026-06-30 続き3）

User が #1〜12 を手動調整した内容を基に、#13 以降の `AppearanceDetail` を推敲した。

### 修正対象と内容

| 対象     | カテゴリ                              | 内容                                                                          |
| -------- | ------------------------------------- | ----------------------------------------------------------------------------- |
| Num:33   | JP/EN カスケードずれ + AttrLabel 欠落 | entry[4] EN 修正 / entries[8,9,10] AttrLabel 補完 / entries[11,12,13] EN 修正 / entries[5,14] 孤立エントリ削除 |
| Num:42   | JP/EN カスケードずれ + Formation 修正 | entry[4] Formation corefolder→null / entries[6,7] EN 修正 / entry[8] 重複削除 |
| Num:48   | JP/EN カスケードずれ + 孤立エントリ   | entries[4,5] EN 修正 / entry[6] 孤立エントリ削除                             |
| Num:81   | Formation 修正                        | entry[4] Formation corefolder→null                                            |
| Num:88   | JP/EN カスケードずれ（大）+ EN 欠落   | entries[3,4,13,14] 孤立エントリ削除 / entry[5] EN 補完 / entries[6〜12] EN 修正 |
| Num:93   | Formation 修正                        | entry[4] Formation corefolder→null                                            |

### 観察事項（要確認）

- **Num:93 entry[5] EN の不整合**: entry[5] humanoid/Hair の JP は `"白いヘアバンド付き黄色い長い髪"` (long hair) だが EN は `"short yellow hair with white headband"` のまま。entry[4] (null, short hair) のENが流用されている可能性あり → User 確認・手動修正推奨。

テスト: 未実行（実行推奨）

## 未完了タスク

- [ ] Num:35 / 61 の `"2パターンの衣装"` BodyPart — User が手動対応予定（待機中）
- [ ] Num:60 [9] humanoid: 表情 + ハチマキ(ヲタク衣装)が混在 → 同様の分割方針を適用するか User 確認が必要
- [ ] Num:93 [5] humanoid/Hair: EN "short yellow hair with white headband" → "long yellow hair with white headband" か否か User 確認
- [ ] `git commit` — 変換済みデータをコミット（User 確認後）

---

## 参考リンク

- 変換スクリプトのロジック詳細: コンテキスト内 Node.js インライン実行（スクラッチパッド）
- 関連進捗: `2026-06-29_progress_appearance-detail-merge-integration.md`
- テスト: `tests/data.sanity.test.js` / `tests/data.shape.test.js` / `tests/sw.enrich.basic.test.js` / `tests/enrich.dblink.jump.merge.test.js`
