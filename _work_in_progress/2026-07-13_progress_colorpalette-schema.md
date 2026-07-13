# `ColorPalette` スキーマ新設と、既存画像からの配色候補抽出

## 目的

AIHints の `palette_priority`（カラーセット）が 92/92 件 `null` のまま埋まらない問題（[デッドロック診断ログ](./2026-07-13_progress_aihints-palette-deadlock.md)）に対し、User から **「色を AIHints に目測で埋めるのではなく、`develop` 側の本体 DB にフィールドとして持たせる」** 方針が示された。本作業はその実装。

**なぜこれが根治になるか**: 現状 `palette_priority` が「画像を目測しないと決まらない」のは、色が本体 DB のどこにも構造化されていないためである（`AppearanceDetail` に `#DesignAttr_Color` の**色名**（`"赤"` / `"red"`）はあるが HEX が無い）。色を本体 DB に持たせれば、`palette_priority` は `AppearanceDetail` と同じ **「構造由来」** になり、

- 目測が不要になる（再現性が出る）
- `--apply-appearancedetail` と同じ経路で **機械導出** できる
- [構造的再同期提案](./2026-07-08_progress_aihints-structural-resync-proposal.md)（第1階 provenance）の「安全に再生成できる領域」に入り、**再ビルドで巻き戻らなくなる**

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

## 未完了タスク

- **`Role` の妥当性は User レビュー待ち**。占有率の降順で Primary / Secondary / Accent を割り当てた仮の値であり、デザイン上の主従とは一致しない可能性がある。
- **`ColorName_JP` / `ColorName_EN` / `Formation` / `Note_*` は 95 件すべて `null`**。色に名前を付ける行為は創作内容にあたるため、User の手入力を待つ。
- 色語と一致しなかった 7 件（Num 12/21/26/33/39/62/87）の個別確認。背景除去の失敗か、色語辞書（`COLOR_WORD_RANGES`）の語彙不足かの切り分けが必要。
- **同系色ばかりが並ぶケースへの対処**。髪と衣装が同系色のキャラ（例: Num 1）では Primary / Secondary / Accent の 3 色がいずれも近い色相になる。占有率順という定義上は正しいが、配色として意味を持たせるなら色相の多様性を考慮した選び方（または User による差し替え）が要る。
- 画像を持たない 10 件（Num 38/54/59/79/80/82/83/90/91/95）の扱い（手入力するか、対象外とするか）。
- **UI 表示**: 現状 `$display: { section: 'profile' }` のみで汎用 renderer にフォールバックする。色スウォッチを表示する専用 section renderer（`sectionWrapper: 'colorPaletteSection'`）は別タスク。実データが入ってからブラウザ確認する。
- **AIHints への機械導出は未実装**（`addon-ai-tag` 側の別タスク）。`ColorPalette` が実データに入ったら、`tools/patch-aihints.mjs` に `--apply-colorpalette`（仮称）を追加し、`palette_priority` を `ColorPalette` から導出する。これが入って初めて「palette が構造由来になる」という本来の狙いが完成する。
- 他作品（FLInvestigator78 / ShouArRiders 等）への展開は未着手。スキーマはグローバルなので追加作業なしで使えるが、画像規約の差異は要確認。

## 参考リンク

- [`2026-07-13_progress_aihints-palette-deadlock.md`](./2026-07-13_progress_aihints-palette-deadlock.md) — 本作業の発端（palette が埋まらないデッドロックの診断）
- [`2026-07-08_progress_aihints-structural-resync-proposal.md`](./2026-07-08_progress_aihints-structural-resync-proposal.md) — 構造的再同期（`ColorPalette` が入ると palette もこの「安全領域」に入る）
- `tools/extract-palette.mjs` / `tests/extract-palette.test.js`
- `data/db_type.json`（`$DefType[hashTag=ColorPalette]` / `$ScalarDef.#Hexcode_Color`）
- `data/db_meta.json`（`General.$VarsDef.$Def_ColorPalette` / `$EnumDef_ColorRole`）
