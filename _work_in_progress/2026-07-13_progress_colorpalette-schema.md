# `ColorPalette` スキーマ新設と、既存画像からの配色候補抽出

## 目的

AIHints の `palette_priority`（カラーセット）が 92/92 件 `null` のまま埋まらない問題（[デッドロック診断ログ](./.completed/2026-07-13_progress_aihints-palette-deadlock.md)）に対し、User から **「色を AIHints に目測で埋めるのではなく、`develop` 側の本体 DB にフィールドとして持たせる」** 方針が示された。本作業はその実装。

**なぜこれが根治になるか**: 現状 `palette_priority` が「画像を目測しないと決まらない」のは、色が本体 DB のどこにも構造化されていないためである（`AppearanceDetail` に `#DesignAttr_Color` の**色名**（`"赤"` / `"red"`）はあるが HEX が無い）。色を本体 DB に持たせれば、`palette_priority` は `AppearanceDetail` と同じ **「構造由来」** になり、

- 目測が不要になる（再現性が出る）
- `--apply-appearancedetail` と同じ経路で **機械導出** できる
- [構造的再同期提案](./.completed/2026-07-08_progress_aihints-structural-resync-proposal.md)（第1階 provenance）の「安全に再生成できる領域」に入り、**再ビルドで巻き戻らなくなる**

## 作業ブランチ

`develop`（本体ローカル）。`ColorPalette` は AIHints 非依存の本体スキーマであり、AIHints のコード・スキーマを `develop` に含めない方針とは競合しない。

## 変更点の要約

### 1. `ColorPalette` スキーマの新設（実更新）

- **`data/db_type.json`**: グローバル `$DefType` に `ColorPalette`（`$Def_ColorPalette[]|#Null`）を追加。`AppearanceDetail` の直後に配置し、`$display: { section: 'profile' }` とした。専用の色スウォッチ renderer（`sectionWrapper`）は今回のスコープ外とし、汎用 renderer にフォールバックさせる。
- **`data/db_meta.json`（`General.$VarsDef`）**:
  - `$Def_ColorPalette` を新設（`$Def_AppearanceDetail` の直後）。フィールドは `Role` / `Hex` / `ColorName_JP` / `ColorName_EN` / `AppliesTo` / `Formation` / `Note_JP` / `Note_EN`。
  - `$EnumDef_ColorRole` を新設（`#ColorRole_Primary` / `#ColorRole_Secondary` / `#ColorRole_Accent`）。
- **既存資産の活用**: `Hex` の型には、グローバル `$ScalarDef` に**定義済みだが未使用だった** `#Hexcode_Color`（`^#[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?$`）をそのまま使用した。`AppliesTo` は既存の `$EnumDef_DesignBodyPart`（`#BodyPart_*`）を再利用する。

### 2. `tools/extract-palette.mjs`（新規）

既存画像から配色候補を**決定論的に**抽出する入力補助ツール。

- **PNG デコーダを自前実装**（Node 標準 `zlib` のみ / **依存追加ゼロ**）。IHDR / PLTE / tRNS / IDAT のチャンク解析、5 種のスキャンラインフィルタ解除、colorType 0/2/3/4/6・bitDepth 1/2/4/8/16 に対応（インターレースは非対応）。`sharp` 等のネイティブ依存を持ち込まない方針に沿う。
- **前景マスク（4 段）**: 透過除去 → 外周からのフラッドフィル → **外周の色分布から背景色を推定して除去** → 線画の黒・紙面の白を除去。3 段目は、arts 画像が「白い外枠 → グラデーション背景」という二層構造を持ち、枠と背景の境界でフラッドフィルが停止して背景が残る問題への対処（画像ごとに最適なしきい値が異なる問題もここで吸収する）。
- **median-cut** による色量子化 → 代表色 + 占有率。
- **`AppearanceDetail` との照合**: `#DesignAttr_Color` / `#DesignAttr_Overview` の色語（JP/EN）を HSV 範囲へ解決し、抽出クラスタと突き合わせて「この HEX は hair の 'red orange' に対応しそう」という**根拠**を付与する。
- **`--draft` オプション**: `.private/` 配下へ `ColorPalette` 追記用の下書きメモを出力する。

### 3. 実データ（`db_Primary.json`）への `ColorPalette` 追記

User の判断により、`.private/` の下書きを経由せず **実データへ直接追記**した（`--apply`）。

- **対象**: NumberTales / Primary の **95 件**（画像を持たない 10 件はスキップ: Num 38/54/59/79/80/82/83/90/91/95）。
- **挿入位置**: 各レコードの `AppearanceDetail` の直後（`$DefType` のフィールド順に一致）。
- **書式非破壊**: `JSON.parse` → `JSON.stringify` の往復は、prettier が 1 行に畳んでいる短い配列（例: `"corefolder_PNGPath": ["a", "b"]`）をすべて展開してしまい全行が差分になるため、`tools/patch-aihints.mjs` と同様の **テキスト挿入**で実装した。結果、`git diff --numstat` は **3320 行追加 / 0 行削除**（既存行は 1 行も書き換えていない）。

**ツールが書き込んだ項目（機械的に決まるもの）**:

| フィールド | 埋め方 |
| --- | --- |
| `Role` | 占有率の降順で Primary / Secondary / Accent を仮割当（**要 User 確認**） |
| `Hex` | 画像から抽出した代表色（既存画像の機械計測値であり、創作物の転記にあたる） |
| `AppliesTo` | 抽出色と色語が一致した `AppearanceDetail` の `BodyPart` を**転記** |

**ツールが書き込んでいない項目（創作内容のため User が入力）**: `ColorName_JP` / `ColorName_EN` / `Formation` / `Note_JP` / `Note_EN` はすべて `null`。

判断材料（採用画像・前景比率・占有率・HSV・一致した色語とその出典・不採用候補・他画像の上位色）は `.cache/palette-candidates.json` と `.private/ColorPalette-draft_db_Primary.json` に残っている（いずれも Git 管轄外）。`--draft` オプションも残しているため、必要なら再生成できる。

## 検証

1. **`npm test` 全件成功**（31 ファイル / 333 件）。うち新規 `tests/extract-palette.test.js` が 31 件。
2. **PNG デコード**: NumberTales / Primary の全画像（155 枚）を処理して **デコードエラー 0 件**。
3. **抽出カバレッジ**: 105 件中 **95 件**で候補を生成（画像を持たない 10 件はスキップ）。
4. **主ソースの内訳**: arts 58 件 / corefolder 28 件 / concept 9 件。
5. **色語との照合**: 95 件すべてで `AppearanceDetail` の色語を検出。抽出色と一致しなかったのは 7 件（Num 12/21/26/33/39/62/87）。
6. **追記後の実データ検証**（95 件 × 3 色 = 285 エントリ）:
   - `Hex` が `#Hexcode_Color` のパターン（`^#[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?$`）に適合しないもの: **0 件**
   - `Role` が `$EnumDef_ColorRole` 以外の値: **0 件**
   - 創作内容フィールド（`ColorName_*` / `Formation` / `Note_*`）が誤って埋まっているもの: **0 件**
   - キー順が `AppearanceDetail` の直後になっているか: **OK**
   - `git diff --numstat`: **3320 行追加 / 0 行削除**（既存行の書き換えなし）
   - `npx prettier --check`: パス

### 実装中に見つけて直した不具合

- **主ソースの選択が前景比率順になっていた**: 当初「前景比率が最大の画像」を主ソースにしていたため、単色のコアフォルダ形態（球体）が humanoid の清書イラストを押しのけ、髪・衣装・小物を含む配色が取れなくなっていた（Num 1 で発現）。`resolveImageSources()` の優先順（arts → corefolder → concept）に従うよう修正し、回帰テストで固定した。ただし背景除去に失敗して前景がほとんど残らなかった画像（< 3%）は主ソースにしない。

---

## 追記（2026-07-13）: 設定画のカラーチップを正として再確定

上記の median-cut 推定は暫定であり、**設定画（concept / catalog）に作者がカラーチップ（配色見本の丸）を描き込んでいる**ことが判明したため、そちらを正として全面的に差し替えた。カタログ画像には `0x00b6d9` のような HEX コードが**文字としても併記**されており、Num 4 で突き合わせたところ concept のチップ実測値と一致した（正解が判っている検証点として回帰テストに固定済み）。

### 変更点

- **`$EnumDef_ColorRole` に `#ColorRole_Sub`（副色）を追加**。実データの配色は 5〜6 色あり、Primary / Secondary / Accent の 3 役では足りなかった。
- **`tools/patch-colorpalette.mjs`（新規）**: `--work` / `--db` を変えれば他作品・他 DB にも再利用できるパッチスクリプト。既定 dry-run / `--apply` / `--force` / `--drop-unresolved`。
- **`detectSwatchChips()` / `rescanPaletteRegion()`（`tools/extract-palette.mjs`）**: **2 段階検出**。確実なチップで配色領域を特定し、**その領域内だけ**条件を緩めて再捜査する。配色見本は 1 箇所にまとめて描かれるため、領域を絞れば閾値を下げてもノイズを拾わない。
- **`measurePaletteCoverage()`**: Role は各色がキャラクター画像を占める割合の実測で決める（色そのものは作者指定値をそのまま使う）。

### 検出を阻んでいた 4 つの原因（すべて User の指摘が起点）

| 症状 | 原因 | 対処 |
| --- | --- | --- |
| チップが 1 個に融合（Num 48） | 重なって描かれており「有色の連結成分」が全部つながる | 色が変わる境界で成分を切る（同色の平坦領域） |
| 小さいチップが消える（Num 75 の青は半径 3.7px） | 大小が不揃いで、収縮による足切りに耐えられない | 領域内では面積下限を大きく下げて救済 |
| 黒に近いチップが消える（Num 19 の `#423F3F`） | 前処理で「暗色＝線画」に分類されていた | 領域内では色による足切りをやめる |
| 淡いチップが消える（Num 12/21 の `#FEF3D9`） | (a) 「ほぼ白＝背景」に分類 / (b) 統合しきい値 12 が別チップ（距離 11.75）を潰していた | 純白のみ紙面として除外。統合しきい値を 6 へ |

### 手入力チップの受け口（`--chips`）

自動検出が原理的に届かないレコードのために、User が読み取ったカラーコードを渡せる CLI オプションを設けた。設定画が無い作品・DB でも同じ経路が使えるため、他作品への展開時にも有効。

```bash
node tools/patch-colorpalette.mjs --work NumberTales --db Primary --records 40 \
  --chips "#67bdbd,#a4daef,#387eb6,#00bacb,#d4f6f2" --apply
```

手入力値も自動検出と**同じ扱い**で処理される（被覆率の降順で Role を決定、`AppliesTo` を `AppearanceDetail` から転記）。実際 Num 40 では、User 提供の 5 色すべてが corefolder 画像上で使われていることを被覆率実測で確認できた（`#67BDBD` が 66%）。

### 検出実績

- **5 色以上を検出できたレコード: 93 件**（素朴な実装では 68 件）
- **Num 40** はチップが小さく・淡く・密に重なっており自動検出では 2 色しか取れなかったため、User から提供された 5 色を `--chips` で投入した。
- 実データ: **94 件**に配色を投入（5 色: 52 / 6 色: 20 / 7 色: 15 / 8 色: 7。**全件が 5 色以上**）
- `ColorPalette` を持たない 11 件は設定画そのものが無いレコード（Num 38 / 54 / 59 / 79 / 80 / 82 / 83 / 90 / 91 / 95 / 10-alt）。過去の median-cut 推測値は `--drop-unresolved` で削除済みで、**DB に推測値と実測値が混在しない**状態になっている。
- `npm test` 全件成功（32 ファイル / 354 件）。`npx prettier --check` パス。

### 残る確認事項

- **7〜8 色を検出した 22 件**は過検出の可能性がある（領域内で条件を緩めた副作用）。User による目視確認が望ましい。
- **Role の妥当性**は引き続き User レビュー待ち。被覆率の降順という機械的な順序であり、デザイン上の主従とは異なる場合がある。

## 未完了タスク

- **`Role` の妥当性は User レビュー待ち**。占有率の降順で Primary / Secondary / Accent を割り当てた仮の値であり、デザイン上の主従とは一致しない可能性がある。
- **`ColorName_JP` / `ColorName_EN` / `Formation` / `Note_*` は 95 件すべて `null`**。色に名前を付ける行為は創作内容にあたるため、User の手入力を待つ。
- 色語と一致しなかった 7 件（Num 12/21/26/33/39/62/87）の個別確認。背景除去の失敗か、色語辞書（`COLOR_WORD_RANGES`）の語彙不足かの切り分けが必要。
- **同系色ばかりが並ぶケースへの対処**。髪と衣装が同系色のキャラ（例: Num 1）では Primary / Secondary / Accent の 3 色がいずれも近い色相になる。占有率順という定義上は正しいが、配色として意味を持たせるなら色相の多様性を考慮した選び方（または User による差し替え）が要る。
- 画像を持たない 10 件（Num 38/54/59/79/80/82/83/90/91/95）の扱い（手入力するか、対象外とするか）。
- **UI 表示**: 現状 `$display: { section: 'profile' }` のみで汎用 renderer にフォールバックする。色スウォッチを表示する専用 section renderer（`sectionWrapper: 'colorPaletteSection'`）は別タスク。実データが入ってからブラウザ確認する。
- ~~**AIHints への機械導出は未実装**（`addon-ai-tag` 側の別タスク）。`ColorPalette` が実データに入ったら、`tools/patch-aihints.mjs` に `--apply-colorpalette`（仮称）を追加し、`palette_priority` を `ColorPalette` から導出する。これが入って初めて「palette が構造由来になる」という本来の狙いが完成する。~~
  → **✅ 2026-07-25 に完了を確認**（下記「追記」参照）。
- 他作品（FLInvestigator78 / ShouArRiders 等）への展開は未着手。スキーマはグローバルなので追加作業なしで使えるが、画像規約の差異は要確認。

---

## 追記（2026-07-25）: AIHints への機械導出は `addon-ai-tag` で完了済み

> **本ログは `develop` 側のため、`addon-ai-tag` で進んだ実装が反映されていませんでした。**
> 2026-07-25 の `develop` → `addon-ai-tag` マージ作業中に、実データとコードで裏取りしています。

| 項目 | 実測（`addon-ai-tag` / 2026-07-25） |
| --- | --- |
| `--apply-colorpalette` | ✅ 実装済み（`tools/patch-aihints.mjs` / `applyColorPaletteToAihints()`） |
| 確定値の保護 | ✅ `--force-palette` を明示しない限り既存の確定値を上書きしない |
| ドキュメント | ✅ `docs/ai-hints-usage.md` §9.11 |
| `palette_priority` 確定 | **91 件**（AIHints 保有 92 件中） |
| `palette_priority` が `null` | **1 件**（Num `10-alt` = `ColorPalette` を持たないレコード。**ソースが無いため null が正しい**） |
| dry-run | **`No changes to write.`**（適用済みかつ冪等） |

これにより「`palette_priority` が構造由来になる」という本ログ冒頭の狙いは**達成済み**です。

**残る関連事項**:

- 本ログの `Role` レビュー（未完了タスク欄）で値を変えた場合は、`addon-ai-tag` 側で
  **`--apply-colorpalette --force-palette` を再実行**して AIHints へ反映すること。
- SemiPrimary / SelfSecondary / Secondary は **AIHints が未 seed**（0 件）。`ColorPalette` は投入済み
  （8 / 7 / 11 件）なので、seed 後に `--apply-colorpalette` を続けて実行すれば同じ経路で埋まる。

**注意（再発防止）**: AIHints のコード・スキーマは `develop` に含めない運用のため、
**`develop` 側のログだけを読むと AIHints の実装状況を必ず古く見積もる**。状態を書くときは
`addon-ai-tag` をチェックアウトして実データを見ること。

---

## 追記（2026-07-31）: Num 80 への適用と、`patchColorPalette()` の未定義変数バグ修正

Num 80 の設定画（`concept/cnsp_img80.png`）が追加されたため、本ログ「未完了タスク」欄の
**「画像を持たない 10 件（Num 38/54/59/79/80/82/83/90/91/95）の扱い」のうち Num 80 が解消**した。

### 見つかった不具合: `patchColorPalette()` が必ず `error` で終わっていた

`tools/patch-colorpalette.mjs` の `patchColorPalette()` 内で、`upsertColorPaletteInRecord()` を
**未定義の変数 `anchorFields` を第 4 引数に付けて**呼んでいた。同関数は 3 引数しか取らないため、
呼び出しの時点で `ReferenceError` が発生し、直後の `try`/`catch` に捕まって全レコードが
`status: 'error'` に落ちる（＝ **`--apply` しても 1 件も書き込まれない**）状態だった。

- 影響範囲: チップ検出まで到達した全レコード。エラーは `catch` に飲まれるため、集計では
  `error: N 件` としか出ず、原因が読み取れない。
- 対処: 第 4 引数を削除（`upsertColorPaletteInRecord(text, spans[i], palette)`）。
- **他作品（FLInvestigator78 等）へ展開する際は、この修正が入った状態から始めること。**

### Num 80 の検出結果

| 項目 | 値 |
| --- | --- |
| ソース | `concept/cnsp_img80.png` |
| 検出チップ | **6 色**（`#FF9048` / `#C48455` / `#EEC694` / `#FFC5A3` / `#FC6932` / `#EF9D46`） |
| 過検出の有無 | チップ領域を 8 倍に拡大して目視確認。**6 個すべて独立した実在のチップ**（過検出なし） |
| Role の根拠 | **被覆率の実測ではなく、設定画上のチップ面積順**（`arts` / `corefolder` 画像が未登録のため `rankChipsByCoverage()` がフォールバック経路に入る） |
| `AppliesTo` | 色語「橙」が複数の `AppearanceDetail` に現れるため、オレンジ系 5 色すべてに同一の BodyPart 集合が転記されている（**要 User レビュー**） |

`corefolder` 画像が登録されたら `--force` で再実行すると、Role が実測被覆率ベースに更新される。

## 参考リンク

- [`2026-07-13_progress_aihints-palette-deadlock.md`](./.completed/2026-07-13_progress_aihints-palette-deadlock.md) — 本作業の発端（palette が埋まらないデッドロックの診断）
- [`2026-07-08_progress_aihints-structural-resync-proposal.md`](./.completed/2026-07-08_progress_aihints-structural-resync-proposal.md) — 構造的再同期（`ColorPalette` が入ると palette もこの「安全領域」に入る）
- `tools/extract-palette.mjs` / `tests/extract-palette.test.js`
- `data/db_type.json`（`$DefType[hashTag=ColorPalette]` / `$ScalarDef.#Hexcode_Color`）
- `data/db_meta.json`（`General.$VarsDef.$Def_ColorPalette` / `$EnumDef_ColorRole`）
