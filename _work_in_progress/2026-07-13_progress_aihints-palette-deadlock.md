# AIHints カラーセット（palette_priority）デッドロックの診断と、再ビルド設計の確定案

## 目的

User から「AIHints をビルドすると `TODO:` 状態に巻き戻って既存の AIHints が失われる。おそらくカラーセットが画像からしか判別できず詰まっているので、既存画像からカラーセットを抽出して自動補完する Claude Code / GitHub Copilot 向けパイプラインを作るべきではないか」との相談を受けた。

調査の結果、**カラー抽出のための Agent 連動パイプラインは `addon-ai-tag` に既に実装済み**であり、詰まりの原因はパイプラインの不在ではなく **`palette_priority` の `null` ハンドリングのバグ（デッドロック）** であることが判明した。本ドキュメントはその診断結果と、[2026-07-08 の構造的再同期提案](./2026-07-08_progress_aihints-structural-resync-proposal.md) を踏まえた実装設計の確定案をまとめる。

> **【2026-07-13 追記】第0階（`null` ハンドリング修正）は `addon-ai-tag` ブランチで実装・検証済み。** 本文の診断・設計はそのまま維持し、実装結果を末尾の「実装結果（第0階）」節に追記した。第1階（provenance）・第2階（色抽出）は未着手。

## 調査で判明した事実

### 実データの現状（`addon-ai-tag` / `data/Works_NumberTales/DataBases/db_Primary.json`）

| 項目 | 実数 |
| --- | --- |
| レコード総数 | 105 件 |
| `AIHints` あり | 92 件 |
| `AIHints` なし | 13 件 |
| AIHints 内の `TODO:` 文字列 | **0 件**（コミット済みデータはクリーン） |
| `common.palette_priority` が `null` | **92 件（AIHints を持つ全件）** |
| `common.palette_priority` に確定値 | **0 件** |

`palette_priority` は「TODO のまま放置されている」のではなく、**`null` で固定されている**。TODO 文字列ですらないため、後述のとおり既存の視覚解析ワークフローの検出条件をすり抜けている。

### 既に実装済みの視覚解析パイプライン（重要）

`tools/patch-aihints.mjs` には、Agent（Claude Code / Copilot）連動の画像解析ワークフローが既に存在する。

```
node tools/patch-aihints.mjs --gen-vision-tasks
    → .cache/vision-tasks.json（視覚 TODO を持つレコードの画像パス一覧）
    → Agent が view_image で画像を解析
    → .cache/vision-results.json（VisionResult[]）を書く
node tools/patch-aihints.mjs --apply-vision-results --apply
    → AIHints の視覚 TODO（palette / hair / eye / outfit）へ適用
```

関連実装:

- `genVisionTasksToFile()`（`tools/patch-aihints.mjs` 内）— タスクマニフェスト生成
- `VisionResult` typedef — `palette: { primary, secondary, accent }` を含む
- `applyVisionResultsToAihints()` — 解析結果の適用
- CLI: `--gen-vision-tasks` / `--apply-vision-results`

**User が新規構築を検討していた「画像からカラーセットを補完する Agent 向けパイプライン」は、設計としては既に存在する。** 不足しているのは後述の `null` ハンドリング修正と、Agent の目視判断を裏付ける決定論的な色抽出（第2階）である。

### 根本原因：`palette_priority = null` による三重のデッドロック

| # | 箇所 | 現状の実装 | 帰結 |
| --- | --- | --- | --- |
| (a) | `detectVisualTodos()`（`--gen-vision-tasks`） | `typeof pal?.primary === 'string' && /^TODO:/.test(pal.primary)` | `palette_priority` が `null` だと `pal?.primary` が `undefined` → **視覚タスクに載らない** |
| (b) | `applyVisionResultsToAihints()`（`--apply-vision-results`） | `if (vr.palette && a.common?.palette_priority) { ... }` | `null` は falsy → Agent が解析結果を返しても **書き戻されない** |
| (c) | `clearAihintsTagsForNoSource()` ほか `--apply-appearancedetail` 経路 | `out.common.palette_priority = null;` | 実行のたびに **`null` で潰す** |

この 3 点が噛み合って、次のループから抜けられなくなっている。

```
(c) --apply-appearancedetail が palette を null にする
      ↓
(a) null なので --gen-vision-tasks の検出条件に掛からない
      ↓
    Agent は palette を見に行かない
      ↓
(b) 仮に手で vision-results.json を書いても null なので適用されない
      ↓
    palette は永久に null のまま  ── 92/92 件が該当
```

**TODO 文字列を復活させる唯一の経路が `--suggest --force`（全面上書き）** であり、これは手仕上げした創作内容（髪色・目色・衣装描写等）まで TODO 雛形へ巻き戻す。User が体感していた「ビルドすると巻き戻る」は、この逃げ場のない二択の帰結である。

### 「カラーセットが原因」という User の見立てについて

**症状の切り分けとしては正確だった。** ただし解決策は「新規パイプラインの構築」ではなく「既存パイプラインの `null` ハンドリング修正」である。

一方で、`--force` による巻き戻り問題そのもの（= 構造由来と人手由来を区別するマーカーの不在）は palette とは**独立して残る**課題であり、[2026-07-08 提案](./2026-07-08_progress_aihints-structural-resync-proposal.md) の `_meta` provenance / `--resync-structural` で別途解消する必要がある。

### 画像アセットの可用性（NumberTales / Primary、`develop` 作業ツリーで実測）

| ソース | 宣言あり | 実ファイル存在 | 抽出適性 |
| --- | --- | --- | --- |
| `Images.arts_PNGPath`（清書イラスト） | 60 件 | **58 件** | **最良**。キャラ本体が明瞭、背景は低彩度グラデ（彩度フィルタで除去可） |
| `Images.corefolder_PNGPath`（コアフォルダ形態） | 89 件 | **89 件** | 良。カバレッジ最大 |
| `Images.concept_PNGName`（設定画） | 94 件 | 未計測 | **要注意**。白背景＋赤ペン手書き注釈＋表情差分が同一画像に同居し、素朴なクラスタリングでは注釈の赤に汚染される |
| いずれも無し | 10 件 | — | 抽出不可（手動 or 対象外） |

画像は全 155 枚 PNG（`corefolder` 配下実測）。**`sharp` のようなネイティブ依存は不要** — Node 標準 `zlib` で PNG デコードを自前実装できる。

`AppearanceDetail` には既に色情報が構造化されている（照合の裏取りに使える）:

- `Attrs[].AttrLabel: "#DesignAttr_Color"` → `value_JP: "赤"` / `value_EN: "red"`
- `DesignElement: "#Element_Motif"` + `BodyPart: ["#BodyPart_Hair"]` → `value_EN: "red orange hair"`

---

## 提案する設計（3 階建て）

### 第0階：`null` ハンドリング修正（最小・即効）

既存の視覚解析パイプラインを `palette_priority` に到達させるための修正。**これだけで詰まりが解ける**（`--force` を打つ必要が無くなる）。

1. **`detectVisualTodos()`**: `null` / 空文字 / `TODO:` 接頭辞を等しく「未入力」とみなす。

   ```js
   const isUnfilled = (v) => v == null || v === '' || (typeof v === 'string' && /^TODO:/.test(v));
   const pal = aihints.common?.palette_priority;
   if (pal == null) {
       fields.push('common.palette_priority.primary',
                   'common.palette_priority.secondary',
                   'common.palette_priority.accent');
   } else {
       if (isUnfilled(pal.primary)) fields.push('common.palette_priority.primary');
       // secondary / accent も同様
   }
   ```

2. **`applyVisionResultsToAihints()`**: `palette_priority` が `null` の場合はオブジェクトを新規生成してから書き込む。

   ```js
   if (vr.palette && a.common) {
       if (a.common.palette_priority == null) a.common.palette_priority = {};
       const p = a.common.palette_priority;
       // 以降は現行どおり
   }
   ```

3. **`--apply-appearancedetail` が `palette_priority` を潰さない**（最重要）。

   `palette_priority` は画像由来であり `AppearanceDetail` 由来ではない。`age_appearance` / `reference_images` と同様に**据え置き**とし、`clearAihintsTagsForNoSource()` および再構築経路から `palette_priority = null` の代入を削除する。**これを直さない限り、埋めても次のビルドで消える。**

**規模見積もり**: 実装 ~60 行 / テスト ~80 行。

### 第1階：provenance（`_meta`）と `--resync-structural`

[2026-07-08 提案](./2026-07-08_progress_aihints-structural-resync-proposal.md) の実装。palette とは独立に残る「`--force` 巻き戻り問題」の恒久対策。要点のみ再掲する（詳細は同ログを参照）。

- `AIHints._meta.structuralEntries` に「ツールが実際に挿入した文字列そのもの」をパスごとに記録
- 再同期は **find-exact-and-replace**（記録と一致する文字列だけ差し替え、人が編集した箇所は素通り）
- `_meta.structuralSourceHash` で構造ソース（`TailsUnit` / `AppearanceDetail(#Element_Ear)` / `GenderType` / `ConceptAge` / `Num` 等）の変化を検知し、無変更なら no-op
- 新モード `--resync-structural`（既定 dry-run / `--apply` で反映）
- `_meta` は `_DBLink` 同様の内部補助情報として UI / 公開 API へ露出させない

**第0階で palette が埋まると「失いたくない資産」が増える**ため、第1階は palette 補完の前後どちらでも良いが、**遅くとも本格的な一括補完の前**には入れておきたい。

**規模見積もり**: 実装 ~250 行 / テスト ~150 行 / CI ワークフロー ~60 行。

### 第2階：決定論的なカラー抽出（`tools/extract-palette.mjs`）

第0階だけでも palette は埋められるが、その場合 hex 値は **Agent の目視（`view_image`）による主観的な読み取り**になり、再現性・精度が不安定になる。ここに決定論的な抽出を挟み、**Agent は「候補 hex から選ぶ」役に徹する**ようにする。これが User の当初提案に最も近い部分。

**位置づけ**: 既存パイプラインの置き換えではなく、`--gen-vision-tasks` の**入力補強**。

- **入力優先順**: `arts_PNGPath[0]`（58 件）→ `corefolder_PNGPath[0]`（89 件）→ `concept_PNGName`（ノイズ多、最後の手段）
- **PNG デコード**: Node 標準 `zlib.inflateSync` + チャンク解析（IHDR / PLTE / tRNS / IDAT）を自前実装。**依存追加ゼロ**（リポジトリの「Vanilla / 依存最小」方針に沿う）
- **前処理（ノイズ除去）**:
  - アルファ 0（透過）を除外
  - 外周からのフラッドフィルで背景連結成分を特定し除外（arts のグラデ背景 / concept の白紙面）
  - 低彩度 × 高明度（S < 0.12 かつ V > 0.9）＝ 紙・白 を除外
  - 低明度（V < 0.15）＝ 線画の黒 を除外
- **量子化**: median-cut で上位 8 色 + 各色の占有率
- **`AppearanceDetail` との照合**: `#DesignAttr_Color`（`value_EN: "red"`）や `#Element_Motif`（`"red orange hair"`）の色語を既知の色語→HSV 範囲表で解決し、抽出クラスタと突き合わせて「この hex は hair 由来らしい」という**根拠タグ**を付与する
- **出力**: `.cache/palette/<Num>.json`（`data/` へは直接書かない）
- **連携**: `--gen-vision-tasks` が抽出候補を各タスクへ `paletteCandidates` として同梱 → Agent は実画像を見つつ**候補から primary / secondary / accent を割り当てる** → `.cache/vision-results.json` → `--apply-vision-results --apply`
- **最終採否は User**（既存の承認フローを維持）

**創作内容の自動生成には当たらない根拠**: 本処理は (1) 既存画像アセットの機械的計測と、(2) 既存 `AppearanceDetail` フィールドとの照合のみを行う。新しいキャラクター設定・台詞・固有用語は生成しない。`CLAUDE.md` の「会話パターン情報追加時の運用制約」に抵触しない。

**規模見積もり**: 実装 ~300 行（PNG デコーダ ~150 / 量子化 ~80 / 照合 ~70）/ テスト ~120 行 / Agent プロンプト（`.github/prompts/aihints-palette.prompt.md`）~80 行。

---

## 実装計画（分割必須）

合計で 1,000 行を超えるため、`CLAUDE.md` の 500 行ルールに従い階ごとに独立したタスクへ分割する。

| 段階 | 内容 | 規模 | 前提 |
| --- | --- | --- | --- |
| Step 1 | 第0階（`null` ハンドリング 3 点 + テスト） | ~140 行 | なし。単独で価値あり |
| Step 2 | 第2階（`extract-palette.mjs` + プロンプト + テスト） | ~500 行 | Step 1 |
| Step 3 | 第1階（`_meta` provenance + `--resync-structural` + CI） | ~460 行 | Step 1（Step 2 と並行可） |

**推奨着手順**: Step 1 → Step 3 →（一括補完の前に）Step 2。
Step 1 は単独で「`--force` を使わずに palette を埋められる」状態を作る。Step 3 で器（巻き戻り防止）を用意してから、Step 2 の抽出補助を使って 92 件を本格補完するのが最も安全。

**作業ブランチ**: `addon-ai-tag`（User の指定によりサブローカルで実施）。本設計ログのみ、2026-07-08 の姉妹ログと対で読めるよう `develop` に配置する（AIHints の**コード・スキーマ・エンドポイント**は `develop` に含めない方針を維持）。

## 検証方針

- **Step 1**: `--gen-vision-tasks` を実行し、92 件が `.cache/vision-tasks.json` に載ることを確認。`--apply-appearancedetail` 実行後も既存 `palette_priority` が保持されることをテストで固定。
- **Step 2**: Num:1（`AppearanceDetail` 上「赤橙色の髪」/ 実画像は赤橙の髪・コーラルのパーカー・クリームの肌）で抽出 hex が色語と整合するかを確認。
- **Step 3**: 人手で編集した文字列を含むレコードに `--resync-structural --apply` を実行し、**人手編集分が変更されない**ことをテストで固定。
- 各段階で `npm test`（Vitest）を実行。

## 影響範囲（本セッションで編集したファイル）

- `_work_in_progress/2026-07-13_progress_aihints-palette-deadlock.md`（本ファイル、新規）

実装対象ファイル（未着手 / `addon-ai-tag` ブランチ）:

- `tools/patch-aihints.mjs`（第0階の `null` ハンドリング、第1階の `--resync-structural`、第2階との連携）
- `tools/extract-palette.mjs`（新規）
- `.github/prompts/aihints-palette.prompt.md`（新規）
- `.github/workflows/aihints-structural-resync.yml`（新規、第1階）
- `tests/patch-aihints.*.test.js`
- `docs/ai-hints-usage.md` / `docs/aihints-spec.md`
- `CHANGELOG.md`

## 未完了タスク

- 本提案の優先度判断・着手順の確定は User 判断待ち。
- 実装着手時、サブローカル（`addon-ai-tag` チェックアウト先）の物理パスを Claude へ共有する必要がある。
- `concept` 画像（設定画）を抽出ソースに含めるかの最終判断（赤ペン注釈のノイズ耐性が確認できてから）。
- `AIHints` を持たない 13 件、および画像を持たない 10 件の扱い（対象外とするか、別途 scaffold するか）。

---

## 実装結果（第0階 / 2026-07-13、`addon-ai-tag` ブランチ）

第0階「`null` ハンドリング修正」を実装・検証した。第1階（provenance）・第2階（色抽出）は未着手。

### 変更点

`tools/patch-aihints.mjs`:

- **`isUnfilledPaletteSlot(v)` を新設**（export）。`null` / 空文字 / `TODO:` 接頭辞を等しく「未入力」とみなす単一の判定器。検出側・適用側の両方から使い、判定基準の二重定義を防ぐ。
- **`detectVisualTodos()`**: `palette_priority` が `null` / object ごと欠落の場合も 3 スロットすべてを未入力として検出するよう修正。`genVisionTasksToFile()` 内のローカル関数だったため、テストから直接検証できるようモジュールレベルへ引き上げた（挙動は不変）。
- **`applyVisionResultsToAihints()`**: `palette_priority` が `null` でも object を組み立て直してから書き込むよう修正。**確定済みの HEX は上書きしない**（未入力スロットのみ埋める）ガードを追加。
- **`buildAihintsFromAppearanceDetail()` / `clearAihintsTagsForNoSource()`**: `palette_priority = null` の代入を削除し、`age_appearance` / `reference_images` と同じ**据え置き**扱いへ変更。JSDoc も実態に合わせて修正。
- export 追加: `isUnfilledPaletteSlot` / `detectVisualTodos` / `applyVisionResultsToAihints` / `clearAihintsTagsForNoSource` / `buildAihintsFromAppearanceDetail`。

`tests/patch-aihints.palette.test.js`（新規、17 件）:

デッドロックの 3 点をそれぞれ回帰として固定。あわせて「確定済み HEX を上書きしない」「`--apply-appearancedetail` が palette を潰さない」「入力 AIHints を破壊しない（deep copy）」も検証。

### 検証

1. **`npm test` 全件成功**（33 ファイル / 339 件）。
2. **`--gen-vision-tasks` を NumberTales / Primary 全件に実行**: palette 未入力として検出されるレコードが **0 件 → 92 件**（AIHints を持つ全件）になった。修正前は `null` が検出条件をすり抜けるため 1 件も載らなかった。
3. **Num:1 で end-to-end 実証**: `.cache/vision-results.json` に palette を書いて `--apply-vision-results --apply` → 書き戻しに成功（修正前は `null` が falsy 判定で弾かれ書き戻せなかった）。続けて **`--apply-appearancedetail --apply` を実行しても HEX が保持される**ことを確認（修正前はここで `null` に潰されていた）。
   確認後 `git checkout -- data/Works_NumberTales/DataBases/db_Primary.json` で revert 済み。**実データの `palette_priority` は 92 件とも未入力のまま**（投入した HEX は配管検証用の目測値であり、User 未承認のため残していない）。

---

## 実装結果（palette の構造由来化 / 2026-07-13、`addon-ai-tag` ブランチ）

`develop` の `ColorPalette`（設定画のカラーチップ由来の構造化フィールド。[2026-07-13_progress_colorpalette-schema.md](./2026-07-13_progress_colorpalette-schema.md)）を `addon-ai-tag` へマージし、**`palette_priority` をそこから機械導出**できるようにした。**本ログの当初の目的（AIHints をビルドしても配色が失われない）はここで達成された。**

### 変更点

`tools/patch-aihints.mjs`:

- **`derivePaletteFromColorPalette(record)`**（export）: `ColorPalette` の `Role`（`#ColorRole_Primary` / `Secondary` / `Accent`）と `Hex` から `{ primary, secondary, accent }` を導出する。`#ColorRole_Sub` は palette_priority に対応先が無いため使わない。`ColorPalette` が無ければ `null`（勝手に推定しない）。
- **`applyColorPaletteToAihints(aihints, palette, opts)`**（export）: 導出値を `common.palette_priority` へ適用する。既存の確定値は保護し、`{ force: true }` で上書きする（`applyVisionResultsToAihints()` と同じ規約）。
- **CLI `--apply-colorpalette` / `--force-palette`** を新設。**画像の目視は一切不要**。

### 検証

1. **`npm test` 全件成功**（35 ファイル / 399 件）。回帰テスト 7 件を追加。
2. **実データ**: `palette_priority` が 3 色すべて確定したレコードが **0 件 → 91 件**（残る 1 件は `ColorPalette` を持たないレコード）。
3. **ビルド耐性**: `--apply-appearancedetail --apply` を全 92 件へ実行しても **palette が失われない**（かつてこのモードが毎回 `null` へ潰していた）。
4. **構造由来であることの実証**: Num 1 の `palette_priority` を意図的に `null` へ潰したうえで `--apply-colorpalette` を再実行し、**同一の値へ完全復元**されることを確認した。同じ入力から常に同じ値が出る = 再ビルドで揺れない。

### 位置づけの変化

当初の設計（本ログ上部）では「第2階: 画像からの決定論的な色抽出」を Agent の目視を裏付ける補助として計画していた。実際には **`ColorPalette` を本体 DB に持たせたことで、palette_priority は画像を一切見ずに DB から導出できる**ようになり、目視ワークフロー（`--gen-vision-tasks` → `view_image` → `--apply-vision-results`）は palette に関しては**不要**になった。視覚解析ワークフロー自体は髪・目・衣装など他の視覚 TODO のために引き続き有効。

### 残る課題（第0階では解決しない）

- **`--suggest --force` の全面上書きによる巻き戻り**は未解決。第1階（`_meta` provenance + `--resync-structural`）が必要。
- **`common.natural_language_description`** も palette と同様、`buildAihintsFromAppearanceDetail()` が毎回 `null` へ潰しており、実データでも広く `null` のまま。ただし `VisionResult` typedef に対応フィールドが無く視覚解析ワークフローの対象外のため、今回のスコープには含めていない（第1階または別タスクで扱う）。
- 実データ 92 件の palette を実際に埋める作業は、第2階（決定論的な色抽出）を入れてから着手するのが安全。目測のみで 92 件分の HEX を確定させると再現性が担保できない。

---

## 参考リンク

- [`2026-07-08_progress_aihints-structural-resync-proposal.md`](./2026-07-08_progress_aihints-structural-resync-proposal.md) — 構造的再同期（第1階）の元提案
- [`2026-07-08_progress_addon-ai-tag-earshapetype-aihints.md`](./2026-07-08_progress_addon-ai-tag-earshapetype-aihints.md) — `--suggest --force` の巻き戻り危険性が最初に指摘された経緯
- `tools/patch-aihints.mjs`（`addon-ai-tag`）— `genVisionTasksToFile()` / `applyVisionResultsToAihints()` / `clearAihintsTagsForNoSource()`
- `.github/prompts/aihints-fill.prompt.md`（`addon-ai-tag`）— 既存 Agent セッションの構造（新規プロンプトはこれに倣う）
- `docs/aihints-spec.md`（`addon-ai-tag`）— AIHints の構造・D1 スキーマ・Worker エンドポイント
