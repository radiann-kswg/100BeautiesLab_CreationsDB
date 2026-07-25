# `addon-ai-tag`: develop 取り込みマージ + 着手順4番の状態確認（2026-07-25）

## 目的

2026-07-25 の `develop` 側作業（進捗ログの棚卸し・タスク統合母艦の新設・配布物の体裁修正・
英語 README の刷新ほか）を `develop` → `addon-ai-tag` の一方向マージで取り込む。
あわせて、統合母艦で **着手順 4 番**とされた **T-02（AIHints への配色導出 `--apply-colorpalette`）** を消化する。

> ブランチ運用方針（`AGENTS.md`）: `develop` → `addon-ai-tag` の一方向マージのみ。逆マージは禁止。

## 1. マージ実行と衝突解消

- マージ: `develop`（`55476f1`）→ `addon-ai-tag`（`237b194`）。マージコミット **`6f68df3`**。
- 取り込んだ `develop` コミット **5 件**:
  - `b737891` 進捗ログ追加（AIHints 再同期 CI 失敗の原因特定と復旧）
  - `5f4ff16` 進捗ログ整備（棚卸し・着手順の明文化）
  - `58aed8f` 重要タスク・インシデント対応 その１（配布物の体裁修正 / UI-SW マージ統一 / `OfficialLinks`）
  - `542700e` 重要タスク・インシデント対応 その２（`docs/readme.en.md` 刷新）
  - `55476f1` 進捗ログ整備（統合母艦 `2026-07-25_remaining-task.md` の新設）
- コンフリクトは **2 ファイル**: `docs/api-sw-spec.md` / `_work_in_progress/README.md`。
- `data/Works_NumberTales/DataBases/db_Primary.json`（本ブランチは AIHints 92 件を持つ）や
  `tools/patch-aihints.mjs` は変更領域が重ならず**自動マージ成功**。

### 1-1. `docs/api-sw-spec.md`（⚠️ 片側採用だと本ブランチの記述が消えるケース）

実 API エンドポイント表で、両側が**別々の行を足していた**。

| 側 | 追加内容 |
| --- | --- |
| `addon-ai-tag`（HEAD） | `/api/ai/:work/:db/aihints` / `/api/ai/:work/:db/aihints/:idx` の **2 行**（要 Bearer 認証） |
| `develop` | `/api/v1/works` の説明へ `Works_OfficialLinks[]` を追記 |

**排他ではないため両方を保持**して解消した。着手時点では develop 側が丸ごと採られており、
**AIHints エンドポイント 2 行が失われていた**ため、`git show HEAD:` で元の記述を復元して統合している。

### 1-2. `_work_in_progress/README.md`（⚠️ こちらは逆に develop 側が消えていた）

着手時点では `addon-ai-tag` 側が丸ごと採られており、develop 側の 2026-07-25 分
（索引の母艦ポインタ化 / 退避一覧 2 節 / 整理履歴 3 エントリ）が入っていなかった。
一方で `addon-ai-tag` 側にしか無い情報も多く、**どちらを丸ごと採っても情報が落ちる**状態だった。

**develop 側を土台に、本ブランチ固有の要素を移植**して解消した。

| 保持した本ブランチ固有の要素 | 内容 |
| --- | --- |
| ブランチについての注記 | 「`_work_in_progress/` はブランチ間で内容が分岐する」旨 |
| 退避一覧 3 節 | `2026-07-14 addon-ai-tag 棚卸し（4件・本ブランチ固有）` / `2026-07-04（addon-ai-tag固有・10件）` / `addon-ai-tag ブランチ固有（2026-06-11・AIHints初期実装系）` |
| 表記差のある 4 節 | `2026-07-16（6件・develop 由来）` / `2026-07-08（9件・うち1件は addon-ai-tag 固有）` / `2026-07-04（develop由来・22件）` / `2026-07-03 以前（addon-ai-tag棚卸し分を含む）` |
| 整理履歴 | 本ブランチ固有のエントリ **9 件**（develop 版で上書きすると全て失われるところだった） |

**あわせて「本ブランチ（`addon-ai-tag`）固有の進捗ログ」節を新設**した。
統合母艦 `2026-07-25_remaining-task.md` は `develop` 由来のため、**AIHints 関連の固有ログは母艦の索引に載らない**。
その索引を README 側が引き受ける構成にしている。

---

## 2. 着手順4番（T-02）の状態確認 — **すでに完了していた**

統合母艦 `2026-07-25_remaining-task.md` の **T-02** は、`develop` 側の情報だけを根拠に
次のように記載されていた。

> ❌ **`ColorPalette` → `palette_priority` の導出モードが無い**
> 現状は本体 DB に色があるのに AIHints からは見えず、**92/92 件 `null` のまま**

**この記載は誤りで、本ブランチでは実装・適用ともに完了済み**だった。実データとコードで裏取りした。

### 2-1. 実装の確認

| 項目 | 実測（2026-07-25） |
| --- | --- |
| CLI オプション | ✅ `--apply-colorpalette`（`tools/patch-aihints.mjs:137`） |
| 実装関数 | ✅ `applyColorPaletteToAihints()`（`:2670`） |
| 確定値の保護 | ✅ `--force-palette` で明示しない限り既存の確定値を上書きしない（`:263`） |
| ドキュメント | ✅ `docs/ai-hints-usage.md` §9.11（2026-07-14 の棚卸しで追記済み） |

### 2-2. 実データの確認（NumberTales / Primary）

| 項目 | 件数 |
| --- | --- |
| レコード総数 | 105 |
| `AIHints` あり | 92 |
| **`palette_priority` 確定** | **91** |
| `palette_priority` が `null` | **1**（Num `10-alt`） |
| `_meta`（provenance）あり | 92 / 92 |

**残り 1 件は導出漏れではない。** Num `10-alt`（ディケ）は設定画が無く `ColorPalette` 自体を持たないレコードで、
`ColorPalette` を持たない 11 件（Num 38/54/59/79/80/82/83/90/91/95/10-alt）のうち AIHints を持つ唯一の個体。
**ソースが無いため `null` が正しい状態**である。

### 2-3. 冪等性の確認（dry-run）

```
node tools/patch-aihints.mjs --work NumberTales --db Primary --all --apply-colorpalette
  → #10-alt: palette-no-colorpalette
  → その他: palette-unchanged
  → No changes to write.
```

**差分ゼロ**。適用済みかつ冪等であることを実機で確認した。

### 2-4. なぜ母艦の記載が誤ったか

`develop` 側の 2 ログ（`aihints-palette-deadlock` / `colorpalette-schema`）が **2026-07-13 時点の記述のまま**で、
その後 `addon-ai-tag` 側で実装が進んだことが `develop` からは見えなかったため。
AIHints のコード・スキーマは `develop` に含めない運用なので、**`develop` 側のログだけを読むと必ずこの誤解が起きる**。

本ブランチでは 2026-07-14 の棚卸し時点で同じ現象を
「**実装がログを追い越している**」と記録しており（`2026-07-14_progress_addon-ai-tag-log-inventory.md` §2）、
今回はその再発にあたる。

### 2-5. 他 DB の状況（今回あらためて実測）

| DB | レコード | AIHints | `palette_priority` 確定 | `ColorPalette` |
| --- | --- | --- | --- | --- |
| Primary | 105 | 92 | **91** | 94 |
| SemiPrimary | 52 | **0** | 0 | 8 |
| SelfSecondary | 106 | **0** | 0 | 7 |
| Secondary | 38 | **0** | 0 | 11 |

Primary 以外は **AIHints 自体が未 seed**（`2026-07-17_progress_aihints-scope-semiprimary-selfsecondary.md` の
「seed 本体」待ち）のため、palette も 0 件。**ただし `ColorPalette` は既に投入されている**ので、
seed 後に `--apply-colorpalette` を続けて実行すれば同じ経路で埋まる。seed 手順へこの一手を含めること。

---

## 3. 棚卸し（1 件 → `.completed/`）

**`_work_in_progress/` 直下: 19 件 → 18 件（+ 本ログで 19 件・+README）**

| ログ | 退避理由 |
| --- | --- |
| `2026-07-22_progress_addon-ai-tag-merge.md` | 前回のマージ + 棚卸し作業ログ本体。唯一の未完了だった「本マージ結果は未コミット」は `237b194` ほかで着地済み。本ログへ世代交代 |

**残置したログ**（いずれも未完了タスクが実在）:

- `2026-07-14_progress_addon-ai-tag-log-inventory.md` — **AIHints 残課題台帳（A1〜A9）**。本ブランチの実質的な母艦
- `2026-07-17_progress_aihints-scope-semiprimary-selfsecondary.md` — seed 本体ほか未完了 4 件

## 4. 検証

- **コンフリクトマーカー**: `_work_in_progress/README.md` / `docs/api-sw-spec.md` とも **0 件**
- **`npm test`: 50 ファイル / 715 件すべて成功**（develop 単独では 42 / 597。AIHints 系テスト分が加算）
- **AIHints 実データ**: `db_Primary.json` の AIHints **92 件**・`_meta` **92 件**・`palette_priority` 確定 **91 件**（マージ前後で不変）
- **`--apply-colorpalette` dry-run**: `No changes to write.`（冪等）
- **README の欠落検査**: 本ブランチ固有の整理履歴エントリ **9 件**、AIHints 関連記述 **37 箇所**が
  マージ後も残存していることを確認

## 5. 影響範囲（編集ファイル）

- `docs/api-sw-spec.md`（衝突解消・AIHints エンドポイント 2 行と `Works_OfficialLinks[]` の両取り）
- `_work_in_progress/README.md`（衝突解消・本ブランチ固有ログの索引節を新設）
- `_work_in_progress/2026-07-14_progress_addon-ai-tag-log-inventory.md`（残課題台帳の更新）
- `_work_in_progress/2026-07-25_progress_addon-ai-tag-merge.md`（本ファイル・新規）
- 退避 1 件（`.completed/` へ移動、Git 管轄外）

**コード（`lib/` `pages/` `tools/` `data/`）への機能変更は本作業では無し。**
着手順 4 番は「新規実装」ではなく「**すでに完了していたことの確認**」で消化された。

## 6. 未完了タスク

- **本棚卸しの成果は未コミット**（マージコミット `6f68df3` 自体は着地済み）。
- AIHints の残課題は `2026-07-14_progress_addon-ai-tag-log-inventory.md`（**A1〜A9**）を参照。

## 7. 申し送り事項

1. **`develop` 側で統合母艦の T-02 を訂正すること（最重要）**。
   `2026-07-25_remaining-task.md` の T-02 は「繋ぐ 1 本が未実装・92/92 件 null」と書かれているが、
   **実際は実装・適用済み**（確定 91 件）。母艦は `develop` 由来の共有ファイルであり、
   本ブランチで書き換えると取り込みマージのたびに衝突するため、**`develop` 側で直す**。
   あわせて `develop` 側の 2 ログ（`aihints-palette-deadlock` / `colorpalette-schema`）にも
   「本ブランチでは適用済み」の注記が要る。
2. **`develop` 側のログだけで AIHints の進捗を判断しない**。AIHints のコード・スキーマは
   `addon-ai-tag` 限定のため、`develop` 側のログは実装状況に対して構造的に遅れる。
   状態を書くときは本ブランチで実データを見てからにすること。
3. **`AGENTS.md` の AIHints 節は本ブランチ限定**。`develop` からのマージで衝突したら**こちら側を残す**（節冒頭にも明記済み）。
4. **`_work_in_progress/README.md` は毎回衝突する**。両ブランチとも同じファイルを更新するため。
   解消は**必ず両取り**で行うこと（片側採用だと、今回のように AIHints エンドポイントや
   本ブランチ固有の履歴 9 件が黙って消える）。
5. seed（SemiPrimary / SelfSecondary）を行うときは、`--suggest --apply` の後に
   **`--apply-colorpalette` も実行**する（`ColorPalette` は投入済みのため即座に効く）。

## 参考

- `.completed/2026-07-22_progress_addon-ai-tag-merge.md`（前回のマージ + 棚卸し）
- [`2026-07-14_progress_addon-ai-tag-log-inventory.md`](./2026-07-14_progress_addon-ai-tag-log-inventory.md)（AIHints 残課題台帳 A1〜A9）
- [`2026-07-17_progress_aihints-scope-semiprimary-selfsecondary.md`](./2026-07-17_progress_aihints-scope-semiprimary-selfsecondary.md)（seed の前提整備）
- [`2026-07-25_remaining-task.md`](./2026-07-25_remaining-task.md)（統合母艦・`develop` 由来）
- `docs/ai-hints-usage.md` §9.10 / §9.11 / `AGENTS.md`「AIHints 運用ルール（`addon-ai-tag` ブランチ限定）」
