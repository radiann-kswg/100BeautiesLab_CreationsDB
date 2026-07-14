# 最新のリファクタリング・仕様変更履歴

### fix: DeepL 用語集ソースの対訳ペア判定を是正（素キー優先 → `_JP`/`_EN` 優先）+ 丸括弧注釈の除去 (2026-07-14)

`dict_RaceType.json` の更新後に `glossary-conflicts.md` へ `Nekomata` / `HalfNekomata` / `LunaWolf` の 3 件が「和文↔英文の対応が取れない衝突」として現れた。調査の結果、辞書データではなく `tools/deepl/build-glossary-source.mjs` の対訳ペア判定バグだった。

- **原因（`extractPairs`）**: JP / EN を解決する際に**素キー（`RaceType`）を `_JP` / `_EN` より優先**していた。素キーの言語はファイルによって異なり（`dict_Area` の `Area` は和名だが `dict_RaceType` の `RaceType` は英語 ID）、後者では **JP 欄に英語 ID が入った偽ペア**（`Nekomata(Acquired)` ↔ `Nekomata / Warcat (Acquired)`）が生成されていた。`_EN` に `/` を含む 3 件だけがキー衝突として顕在化し、残りは**英語→英語の疑似エントリ 34 件**として静かに用語集へ混入していた（`Warfox (Acquired)` → `Warfox(Acquired)` 等）。
- **修正**: 明示された `_JP` / `_EN` を常に優先し、素キーはフォールバックに限定。英→英ゴミは **34 件 → 0 件**、JA→EN 側の英語ソース **31 件 → 0 件**。
- **丸括弧注釈の除去（`stripParenNotes`、旧 `stripReadingGloss` を一般化）**: 丸括弧は読み仮名（`算象(アリスマ)諸国`）にも補足注釈（`猫又(後天的)` / `Human (with Addon)`）にも使われるが、いずれも訳語そのものではないため**キー・訳先の双方から除去**して素形を正とする。これにより `猫又` と `猫又(後天的)` は同じ `Nekomata` へ集約され、注釈違いだけの衝突が生じない。ただし括弧の中身が**かなのみ**の読みグロスは DB 本文にその表記で出現するため、素形に加えて**原形も JA→EN のソースへ登録**する（マッチ網羅の維持）。
- **スラッシュ分割の拡張（`splitMultiForm`）**: 空白の有無を問わず `/` を区切りとして検知する。ただし空白なしのスラッシュは「**値全体に空白を含まない**」場合に限る（`LunaWolf/Warwolf`・`繁殖鼠/生体改造済みモルモット種族` は分割し、`Enigma Division, Demotion/Retrograde Research Department` のフレーズ途中の複合語スラッシュは分割しない）。JP 側にも適用し、併記形の各断片を JA→EN のソースへ展開する。
- **早見表を用語集生成・同期に連結**: Git 管理下の生成物である `docs/localization-glossary-quickref.md` が用語集ソースと食い違わないよう、`deepl:build-glossary` に `build-copilot-quickref.mjs` を連結し、`deepl:sync-glossary` は実行前に `deepl:build-glossary` を通すようにした（`package.json`）。早見表だけを更新しない逃げ道として `deepl:build-glossary:only` を追加。
- **早見表の出典統合（`build-copilot-quickref.mjs`）**: 出典キーの注記サフィックス（`(reading-gloss)`。旧 `(de-glossed)`）を剥がして元ファイルの見出しへ統合し（`normalizeSourceKey`）、同一 JP↔EN ペアの重複行を排除した。従来は `Localization/trans_PlaceName.json (de-glossed)` が別セクションとして末尾に切り出されていた。
- **早見表の base 括り見出し（`BASE_LABELS`）**: 出典ファイルではなく **base（フィールド名）** で横断的に節をまとめる仕組みを追加。`Class` を持つ辞書（`dict_Mikhail` / `dict_NeoLotusNinean` / `dict_SymphonyXVI` / `dict_Zerbas`）は所属ごとにファイルが分かれるが、早見表では「クラス（職掌）」1 つの表に統合される（同じ base の辞書が増えても自動追従）。これに伴い `glossary_source.json` の各エントリへ `base` を出力するようにした（`build-glossary-source.mjs`）。見出しラベルも追加: `dict_GenderType` → 「性別タイプ」、`trans_Society` → 「社会（Localization）」、`ref_Society` → 「社会（References）」。
- **影響範囲**: `tools/deepl/build-glossary-source.mjs` / `tools/deepl/build-copilot-quickref.mjs` / `package.json` / `docs/deepl-localization.md`（§2 コマンド表、§3-1 ワークフロー、§7 を「対訳ペアの判定と丸括弧注釈の除去」に改訂、§8-1 の区切り規則を更新）/ `docs/localization-glossary-quickref.md`（再生成）。**JSON データベースはこの変更では未変更**。
- 確認: `npm run deepl:build-glossary` / `npm run deepl:sync-glossary -- --dry-run` 実行。JA→EN 176 件（衝突 1 = `管理主` の単複差による意図的な登録なし）/ EN→JA 179 件（衝突 0）。並行して User が `dict_Artifact.json` / `ref_Society.json` を正規化したため、`哨戒` / `工作` の素形衝突と WDC/WDP の文脈依存衝突も解消済み。

### feat: 設定画のカラーチップから `ColorPalette` を確定 + 再利用可能なパッチスクリプト (2026-07-13)

前段（下記）では画像全体からの median-cut 推定で `ColorPalette` を入れていたが、**設定画（concept / catalog）に作者がカラーチップ（配色見本の丸）を描き込んでいる**ことが判明した。カタログ画像には `0x00b6d9` のような HEX コードが文字としても併記されており、これが作者の指定した配色そのものである。推定値をこの実測値へ差し替えた。

- **`$EnumDef_ColorRole` に `#ColorRole_Sub`（副色）を追加**: 実データの配色は 5〜6 色あり、Primary / Secondary / Accent の 3 役では足りなかった。4 色目以降を Sub とする。
- **`tools/patch-colorpalette.mjs`（新規）**: `--work` / `--db` を変えれば**他作品・他 DB にも再利用できる**パッチスクリプト（`tools/patch-aihints.mjs` と同じ流儀。既定 dry-run / `--apply` で書き込み / `--force` で再生成 / `--drop-unresolved` で確定できなかったレコードの推測値を削除）。
- **`detectSwatchChips()`（`tools/extract-palette.mjs`）**: カラーチップの検出。**2 段階検出**を採る — 確実なチップだけで**配色領域を特定**し、**その領域の中だけ**条件を緩めて再捜査する（`rescanPaletteRegion()`）。配色見本は 1 箇所にまとめて描かれるため、領域を絞ってしまえば閾値を下げてもノイズを拾う危険が小さい。実装上つまずいた点と対処:
  - チップが**重なって描かれている**（Num 48）→ 単純な「有色の連結成分」では全部が 1 つの塊に融合するため、**色が変わる境界で成分を切る**（同色の平坦領域を成分とする）。
  - チップの**大小が不揃い**（Num 75 は大きい黄色が半径 11.8px、青が 3.7px）→ 収縮回数だけで足切りすると小さいチップを落とす。領域内では下限を大きく下げて救済する。
  - **淡い色のチップが「ほぼ白＝背景」に、黒に近いチップが「暗色＝線画」に分類されて消える**（Num 19 の `#423F3F` 等）→ 領域内では**色による足切りをやめ**、純白（`#FFFFFF` ごく近傍）だけを紙面として除外する。カタログの中間色には `0xf4fae8` のようなほぼ白の色が実在するため、「明るい＝背景」では切れない。
  - **淡い配色では別々のチップが色空間で近接する** → 分割検出の統合しきい値が大きすぎると別チップを 1 つに潰す（Num 12/21 の `#FEF3D9` と `#FFEFE4` は距離 11.75）。分割された断片はべた塗りゆえ色が完全一致するので、しきい値を 6 まで絞った。
  - 検出実績: **5 色以上を検出できたレコードが 93 件**（素朴な実装では 68 件）。
- **`measurePaletteCoverage()`**: Role（主従）は、チップの各色が**キャラクター画像の何割を占めるか**の実測で決める。色そのものは作者指定のチップ値をそのまま使い、順序だけを実測で決める。
- **`--chips` による手入力の受け口**: 自動検出が原理的に届かないレコードのために、User が読み取ったカラーコードを渡せるようにした（`--records 40 --chips "#67bdbd,#a4daef,..."`）。手入力値も自動検出と同じ扱いで、被覆率の降順で Role を決め `AppliesTo` を転記する。設定画を持たない作品・DB へ展開する際の経路にもなる。
- **実データ**: NumberTales / Primary の **94 件**を median-cut 推定からチップ実測へ差し替えた（5 色: 52 件 / 6 色: 20 件 / 7 色: 15 件 / 8 色: 7 件。**全件が 5 色以上**）。うち Num 40 はチップが小さく淡く重なって自動検出では 2 色しか取れなかったため、User 提供の 5 色を `--chips` で投入（5 色すべてが corefolder 画像上で実際に使われていることを被覆率実測で確認）。設定画そのものが無い 11 件は `--drop-unresolved` で既存の推測値を削除し、**DB に推測値と実測値が混在しない**状態にした。
- **`tests/patch-colorpalette.test.js`（新規、21 件）**: Num 4 の検出結果が**カタログに印字された HEX コードと一致する**こと（正解が判っている回帰）、重なったチップの分離（Num 48）、小さいチップの救済（Num 75 の青）、4 色目以降が Sub になること、創作内容を埋めないこと、推測値の削除、手入力チップの正規化と優先を検証。
- 確認: `npm test` 全件成功（32 ファイル / 354 件）。`npx prettier --check` パス。

### feat: `ColorPalette` スキーマ新設 + 既存画像からの配色候補抽出ツール (2026-07-13)

キャラクターの配色（HEX）を本体 DB に構造化フィールドとして持たせる `ColorPalette` を新設した。従来 `AppearanceDetail` には `#DesignAttr_Color` の**色名**（`"赤"` / `"red"`）しか無く HEX が存在しなかったため、AIHints の `palette_priority` は画像を目測するしか埋める手段が無く、実データ 92 件すべてが `null` のままだった（`addon-ai-tag` 側の調査結果。`_work_in_progress/2026-07-13_progress_aihints-palette-deadlock.md`）。色を本体 DB に持たせることで、`palette_priority` を `AppearanceDetail` と同じ **「構造由来」** の値として機械導出できるようにする布石。

- **`data/db_type.json`**: グローバル `$DefType` に `ColorPalette`（`$Def_ColorPalette[]|#Null`）を追加（`AppearanceDetail` の直後、`$display: { section: 'profile' }`）。
- **`data/db_meta.json`（`General.$VarsDef`）**: `$Def_ColorPalette`（`Role` / `Hex` / `ColorName_JP` / `ColorName_EN` / `AppliesTo` / `Formation` / `Note_JP` / `Note_EN`）と `$EnumDef_ColorRole`（`#ColorRole_Primary` / `#ColorRole_Secondary` / `#ColorRole_Accent`）を新設。
- **既存資産の活用**: `Hex` の型には `$ScalarDef` に**定義済みだが未使用だった** `#Hexcode_Color`（`#RRGGBB` / `#RRGGBBAA`）を使用。`AppliesTo` は既存の `$EnumDef_DesignBodyPart` を再利用する。
- **`tools/extract-palette.mjs`（新規）**: 既存画像から配色候補を決定論的に抽出する入力補助ツール。**PNG デコーダを Node 標準 `zlib` のみで自前実装**（依存追加ゼロ。`sharp` 等のネイティブ依存を持ち込まない）。前景マスクは 4 段（透過除去 → 外周フラッドフィル → **外周の色分布からの背景色推定** → 線画の黒・紙面の白の除去）。median-cut で代表色と占有率を求め、`AppearanceDetail` の色語（`#DesignAttr_Color` / `#DesignAttr_Overview`）と HSV 範囲で照合して「この HEX は hair の 'red orange' に対応しそう」という根拠を付与する。`--draft` で `.private/` へ追記用の下書きメモを出力する。
- **`--apply` による実データ追記**: `data/Works_NumberTales/DataBases/db_Primary.json` の **95 件**へ `ColorPalette` を追記した（`AppearanceDetail` の直後 = `$DefType` のフィールド順に一致。画像を持たない 10 件はスキップ）。既定は dry-run で、`--apply` を明示したときだけ書き込む（`tools/patch-aihints.mjs` と同じ流儀）。
  - **書式非破壊**: `JSON.parse` → `JSON.stringify` の往復は prettier が 1 行に畳んでいる短い配列（`"corefolder_PNGPath": ["a", "b"]` 等）をすべて展開してしまい全行が差分になるため、`patch-aihints.mjs` と同様の**テキスト挿入**で実装（`scanTopLevelRecords()` / `findValueEnd()` / `insertColorPaletteIntoRecord()`）。結果 `git diff --numstat` は **3320 行追加 / 0 行削除**。
  - **書き込んだ項目**: `Role`（占有率の降順で Primary / Secondary / Accent を仮割当 = **要 User 確認**）/ `Hex`（既存画像からの機械計測値）/ `AppliesTo`（色語が一致した `AppearanceDetail` の `BodyPart` を転記）。
  - **書き込んでいない項目**: `ColorName_JP` / `ColorName_EN` / `Formation` / `Note_*` は 95 件すべて `null`。**色に名前を付ける行為は創作内容にあたるため、ツールも Claude も埋めない**（User が手入力する）。
- **`tests/extract-palette.test.js`（新規、31 件）**: PNG デコード（実アセットを使用）・色空間変換・median-cut・色語収集・下書き生成・テキスト挿入を検証。特に「主ソースは arts → corefolder → concept の優先順に従う」（前景比率で選ぶと単色のコアフォルダ球体が humanoid 清書イラストを押しのける不具合の回帰）、「創作内容（色名 / Formation / Note）は埋めない」、「挿入箇所以外のテキストを 1 文字も書き換えない」を固定。
- **実績**: NumberTales / Primary の全画像 155 枚をデコードして**エラー 0 件**。105 レコード中 95 件に追記（主ソース内訳: arts 58 / corefolder 28 / concept 9）。追記後の検証で `Hex` の型不適合 0 件 / `Role` の不正値 0 件 / 創作フィールドの誤記入 0 件。
- 確認: `npm test` 全件成功（31 ファイル / 333 件）。`npx prettier --check` パス。

### fix: R2 が本番へ一度も同期されていなかった問題を修正（`--remote` 欠落）+ CI の再同期条件を是正 (2026-07-13)

下記「`isPrivate` フィルタ順序」修正が本番 API で効いているかを検証したところ、**Cloudflare 実 API の R2 が完全に空**であり、R2 依存機能（グローバルメタ / 作品メタ / `_Commons` 適用）が稼働開始以来ずっと死んでいたことが判明した。`/api/v1/meta` は 503 (`Global meta unavailable`)、`/api/v1/:work/meta` は `{"key":"#Works_..."}` のみを返す状態だった。

- **根本原因（`pkg/cloudflare/scripts/migrate.mjs`）**: R2 アップロードの `wrangler r2 object put` に **`--remote` が付いていなかった**。wrangler v4 の `r2 object put` は既定でローカルシミュレータ（`.wrangler/state`）へ書き込むため、CI は 160 個の JSON を GitHub Actions ランナー内の一時領域に書いて破棄していた。D1 側（`d1 execute`）には元から `--remote` が付いており、R2 だけ欠落していた。CI ログには `[R2] ✓ <file>` と成功表示が出るため、ジョブは常に緑で気付けなかった。`--remote` を追加。
- **影響（実害）**: `getWorkMeta()` が常に null を返すため、**Cloudflare 実 API では `_Commons` / `_Secondaries` が一度も適用されていなかった**。実測で NumberTales / Secondary のレコードに `Belonging` / `RaceType` / `isTriple`（`_Secondaries[]._Commons` 由来）が欠落。さらに `isPrivate` も注入されないため、非公開指定の `0xFF(エフエフ)` が `/api/v1/NumberTales/Secondary/records` から取得できる状態だった（下記の順序修正で入れた Worker 側の多層防御も、workMeta が取れないため機能していなかった）。**D1 の `is_private` 列だけが唯一の防御であり、その算出も誤っていた**（下記参照）。
- **silent failure の再発防止（`migrate.mjs`）**: R2 アップロード失敗を `console.error` するだけで握り潰していたため、1 件でも失敗したら非ゼロ終了して CI を落とすようにした。
- **silent failure の再発防止（`pkg/cloudflare/worker.js`）**: `fetchJsonFromR2()` が全例外を無言で `null` に変換していたため、R2 が丸ごと空でも「データが無い」as-if で応答が続いていた。オブジェクト不在は `console.warn`、例外は `console.error` でログに残すようにした（`wrangler tail` / Workers Logs で追える）。
- **CI の再同期条件を是正（`.github/workflows/cf-api-sync.yml`）**: `sync-r2-d1` ジョブが **`data/**` の変更時にしか実行されない**ため、migration ロジックの変更（`is_private`の算出方法を変える等）が R2/D1 へ反映されなかった。実際、下記の順序修正を push した際も Worker はデプロイされたが D1 同期はスキップされている。新しく`migrate` フィルタ（`pkg/cloudflare/scripts/**`/`schema/**`/`worker.js`）を追加し、これらの変更でも再同期を実行するようにした。`worker.js` を含めるのは、`migrate.mjs`が`applyCommons()`/`isPublicRecord()`を worker.js から import しており、その変更が D1 の`is_private`算出結果を変えるため。あわせて`workflow_dispatch`（`both`/`sync-only`/`deploy-only`）を追加し、`data/\*\*` を変更しなくても手動で強制再同期できるようにした。
- **R2 アップロードのリトライ（`migrate.mjs`）**: 初回の本番同期で R2 API が一時的に `500 Internal Server Error` を返し、160 件中 1 件（`data/Works_FLInvestigator78/Dictionaries/db_meta.json`）が失敗した。逐次アップロードのため 1 件の瞬断で全体が落ちるので、線形バックオフ付きの 3 回リトライを追加。
- **R2 失敗が D1 投入を巻き添えにしないよう修正（`migrate.mjs`）**: 上記の失敗時、R2 ステップ直後の `process.exit(1)` により **D1 投入がスキップ**され、`is_private` の是正が D1 へ反映されなかった。R2 と D1 は独立しているため D1 投入は続行し、終了コードはスクリプト末尾で立てる（CI は赤くなるが D1 は同期済みになる）方式へ変更。
- **反映結果（本番で確認済み）**: develop への push により `sync-r2-d1` が実行され R2 が復旧。`/api/v1/meta` の 503 が解消し、`_Commons` の適用（`Belonging` / `RaceType` / `isTriple` が入る）と非公開レコードの除外（`/api/v1/NumberTales/Secondary/records` が 38 件 → **37 件**、`0xFF(エフエフ)` が消える）を実測で確認。DB 内検索・作品横断検索でも非公開レコードが返らないことを確認。
- 確認: `npm test` 全件成功（30 ファイル / 301 件）。R2 バケットが空であること（`wrangler r2 object get ... --remote` が `The specified key does not exist`）、`--remote` がリモートストレージ操作に必要であること（`wrangler r2 object put --help`）を実行して確認。本番 API への疎通確認まで完了。

### fix: SW / Cloudflare Workers の `isPrivate` フィルタ順序を修正（非公開レコードの公開を停止） (2026-07-13)

`pkg/` 追従作業（下記）で発見した「`isPrivate` の除外が `_Commons` 適用より前に走る」実バグを、本体 Service Worker と Cloudflare Workers 実 API でも修正した。`isPrivate` は `_Secondaries[]._Commons.isPrivate: true` のようにレコード自身ではなく**所属シリーズ側から注入**されることがあるため、`_Commons` 適用前に判定すると注入値が読まれず、非公開指定のレコードが公開されてしまう。実データでは NumberTales / Secondary の `0xFF(エフエフ)`（シリーズ「ヘキサデミカル・テールズ」）が該当し、本番 GitHub Pages で配信されていた。

- **`lib/sw-common.js`（3 経路）**: `filterPublicRecords()` を `applyCommonsToRecords()` の**後**へ移動。
  - `handleDbEndpoint()` / 検索ハンドラ: 順序を入れ替え。メタ欠損で `_Commons` をスキップした場合も、レコード自身の `isPrivate` 宣言は必ず尊重されるよう try/catch の外へ配置。
  - `handleBootstrapEndpoint()`: **非公開フィルタ自体が一度も呼ばれていなかった**（レコード自身が `isPrivate: true` を宣言していても素通り）。`pages/sw.js` はこのエンドポイントを `includeRecords=true` の既定で呼ぶため、キャラシート UI が叩く `/pages/v1/bootstrap` が VirtuesUs / SemiPrimary の非公開 2 件も含めて配信していた。フィルタを新規追加。
- **`pkg/cloudflare/scripts/migrate.mjs`（根本修正）**: D1 の `is_private` 列を**生レコード**から算出していた（`rec?.isPrivate ? 1 : 0`）ため、`_Commons` 経由の非公開指定が取りこぼされ、`records` の SQL フィルタ（`is_private = 0`）と FTS5 検索インデックスの**両方**に公開レコードとして投入されていた。`applyCommons()` 適用後の値から判定するよう修正（実データで `is_private=1` が 2 件 → 3 件に是正）。`data_json` は従来どおり生のまま保持し、`_Commons` 適用は Worker 側の読み取り時に行う。
- **`pkg/cloudflare/worker.js`（多層防御）**: `applyCommons()` / `isPublicRecord()` を named export 化（migrate.mjs から再利用し、ロジックの二重実装による乖離を防ぐ）。レコードを返す 4 経路すべてに `_Commons` 適用後の非公開判定を追加し、`migrate.mjs` を再実行していない古い D1 が残っていても非公開レコードを返さないようにした。あわせて `/api/v1/:work/:db/search` と `/api/v1/:work/search` が `_Commons` を適用せず生レコードを返していた不整合も是正（`records` エンドポイントと同じ扱いに統一）。なお `isPublicRecord()` は定義のみで**どこからも呼ばれていないデッドコード**だった。
- **`tests/private-commons-order.test.js`（新規、10 件）**: 「フィルタは必ず `_Commons` 適用の後」という不変条件を SW（DB 取得 / 検索 / bootstrap）と Workers / migrate の共有ロジックの双方で検証。実データ回帰も含む。修正前のコードへ戻すと 8 件が失敗することを確認済み（空テストでないことの検証）。
- **運用上の注意**: Cloudflare 実 API へ反映するには `scripts/migrate.mjs` の再実行（D1 再投入）が必要。再実行しない場合も Worker 側の多層防御により非公開レコードは返らないが、FTS 検索インデックスには残るため再実行を推奨。
- 確認: `npm test` 全件成功（30 ファイル / 301 件）。`migrate.mjs --dry-run` 完走（475 件）。

### fix: `pkg/` FS クライアント 4 種を本体 DB 機構へ追従（非公開制御バイパス・命名バグを含む） (2026-07-13)

`pkg/cloudflare` のみ 2026-07-11 まで追従していた一方、FS クライアント（`pkg/nodejs` 2026-06-22 / `pkg/python`・`pkg/csharp`・`pkg/mcp` 2026-06-02）が本体の DB 機構追加に追従できておらず、実害のあるバグを含んでいた。`pkg/` は `lib/sw-common.js` / `lib/data-common.js` の移植版であり自動追従しない設計だが、追従漏れを検出するテストが 1 本も無かったことが放置の一因のため、回帰テストも併せて新設した。

- **非公開制御のバイパス（実害あり）**: `DB_Hidden: true` の DB が一覧からは除外されるのに直接アクセス（`getRecords()`）では素通りしていた（`FLInvestigator78` / `UnprocessedDealer` の 55 件が取得可能だった）。`docs/api-sw-spec.md` §5.3 / §5.4 の「リストと直接アクセスの両方から 404」に合わせ、直接アクセスも遮断するよう修正。`Works_Hidden` も同様に対応。専用エラー型（`CreationsDBNotFoundError` / `CreationsDBNotFoundException`）を新設し、リポジトリ所有者のローカルツール向けに `includeHidden` オプション（既定 `false`）でオプトインできるようにした。
- **`isPrivate` フィルタ順序の修正（実害あり）**: `isPrivate` の除外が `_Commons` 適用**より前**に行われていたため、`_Secondaries[]._Commons.isPrivate: true` によってシリーズ単位で非公開指定されたレコードが公開されていた（NumberTales / Secondary の `0xFF(エフエフ)` 1 件。レコード自身は `isPrivate` を宣言していないため注入値が読まれていなかった）。`_Commons` 適用「後」に除外するよう 3 クライアントとも修正。**同じ順序の問題が `lib/sw-common.js` / `pkg/cloudflare/` にも存在したが、本番 GitHub Pages の公開範囲が変わるため本コミットでは修正を見送り、User 判断待ちとして記録した。→ その後 User 判断により修正済み（上記「SW / Cloudflare Workers の `isPrivate` フィルタ順序を修正」を参照）**。
- **JP/EN 命名の未追従（実害あり）**: 2026-06-22 の命名標準化（`Title` → `Title_JP` / `Works_Summary` → `Works_Summary_JP`）が `pkg/nodejs` にしか入っておらず、`pkg/python` / `pkg/csharp` の `list_works()` がタイトル・概要とも**空文字**を返していた。`Title_JP` / `Title_EN` / `Works_Summary_JP` / `Works_Summary_EN` へ追従。
- **`Works_Dir` オーバーライド（2026-07-11 の共通資料）**: `#Works_CommonReferences` が `listWorks()` には現れるのにレコードを一切取得できなかった。`Works_Dir` / `Works_Shared` の解決、`DB_Layer` が物理ディレクトリ名と同名の場合のレイヤー畳み込み、`DataBases/` を持たない作品の root フォールバック（`db_meta.json` / `db_type.json`）を実装。
- **`$IndexDef` のスキーマ駆動解決（2026-07-11 の DB 単位上書きを含む）**: `getRecord()` のインデックスキーが `'Num'` 決め打ちだったため、`Num` を持たない作品（`FLInvestigator78` → `Card.Suit`、`ShouArRiders` → `BeastType.Beast` 等）では常に `null` を返していた。`$IndexDef` / サイドカー `$IndexDef_<DbNorm>` から解決する `getIndexKey()` を新設し、`idxKey` 省略時の既定値として使用（明示指定時はそちらを優先）。導出規則は `pkg/cloudflare/scripts/migrate.mjs` の `resolveIdxKey()` と同一。
- **`_Secondaries` マッチングの完全移植**: `sec_SeriesTitle` のみの簡略一致だったものを、`sec_Category` / `sec_DesignedBy` を追加条件とするスコアリング方式（`lib/sw-common.js` の `findSecondaryCommons()` と同等）へ差し替え。`_ListLinkIf_<Field>` 条件付き commons にも対応。
- **その他の追従**: 旧作品名エイリアス（`Proxies` → `Works_DestinyFoxRecords`）、`DB_Image` / `Works_Shared` の pass-through、`#Loc_*` エントリの DB 一覧からの除外、`getWorkType()` の新設。
- **`pkg/mcp/server.mjs`**: Node.js クライアントを内部利用するため大半は自動追従。`get_record` の `idxKey` 既定値 `"Num"` を撤廃してスキーマ自動解決に委ね、照合に使われたキーを `{ found: false, idxKey }` で返すようにした。インデックスキーを事前確認できる `get_index_key` ツールを新設。
- **`tests/pkg.nodejs.test.js`（新規）**: 上記の全機構を実データに対する不変条件として検証（レコード件数のような変動値には依存させない）。18 件。
- **`docs/pkg-client-libraries.md`**: 「対応する DB 機構」節（対応済み / 未対応の一覧）、インデックスキー解決、非公開制御、テストの各節を追記。API 対応表に `getIndexKey` / `getWorkType` を追加。
- 確認: `npm test` 全件成功（29 ファイル / 289 件）。Node.js / Python / C# の 3 クライアントが同一データに対して同一結果を返すことを実行して確認（C# は Newtonsoft.Json / System.Text.Json 両バックエンドでビルド検証）。

### improve: 詳細ピルを Index ルート単位の集約表示へ変更 (2026-07-13)

複数サブフィールドを持つ Index（例: アンオースドロジカの `Logic` / `LogicAlt`、運命線探偵78の `Card`）の詳細ヒーローピルを、サブフィールドごとの個別ピルから「Index ルートごとに 1 ピル」へ集約した。

- **`pages/characters.js`**:
  - `collectIndexEntries()` の各エントリに `rootKey`（Index ルート名）を追加し、エイリアスIndex エントリにはルートラベル接頭辞を付ける前のテキストを `groupText` として保持。
  - 詳細ヒーローのピル生成を `rootKey` 単位のグループ描画に変更。複数エントリのグループは「ルートラベル（`$DefType` の `hashTag_JP/EN`）+ サブフィールド一覧」の集約ピル（`.pill--index-group`）として描画し、グループ内の直リンク可能エントリ（例: `Logic.Num`）でピル全体をリンク化する。1 エントリのみのグループ（スカラー Index 等）は従来どおりの単一ピル表示を維持。
  - サブフィールドの表示順は `$IndexDef` の typedef 宣言順（`$display.index.order` 指定があれば優先）とし、フィールド情報は `.pill__group-items` の 1 ユニットにまとめて、折り返し時の改行は「ルートラベルとフィールド情報の間」を優先させる（直リンク対象の選択は従来どおり優先度順）。
  - `asset-version` を `2026.07.13.3` へ更新。
- **`pages/characters.sass` / `pages/characters.css`**: `.pill--index-group` / `.pill__group-label` / `.pill__group-items`（フィールド情報の折り返しユニット）/ `.pill__group-item`（項目間は「・」区切り）を追加。
- **`tests/pages.characters.ui-output.test.js`**: UnauthedLogica（`Logic`/`LogicAlt` の 2 グループ集約・宣言順表示・直リンク keyPath）と NumberTales（スカラー Index の非グループ維持）の回帰テスト 2 件を追加。
- 確認: `npm test` 全件成功（28ファイル / 273件）。実ブラウザで UnauthedLogica（ニッキー）・FLInvestigator78（フェニクス）・NumberTales（1）の表示を確認。
- 一覧チップ・直リンク照合（`idx` / `idxKey`）・`_DBLink` 解決には変更なし（表示レイヤーのみの変更）。

### add/fix: Index 機能拡張（エイリアスIndex・Index辞書のルート合流/nullキー対応）とネストIndex二重ネスト修正 (2026-07-13)

アンオースドロジカの `DB_Primary`（`Model`）/ `DB_PrimaryMobs`（`Logic`）Index分割で顕在化した Index 解決不全を修正し、汎用のIndex機能を2点拡張した。

- **fix（実バグ）: `#Index` 正規化の二重ネスト**（`lib/data-common.js` の `TypeDefUtils.normalizeValueByTypeSpec()`）: ネストIndexのフィールド値を rootKey で二重に包んでいた（`Card: {Card:{Suit,...}}`）ため、ネストIndexを持つ全作品（運命線探偵78・パストダイヴァー・アンオースドロジカ等）で一覧チップ・詳細ピル・直リンク照合・辞書補完が黙って外れていた。フィールド値は「サブフィールドを直接持つオブジェクト」（`Card: {Suit, Num}`）を正とし、プリミティブは `{主キー: 値}` へ、旧二重ネスト形は unwrap する。UI 側 `collectIndexEntries()` にも旧形 unwrap 耐性を追加。
- **add: エイリアスIndex（汎用）**: `$DefType` トップレベルで `#Index` 型を宣言した field のうち、現在のDBで解決された `$IndexDef` の rootKey 以外を自動的に「エイリアスIndex」として扱う（例: `LogicAlt`）。形状は hashTag 一致の `$IndexDef*` → 現行 IndexDef の順で継承。enrich（正規化・辞書補完）、詳細ピル表示、直リンク（`idxKey=LogicAlt.Num` 等）に対応。`$display: { index: "none" }` で opt-out 可。`TypeDefUtils.collectIndexAliasDefs()` / `getWorkIndexAliasDefs()`（UI）を新設。
- **add: Index 辞書解決のルート合流フォールバック + null キー許容**（`EnrichmentProcessor.supplementIndexFieldFromVarsDef()`）: 辞書リストの解決を `$Def_<rootKey>.#List_<key>` → ルート `#List_<key>` → ルート `#Dict_<key>` の順にフォールバック（`Dictionaries/dict_*.json` + `compatListKey` の実行時合流がそのまま Index 辞書として機能する）。また、キー値 `null` のレコード（例: `Model: {ModelSeries: null}`）も辞書側に null キー行があれば解決できる（UI では表示のみ・直リンク識別には不使用）。
- **data: `data/Works_UnauthedLogica/Dictionaries/db_meta.json`**: `#Dict_ModelSeries` / `#Dict_LogicSeries` をカタログ登録（辞書本体 `dict_ModelSeries.json` / `dict_LogicSeries.json` は User 作成済み）。null キー行のラベル値は User 入力に委ねる。
- **`pages/characters.js`**: `pickPrimaryIndexSubDef()` に `#IndexListKey` のスコアを追加、詳細の汎用行からエイリアス field の二重表示を抑止、composite 直リンク生成から null キー/エイリアスエントリを除外。`asset-version` を `2026.07.13.1` へ更新。
- **`tests/enrich.index-alias-dict.test.js`（新規）**: 正規化・エイリアス収集・辞書フォールバック/null キー・実データ統合（UnauthedLogica / FLInvestigator78 回帰）の13テストを追加。
- 確認: `npm test` 全件成功（28ファイル / 271件）。実ブラウザで UnauthedLogica（両DB・エイリアス直リンク・辞書ラベル）、FLInvestigator78 / PastDivers / NumberTales / DestinyFoxRecords の一覧チップ・詳細ピル復帰を確認。
- 仕様詳細: `docs/schema-meta-processing.md` §3.5.2（エイリアスIndex）/ §3.5.3（辞書解決と null キー）。

### fix: NumberTales 666(リリス)/3x11 の AppearanceDetail 参考画像の参照切れを修正 (2026-07-12)

外見デザイン詳細（`AppearanceDetail.img_PNGName`）の参照とファイル実体の不一致3件を修正した。

- **`Images/DB_SelfSecondary/attr/numberMark/`**: `attr_numbertMark666-lot.png`（「numbertMark」打ち間違い）→ `attr_numberMark666-lot.png` にリネーム。
- **`db_SemiPrimary.json`（666 humanoid ブローチ）**: `attr_costumeItem666mp-brooch`（SelfSecondary 側にしか無い `mp` 付きファイル名）→ `attr_costumeItem666-brooch` に修正（画像は別DBフォルダから解決しない規約のため）。
- **`db_SemiPrimary.json`（3x11 emblem）+ 画像移動**: DB値 `attr_emblem3x11-brooch` を実ファイル名 `attr_emblem3x11-doubleBrooch` に修正し、`attr/costumeItem/` に誤配置されていた画像を `DesignElement`（`#Element_Emblem`）駆動の規約どおり `attr/emblem/` へ移動。
- **`tests/data.shape.test.js`**: `img_PNGName` の実ファイル存在チェックを db_Primary 限定から NT 全DB（Primary/Secondary/SemiPrimary/SelfSecondary）へ拡張（今回の3件はこの拡張で検出）。
- 確認: `npm test` 全件成功（27ファイル / 258件）。実ブラウザで 666-mp / 666 / 3x11 の参考画像が全件 HTTP 200 で解決されることを確認。

### fix: NumberTales `Costume` 辞書のカタログ未登録によるラベル未解決を修正 (2026-07-12)

`AppearanceDetail` エントリの衣装差分タグ（`usual` / `idol` 等）が生コードのまま表示されていた問題を修正した。辞書本体 `data/Works_NumberTales/Dictionaries/dict_Costume.json` は存在していたが、辞書カタログ（`Dictionaries/db_meta.json`）に `#Dict_Costume` が未登録だったため、実行時の `$VarsDef` 合流から漏れて `formatValueForDisplay` の `#DictIndex` 解決が失敗していた。UI/レンダラー側は無改修。

- **`data/Works_NumberTales/Dictionaries/db_meta.json`**: `#Dict_Costume`（`keyField: "Costume"` / `compatListKey: "#List_Costume"`）をカタログへ登録。
- **`tests/pages.characters.ui-output.test.js`**: `Costume` タグが辞書解決済みラベル（通常衣装/アイドル衣装）で表示され、生コード（usual/idol）が残らないことを検証する回帰テストを追加。
- 確認: `npm test` 全件成功（27ファイル / 255件）。実ブラウザで JP（通常衣装/アイドル衣装）・EN（Usual Costume / Idol Costume）両モードの表示を確認。

### improve: VRM 3Dビューアと subFields 系参考画像を2カラムレイアウト化 (2026-07-12)

キャラシートの縦方向の占有面積を抑えるため、VRM 3Dビューアカードと `AppearanceDetail` / `TailsUnit` エントリを横並びの flex 2カラム構造に変更した。

- **`lib/section-renders/vrmViewer.js`**: カードDOMを「ポスター画像（`.model-viewer__media`）+ 起動ボタン/3Dステージ/ヒント/エラー（`.model-viewer__body`）」の2カラムに再構成。3Dビューアはポスターの右隣に並ぶ。
- **subFields 系共通レイアウトクラスの新設**（`pages/characters.sass`）: `.subfield-entry` / `.subfield-entry__main` / `.subfield-entry__reference-image` を新設し、参考画像付きエントリを「テキスト情報（左）+ 参考画像（右・幅120pxの正方形サムネイル）」で描画する（狭幅時は wrap で縦積み）。field 固有クラス（BEM）に併せて付与する方式で、今後の renderer にも横展開可能。
- **`lib/section-renders/appearanceDetail.js` / `tailsUnit.js`**: エントリを `__main`（ヘッダー/属性/ノート）+ `__reference-image` に分離し、共通クラスを付与。レイアウト用インラインstyleはSASSへ移管。
- **`pages/characters.html`**: `asset-version` を `2026.07.12.3` に更新。
- **`tests/section-renders.vrmViewer.test.js`**: カードDOMの2カラム構造にテストを追従（既存の `.tailsunit__reference-image` 参照テストはクラス名維持により無改修）。
- 確認: `npm test` 全件成功（27ファイル / 254件）。ローカルHTTPサーバー上で実ブラウザ確認済み（3Dビューア起動・外見デザイン詳細・尻尾ユニットの右隣画像表示）。

### add: NumberTales VRMアバターの3Dビューア表示に対応 (2026-07-12)

`data/Works_NumberTales/VRMs/DB_Primary/corefolder/` に格納された VRM 3Dモデル（`.vrm` + 同名 `.png` サムネイル）を、キャラシート上で回転・拡大できる3Dビューアとして表示できるようにした。既存の `Images` 用パイプライン（`ImageProcessor`/ギャラリー描画、PNG専用に決め打ち）には一切手を入れず、`TailsUnit`（構造化データ + 専用 section-renderer + client側URL構築ヘルパー）と同じ設計パターンを踏襲することで、`lib/data-common.js`（enrich/SW共通処理）・Cloudflare Workers 側を無改修のまま UI 層だけで完結させた。three.js / `@pixiv/three-vrm` は「3Dビューアを起動」ボタン押下時にのみ動的 `import()` し、通常のページ閲覧やVRMを持たないキャラの表示では一切ロードしない。

- **`data/Works_NumberTales/DataBases/db_type.json`**: `Images` の直後に新規トップレベル `VRMs`（`corefolder_VRMPath`: `#VRMFilePath[]`）を追加。`$display: { sectionWrapper: "vrmViewerSection" }`。
- **`data/db_meta.json`（グローバル）**: `CreationWorks.#Works_NumberTales.$DetailLayout.subFields` に `"VRMs"` を追加。
- **`data/Works_NumberTales/DataBases/db_Primary.json`**: 該当4レコード（`Num: 4, 16, 20, 25`）に `VRMs.corefolder_VRMPath`（例: `["16/vrm_corefolder16"]`、拡張子なしファイル名規約は `corefolder_PNGPath` と同じ）を追加。
- **`lib/section-renders/vrmViewer.js`（新規）**: `CharacterSectionRendererRegistry` へ `vrmViewerSection` を登録。サムネイル即時表示 + 起動ボタン + 3Dステージのカードを描画し、ボタン押下時のみ three.js 一式を動的import、canvas がDOMから切断されたら自動でレンダリングループを停止・破棄する。
- **`pages/characters.js`**: `buildVrmAssetUrl(relPath, ext)`（`Images` ではなく `VRMs` 配下を組み立てる専用ヘルパー、`buildTailsUnitImageUrl` と同じ役割分担）を追加し、`renderStandaloneFieldSection` の helpers に配線。`lib/section-renders/vrmViewer.js` の import を追加。
- **`pages/characters.html`**: three.js / `@pixiv/three-vrm`（同梱・`pages/vendor/`）解決用の import map を追加。`asset-version` を更新。
- **`pages/vendor/`（新規）**: `three@0.185.1` / `@pixiv/three-vrm@3.5.5` の配布物を同梱（外部CDN非依存）。`THIRD_PARTY_NOTICES.md` にライセンス・更新方法を記載。
- **`pages/characters.sass`/`.css`**: `.model-viewer` 系のスタイルを追加。
- **`tests/data.shape.test.js`**: `VRMs.corefolder_VRMPath` の値規約・参照ファイル実在を検証するケースを追加。
- **`tests/section-renders.vrmViewer.test.js`（新規）**: `vrmViewerSection` の登録・`match()`・空配列時の `null` 返却・カードDOM構築（three.js未importで検証可能）を検証。
- 確認: `npm test` 全件成功（27ファイル / 254件）。Playwright + ローカルHTTPサーバーでの実ブラウザ確認まで完了（3Dビューア起動・マウス操作での回転・別キャラ遷移時のクリーンアップ・遅延ロード・VRM非保持キャラでの非表示）。詳細・発見した修正点（`buildVrmAssetUrl` のカテゴリフォルダ名欠落バグ）は `_work_in_progress/2026-07-12_progress_vrm-viewer.md` に記録。

### refactor: NumberTales `NumberMarkLocation` / `IdentityMotif` を廃止し `AppearanceDetail` へ一本化 (2026-07-11)

両フィールドは `scripts/migrate-appearance-detail.mjs` により `AppearanceDetail`（`$Def_AppearanceDetail[]`）へ試験運用として並走追加されていたが、全該当95レコード（105レコード中）で移行済み（片方のみ持つレコードなし、移行漏れなし）を確認できたため、旧フィールドを廃止した。

- **`data/Works_NumberTales/DataBases/db_type.json`**: `NumberMarkLocation` フィールド宣言、専用型 `$Def_NumberMarkLocation` / `$Def_NumberMark`（他フィールド未使用）を削除。
- **`data/db_type.json`（グローバル）**: `IdentityMotif` フィールド宣言を削除。
- **`data/db_meta.json`（グローバル）**: `IdentityMotif` 専用型 `$Def_FormsMotif`（他フィールド未使用）を削除。
- **`data/Works_NumberTales/DataBases/db_Primary.json`**: 該当95レコードから `NumberMarkLocation` / `IdentityMotif` を削除（`scripts/migrate-remove-nummark-identitymotif.mjs` で実施。ファイル全体の独自インデント記法を壊さないよう、`JSON.stringify` 再シリアライズではなく行ベースの外科的削除で対応）。
- **`lib/section-renders/formsMotif.js`**: `formsMotifSection` レンダラーを削除（参照元フィールドの廃止に伴う）。
- **`pages/characters.js`**: 上記ファイルの `import` を削除。sectionWrapper未登録時のスキップ挙動を説明するコメント例を `IdentityMotif` から `AppearanceDetail` に更新。
- **`docs/wrapper-summary-registry.md`**: `formsMotifSection` の記載を除去。
- **`lib/section-wrapper-common.js`/`tests/section-wrapper-common.test.js`**: built-in section renderer 一覧コメントから `formsMotifSection` を除去。
- 確認: `npm test` 全件成功（243件。既存の無関係な1件失敗 `TailsUnit_PNGName` 拡張子欠落は今回変更前から発生していたため対象外、別課題として記録）。

### fix: SW 登録不能（importScripts 同一スコープでの `const` 再宣言）を修正 (2026-07-11)

`Works_Proxies` 統合（下記 refactor）の際に `lib/data-common.js` へ追加したトップレベル `const LEGACY_WORK_DIR_ALIASES` が、`lib/sw-common.js` 側の同名 `const` と衝突していた。Service Worker は `importScripts()` で両ファイルを**同一グローバルスコープ**へ読み込むため、`const` の同名再宣言は SyntaxError となり、`pages/`・`svc/`・`api/` の 3 つの SW すべてが「ServiceWorker script evaluation failed」で登録・更新不能になっていた（function 宣言同士の重複は classic script では合法＝後勝ちのため無害）。ブラウザは SW 更新失敗時に**古い SW を使い続ける**ため、既存利用者には「共通資料（`#Works_CommonReferences`）だけ 500/404 になる」という形で顕在化し（旧 SW は `Works_Dir` オーバーライド未対応のため `/data/Works_CommonReferences/...` へ直行して 404）、新規訪問者には SW 全機能が動かない状態だった。

- **`lib/data-common.js`**: 衝突していた `const` を `DATA_COMMON_LEGACY_WORK_DIR_ALIASES` へ改名（`resolveWorkDirName()` の function 重複による後勝ち上書き設計はそのまま維持）。
- **`tests/sw.importscripts-scope.test.js`（新設）**: 各 SW スコープ（`pages`/`svc`/`api` + 共通 lib 群）でトップレベル `const`/`let`/`class` のファイル間再宣言が無いことを検証する回帰テストを追加。
- 確認: `npm test` 全件成功（241件 + 新規3件）。実ブラウザで SW 再登録 → 共通資料の meta / DB 一覧 / レコード一覧 / 詳細表示 / Region8 代表画像の表示を確認。

### add: `data/References/`（全作品共通の辞書）と `data/GeneralImages/`（全作品共通の画像）を「共通資料」仮想作品として公開 (2026-07-11)

これまで表示専用の「shared layer 上乗せ」（各作品のReferences層DB表示に `data/References/db_type.json` を合流するだけ）でしか使われていなかったグローバル `data/References/`・`data/GeneralImages/` を、`#Works_CommonReferences`（表示名: 共通資料 / Common References）という仮想作品として、既存の `works/{work}/db/{dbName}` の仕組みでそのまま閲覧できるようにした。物理フォルダは一切移動せず（既存の shared layer 機構を壊さないため）、宣言的なオーバーライドで解決する設計。

- **`data/db_meta.json`（グローバル）**: `CreationWorks` に `#Works_CommonReferences`（`Works_Dir: "References"`, `Works_ImagesDir: "GeneralImages"`, `Works_Shared: true`）を新設。
- **`data/References/db_meta.json`**: 5つの `Databases.#Ref_*` エントリ全てに `DB_Layer: "References"` を追加。`#Ref_Region8` には特定レコードに紐づかないDB全体の代表画像として `DB_Image: "cnsp-map_region8.png"` を追加。
- **`data/References/db_type.json`**: `$IndexDef`（`Term_JP`）を新設（実データが自然キーとして使用している値）。
- **`data/db_type.json`（グローバル）**: `$MetaType.$Def_DatabaseCatalog.$DefType` に `DB_Image`（DB全体の代表画像ファイル名）を追加。
- **`lib/sw-common.js`**: `DataFetcher` に `getWorksDirOverrides()`/`resolveWorkDir()`（`Works_Dir` オーバーライドのTTLキャッシュ付き解決、既存 `WORK_CTX_CACHE` と同じ方式）と `fetchWorkBaseMeta()`（`DataBases/db_meta.json` が無ければ直下へフォールバック）を新設。`readWorkMeta`/`readWorkType`/`readRefMeta`/`readLocMeta`/`readDB`/`listWorkDBs` を更新し、`layer===workDir` の場合にレイヤーセグメントを畳み込む規則を追加（既存作品は非該当のため無影響）。`decorateDatabaseCatalogEntries()`/`buildWorkCatalogEntry()` に `DB_Image`/`Works_Shared` のpass-throughを追加。
- **`pages/characters.js`**: `resolveWorkDirName()` を `Works_Dir` オーバーライド対応に更新（シグネチャ不変）。新設 `resolveImagesRootOverride()`。`buildImagePath()`/`resolveImageStatically()` の画像パス組み立てを `imagesBase`（オーバーライドがあれば別ルート、無ければ従来通り `<wdir>/Images`）経由に統一。新設 `resolveDbCoverImageUrl()` を `renderSelectionMeta()` から呼び出し、DB概要欄に代表画像（`#meta-db-image`）を表示。`populateWorks()` は `Works_Shared:true` の項目を別 `<optgroup>` へ分離し、個別の創作タイトルと混同されないようにした。`renderReferenceConnectionsSection()` の `RelatedTerms` リンク先ハードコード（実在しない `'Glossary'` DBを指して常に壊れていた）を、新設した共通 `Vocabulary` DB（`#Works_CommonReferences`/`Vocabulary`）への参照に修正。
- **`pages/characters.html`/`.sass`/`.css`**: DB概要欄に `#meta-db-image`（`.meta-overview__cover`）を追加。`asset-version` を更新。
- **`pkg/cloudflare/worker.js`**: `getWorksDirOverrides()`/`resolveWorkDirWithOverride()` を新設し、`getWorkMeta()`（root フォールバック追加）・`resolveAndFetchDbFromR2()`（レイヤー畳み込み追加、現状ルーティングからは未使用のためコード整合性維持目的）に反映。
- **`pkg/cloudflare/scripts/migrate.mjs`**: `resolveWorkDirForMigrate()`/`readWorkBaseFile()` を新設し、D1投入（`dbs`/`records`テーブル）の作品別メタ・型定義読み込みに `Works_Dir` オーバーライドとroot フォールバックを反映。R2アップロード（`data/**/*.json` を無条件・再帰的にアップロードする既存実装）は変更不要（既にグローバルReferencesも対象に含まれていたため）。**副次発見の既存バグ修正**: `resolveIdxKey(undefined)` が既定値 `"Num"` を返すため `idxKey = resolveIdxKey(dbSpecificType) || defaultIdxKey` が常に `"Num"` に固定され、work-level `$IndexDef`（ネスト型）が事実上死んでいた（`--dry-run`で発覚: `FLInvestigator78`/`ShouArRiders`/`UnibyteLive` の D1 `records.idx_key` が常に誤って `'Num'`・`idx_value`が空文字になっていた）。`dbSpecificType ? resolveIdxKey(dbSpecificType) : defaultIdxKey` に修正し、正しくネスト型indexKey（`Card.Suit`/`BeastType.Beast`/`Letter.AlphaGen`等）が使われるようにした。
- 既知の制限（今回スコープ外、docsに明記）: サーバ/enrich側の画像解決（`lib/data-common.js`の`ImageProcessor`）はオーバーライド未対応（UIは独自解決のため実害なし）。Cloudflare Workers/D1側は他の実作品自体のReferencesレイヤーマージ（`readRefMeta`相当）に依然未対応（既存の別ギャップ）。`data/GeneralImages/Ref_Region8/cnsp-map_region8.png`はDB代表画像として今回対応、per-record画像としての追加対応は行っていない。
- **`tests/sw.db-layer-routing.test.js`**: `Works_Dir`オーバーライド解決・root フォールバック・レイヤー畳み込みの検証テストを追加。
- **`tests/data.shape.test.js`**: `Works_Dir`/`Works_ImagesDir`/`Works_Shared`・5つの`#Ref_*`エントリの`DB_Layer`・`$IndexDef`の存在検証テストを追加。
- **`tests/pages.characters.ui-output.test.js`**: `resolveWorkDirName`/`resolveImagesRootOverride`のオーバーライド反映、`populateWorks()`の`<optgroup>`分離、`RelatedTerms`リンク先修正の検証テストを追加（既存1件は新しいリンク先に合わせて更新）。
- **`docs/api-sw-spec.md`**: §5.5（新設）に本機構の全体仕様を追記。§3.3/§5.1/§5.2/§7にも関連箇所を追記。
- **`docs/schema-meta-processing.md`**: §2.3/§4.1/§4.3に`Works_Dir`/`Works_ImagesDir`/`Works_Shared`/`DB_Image`/レイヤー畳み込み規則を追記。
- 確認: `npm test` 全件成功（226件）。

### refactor: `Works_Proxies` を `Works_DestinyFoxRecords` へ統合 (2026-07-11)

「運命線狐の記録（フィジカル9）」（`Works_DestinyFoxRecords`）と「ラジアン代理」（`Works_Proxies`）はどちらも作者の近況報告用の作品で、既に `AnotherRegions_DBLink` で相互クロスリンクされていた（DFRの `Unit:"rad"` レコード ⇔ Proxiesの `Generation:2` レコードが同一人物「二春」を指す）。運用上1タイトルにまとめた方が見やすいという方針のもと、`Works_Proxies` を `Works_DestinyFoxRecords` の `Proxy` DB として物理統合した。従来2つの別Worksとして扱っていた理由は `$IndexDef`（Unit=物理単位 vs Generation=代理世代）の型・意味が異なるためで、`$IndexDef` は Work単位に1つしか持てない設計だったため、まず DB単位の上書きを可能にするアーキテクチャ拡張から着手した。

- **`data/db_type.json`（グローバル、変更なし）/ 作品別 `db_type.json`**: `$IndexDef` はサイドカーキー `$IndexDef_<DbNorm>`（例: `$IndexDef_Proxy`）でDB単位の上書きを宣言できるようにした（`pkg/cloudflare/scripts/migrate.mjs` の既存の `$IndexDef_${dbNorm}` 命名規則に合わせた）。未宣言のDB/作品は常に work既定の `$IndexDef` にフォールバックするため、既存9作品は無変化。
- **`lib/data-common.js`**: `EnrichmentProcessor.resolveIndexDefForDb(ctx, dbName)` を新設し、`enrichRecords()`/`searchRecords()`/`normalizeRecordByTypeDef()` の `#Index` 解釈すべてで共通に使用。あわせて `resolveWorkDirName()` に旧作品名エイリアス（`Proxies` → `Works_DestinyFoxRecords`）を追加（SW実行時は `importScripts` の読み込み順でこのファイルの定義が最終的に有効になるため、`lib/sw-common.js` 側の同名関数だけでなく必ずここにも同じ変更が要る）。
- **`pages/characters.js`**: `getWorkIndexField(workKey, globalMeta, dbName)` に第3引数を追加しDB固有Indexを解決。`resolveWorkDirName()` にも同エイリアスを追加。`ISSUE_REPORT_WORK_LABELS` から `Proxies` エントリを削除。起動シーケンスに `?work=Proxies` 直リンク互換シム（`DestinyFoxRecords`/`Proxy` へ読み替えて `history.replaceState` でURL正規化）を追加。
- **`lib/sw-common.js`**: `resolveWorkDirName()` に同エイリアスを追加（多層防御）。`buildDefaultDatabaseCatalogLabels()` の到達しないプリセットキー `Proxies` を実際のDB名 `Proxy` に是正。
- **データ統合**: `data/Works_Proxies/**` を `data/Works_DestinyFoxRecords/**` へ移動・マージ（`Images/DB_Proxy/`, `DataBases/db_Proxy.json`, `Dictionaries/dict_Formation.json` の `orbify` エントリ, `Localization/trans_PersonName.json`/`trans_Rank.json`, `References/ref_Vocabulary.json` 等）。`AnotherRegions_DBLink` は同一Work内リンクとなったため `_Work` 指定を削除。`data/db_meta.json` から `#Works_Proxies` を削除。グローバル `data/Localization/trans_*.json` の `Scope` 配列に残っていた `Works_Proxies` も整理。`data/Works_Proxies/` は削除。
- **`tests/enrich.indexdef.perdb.test.js`（新規）**: `$IndexDef_<DbNorm>` サイドカー解決の単体テスト（既存9作品の後方互換を実データで確認）。
- **`tests/legacy-work-alias.test.js`（新規）**: 旧 `Works_Proxies` → `Works_DestinyFoxRecords` ディレクトリエイリアスの単体テスト。
- **`tests/enrich.dblink.jump.merge.test.js`**: 統合後の同一Work内 `AnotherRegions_DBLink`（`_Work` 省略）マージの実データ回帰テストを追加。
- **`tests/pages.characters.ui-output.test.js`**: `Works_Proxies` 参照パスを `Works_DestinyFoxRecords` へ更新。
- **`tests/data.shape.test.js`**: `Works_Proxies` フォルダの非存在、`$IndexDef_Proxy` 宣言、`#DB_Proxy` カタログ登録を明示的にアサートするテストを追加。
- **`docs/schema-meta-processing.md`**: §3.5.1（新設）にサイドカーキー方式を追記。
- 確認: `npm test` 全件成功（233件）。`OldTitles`/`Works_Summary` への統合履歴文言の追記は creative content のため見送り、User確定待ち。

### add: `#PNGFilePath`/`#PNGFileName` 画像フィールド専用のDB/Work横断参照 `_DBCrossLinkPath` を新設 (2026-07-11)

`../../DB_SemiPrimary/...` のような手書き相対パス（ブラウザのURL正規化に依存した非公式な回避策で、同一作品内のDBまたぎしかできず、SW/enrich側の `ImageProcessor.resolveImagePath()` では別のバグにより `Images/` セグメントが欠落する）を廃止し、`_DBLink` を参考にした画像パス専用の軽量な宣言的機構 `_DBCrossLinkPath` を新設した。`_DBLink`（対象レコードをインデックスで検索してフィールド値を穴埋めするレコード参照機構）とは異なり、`_DBCrossLinkPath` は対象Work/DBの画像フォルダ内の相対パスを直接指すだけで、対象レコードの検索・照合を一切行わない。

- **`data/db_type.json`（グローバル）**: `$Def_DBLinkRef` の直後に `$Def_DBCrossLinkPath`（`_DB`〈必須〉/`_Work`〈省略可〉/`_Field`〈省略可〉/`_IsoPath`〈必須・`#PNGFilePath`〉）を新設。`_DB`/`_IsoPath` は自動解決が困難なため必須、`_Work`/`_Field` は明確なデフォルト（現在Work／wrapperが出現したフィールド名）があるため省略可とした。
- **`lib/section-renders/dbcrosslinkpath.js`（新規）**: `_DBCrossLinkPath` wrapper の判定・値抽出・解決を行うクライアント側ヘルパー。`_DBLink` 系（`dblink.js`）と異なり対象レコードの検索を行わないため、fetch/セッションキャッシュ/曖昧一致ガード/`isPrivate`レコード除外は不要。`CharacterSectionRendererRegistry` には登録せず `globalThis.DBCrossLinkPathResolver` として直接公開。
- **`pages/characters.js`**: `resolveImageValueToUrl()`（新規共通ヘルパー）を追加し、`buildImageGallery()`/`resolveImageFromFields()` の両方から呼び出すよう統一。値が `_DBCrossLinkPath` wrapper ならターゲットWork/DBの `folderHint` を解決して絶対パスを構築、通常の文字列なら従来通り `buildImagePath()` を使う。`buildImageGallery`/`loadMoreImages` を `async` 化（対象Workの typedef/meta 取得が非同期のため）。ターゲットが `Works_Hidden`/`DB_Hidden`（`isCrossLinkTargetHidden()`）の場合は解決しない。
- **`lib/data-common.js`**: `EnrichmentProcessor` に `isCrossLinkTargetHidden()`/`resolveDbCrossLinkPathEntry()`/`resolveDbCrossLinkPathImages()` を追加。`enrichRecords()` のステップ3（画像情報処理）で `_enrichment.images` へ**追記のみ**（`Images.*` の生値は書き換えない、`ImageProcessor` と同じ非破壊方針）。新規トップレベル関数 `buildCrossLinkImageAbsolutePath()`（既存 `ImageProcessor.resolveImagePath()` の「値にスラッシュを含む場合 folderHint を付与しない」既知バグを踏襲せずゼロから構築）/`findDbEntryInWorkMeta()` を追加。**既存の `_DBLink` の「別DBからは画像フィールドを埋めない」ルール（`allowImages` ゲート）・`ImageProcessor.resolveImagePath()` の既知バグには一切手を加えていない**（後者は今回スコープ外で意図的に未修正のまま残置）。
- **`data/Works_NumberTales/DataBases/db_Primary.json`**: Num=22「22(フジ)」の `Images.arts_PNGPath[3]` を、手書き相対パス `"../../DB_SemiPrimary/arts/corefolders/autumnMoon/art_autumnMoon2025"` から `{ "_DBCrossLinkPath": { "_DB": "SemiPrimary", "_IsoPath": "corefolders/autumnMoon/art_autumnMoon2025" } }` へ移行（参照先: `db_SemiPrimary.json` Num="3x11"「トレッド」と同一画像）。`data/Works_NumberTales/References/ref_Reference.json` の類似の `../../` 使用箇所（`#PNGFileName[]` 型・Referencesレイヤー→General、型/レイヤーとも異なる別ケース）は今回のスコープ外として現状維持。
- **`tests/enrich.dbcrosslinkpath.test.js`（新規）**: 同一Work/別DB解決、別Work解決、`_DB`/`_IsoPath` 欠落時の解決失敗、`_Field` 省略時デフォルト/明示指定、`Works_Hidden`/`DB_Hidden` 非公開制御、未宣言フィールドへの安全策ガードを検証。
- **`tests/data.shape.test.js`**: `$Def_DBCrossLinkPath.$DefType` の宣言（フィールド名・`_DB`/`_IsoPath` の必須性）を検証するテストを追加。
- **`docs/api-sw-spec.md`**: §8.3（新設）に `_DBCrossLinkPath` の仕様（ラッパー形状・`_DBLink` との違い・`Works_Hidden`/`DB_Hidden` の尊重・`_enrichment.images` への追記のみで非破壊）を追記。
- **`docs/schema-meta-processing.md`**: `#PNGFileName`/`#PNGFilePath`/`$subfolder` の既存段落に `$Def_DBCrossLinkPath` の導入を追記。
- 確認: `npm test` 全件成功（218件）。

### add: `TailsUnit` に参考画像フィールドを追加 + 新スキーマ属性 `$subfolder` を新設 (2026-07-10)

`$Def_TailsUnit` に、複雑な `Branches`/`LayoutDirection` 構造（特に分岐配置）をテキストだけでは伝えにくい11キャラクター分の参考画像を紐付けられるようにした。あわせて、この画像フィールドを typedef 駆動の画像抽出（`indices.imagePathHints`）が発見できるよう、根本原因だった名前付き `$Def_*` 型参照の未解決問題を修正した。

- **`data/Works_NumberTales/DataBases/db_meta.json`**: `$Def_TailsUnit.$DefType`（`LayoutDirection` と `Note_JP` の間）に `TailsUnit_PNGName`（`$type: "#PNGFileName|#Null"`）を追加。新設した `$subfolder`（`"attr/tailsUnit"`）で画像フォルダを明示宣言（`_PNG` 接頭辞からの自動推測より優先）。
- **`data/db_meta.json`（グローバル）**: `CreationWorks.#Works_NumberTales.$DetailLayout.subFields` に `TailsUnit` を追加。これにより `TailsUnit` は「1項目1箇所の原則」で `basicFields`（基本情報テーブルの一行サマリー）から外れ、`AppearanceDetail` と同様の専用折りたたみセクション（`尻尾ユニット`）として全属性＋参考画像付きで表示されるようになった。
- **`lib/data-common.js`**: `TypeDefUtils.buildImagePathHints()` を拡張。(1) フィールドの `$subfolder` 宣言があれば `inferFolderHintFromKey()` の正規表現推測より優先する新しい汎用スキーマ属性として対応。(2) `"$Def_TailsUnit[]"` のような名前付き型参照文字列を `CharacterValueWrapperRegistry.helpers.resolveTypeDefEntries()`（既存の公開ヘルパーを再利用）経由で解決し再帰的に辿るようにした。従来はインラインの入れ子配列（`$type` が配列）しか展開できず、`$Def_AppearanceDetail.img_PNGName`（既存宣言だが未接続のまま放置されていた先例）や `$Def_TailsUnit` 内の画像フィールドが typedef 駆動の画像抽出から漏れていた根本原因を解消した。副作用として、全作品で共有する `$Def_AppearanceDetail.img_PNGName` も `indices.imagePathHints`/`imageFields` に現れるようになる（実データは null のため実害なし）。
- **`pages/characters.js`**: `extractImageFields()`（詳細画面上部の汎用ギャラリー）の2箇所のフィールドspec構築でも `$subfolder` を優先するよう統一。`renderStandaloneFieldSection` 周辺に `buildTailsUnitImageUrl`（`TailsUnit_PNGName` 専用のURL構築、`buildImagePath`/`resolveWorkDirName` を再利用）を追加し、`context.helpers` 経由で `lib/section-renders/tailsUnit.js` へ供給。
- **`lib/section-renders/tailsUnit.js`**: `tailsUnitSection.render()` で `TailsUnit_PNGName` があれば、スキーマの `$subfolder` を `resolveTypeDefEntries` で解決した上でURLを構築し、既存の `createGalleryImageItem`（ライトボックス拡大表示対応）でサムネイル表示するよう拡張。
- **`data/Works_NumberTales/Images/DB_Primary/attr/tailsUnit/`（新規）**: `.private/`（未追跡の作業用フォルダ）に置かれていた参考画像11枚（`attr_tailsUnit{Num}.png`、Num: 4/6/16/23/39/49/57/61/73/85/93）を移動・追跡開始。
- **`scripts/backfill-tailsunit-image.mjs`（新規）**: `db_Primary.json` の対象11レコードへ `TailsUnit_PNGName` を機械的に付与する一回限りのバックフィルスクリプト（dry-run既定・`--write`で反映）。
- **`tests/data.shape.test.js`**: `$Def_TailsUnit` のフィールド名・`$subfolder` 宣言の検証、対象11件のデータ・画像ファイル存在確認テストを追加。
- **`tests/pages.characters.ui-output.test.js`**: `TailsUnit` が専用セクションとして描画され基本情報テーブルとは重複しないこと、参考画像がある/ない場合双方の描画確認テストを追加（既存2件は新しいセクション構成に合わせて更新）。
- **`tests/enrich.wrapper-summaries.test.js`**: 名前付き `$Def_*` 参照内の画像フィールド解決、および `$subfolder` が `_PNG` 接頭辞推測より優先されることを検証するテストを追加。
- 確認: `npm test` 全件成功（207件）。

### refactor: NumberTales 耳の形状 `EarType` を `EarShapeType` へ改名・work-local化 (2026-07-08)

`AppearanceDetail[].DesignElement:"#Element_Ear"` の `vdict_EarType`（グローバル `$EnumDef_EarType`、Fox/Catの2値のみ）を、命名を `TailShapeType` と揃えた `vdict_EarShapeType`（`$EnumDef_EarShapeType`）へ改名し、NumberTales work-local `db_meta.json` へ移設した。尻尾形状（`TailShapeType`）と耳の形状は完全に独立した軸として扱う方針（尻尾形状からの導出はしない）。実データ調査の結果、既存の全92件の耳エントリは Fox/Cat の2値で100%カバーされているため、語彙（enum値）の拡張は行っていない（Scorpion/Bud等「耳」概念の無い形状の代替語彙はUser自身の今後の創作判断であり、今回は作らない）。

- **`data/db_meta.json`（グローバル）**: `$EnumDef_DesignAttrLabel.#DesignAttr_Ear.$fields` を `["vdict_EarShapeType", "about_JP", "about_EN"]` に更新。`$EnumDef_EarType` を削除。`#Element_Ear`（`$EnumDef_DesignElement`）自体は他作品も使う共有インフラのためグローバルのまま変更なし。
- **`data/Works_NumberTales/DataBases/db_meta.json`**: `General.$VarsDef` に `$EnumDef_EarShapeType`（`#EarShapeType_Fox`/`#EarShapeType_Cat`、ラベル文言は旧 `EarType_JP`/`EarType_EN` から変更なしで転記）を新設。
- **`scripts/migrate-eartype-to-earshapetype.mjs`（新規）**: `db_Primary.json`（`#Element_Ear` が存在する唯一のファイル）の `vdict_EarType` キー・値を `vdict_EarShapeType` へ機械的に改名する一回限りの移行スクリプト（dry-run既定・`--write`で反映）。91レコード・92件のAttrs行に適用。旧キーの並走維持はしない（値の意味を保つ単純改名のため、通常方針「既存フィールドは削除せず並走追加」の明示的な例外）。
- **`lib/section-renders/appearanceDetail.js`**: 変更なし（`vdict_{DictName}` から動的に `$EnumDef_{DictName}` を解決する規約駆動実装のため、改名・work-local化ともにコード変更不要）。
- **`tests/data.shape.test.js`**: `EarShapeType schema` テスト群を追加（work-local宣言確認・グローバル側の完全移設確認・全Attrs行が新キーを使うことの確認）。
- 確認: `npm test` 全件成功（199件）。

### add: `AppearanceDetail` の `DesignElement` 廃止を宣言する汎用機構 `SupersededDesignElements` を新設 (2026-07-08)

`AppearanceDetail[].DesignElement` の値を専用フィールドへ移行（廃止）した際に、作品別 `db_meta.json` で宣言的に示せる機構を新設した。`TailsUnit`（`#Element_TailsUnit` → `TailsUnit`）移行時はこの機構が無く、テスト・ドキュメント・`addon-ai-tag` 側のAIHintsツールで個別の手作業クリーンアップが必要になった反省を踏まえる。**データ移行は発生せず、既に完了済みのTailsUnit移行を遡って文書化するのみ**。

- **`data/db_type.json`（グローバル）**: `$MetaType.$Def_SupersededDesignElement` を新設（`DesignElement`/`SupersededByField`/`SupersededByType`/`SupersededDate`/`Note_JP`/`Note_EN`）。既存の `$Def_DatabaseCatalog` と同じ「型はグローバル宣言、データは作品別」パターン。
- **`data/Works_NumberTales/DataBases/db_meta.json`**: 新規トップレベル `SupersededDesignElements` に `#Element_TailsUnit → TailsUnit`（2026-07-07完了分）の1件を追加。
- **`tests/data.shape.test.js`**: 従来ハードコードされていた「`#Element_TailsUnit` を使うAppearanceDetailが無いこと」のテストを、`SupersededDesignElements` を読む汎用テストに置き換え。将来別の `DesignElement` を廃止する際は、この配列へ1行追加するだけでテストが自動追従する。
- **`docs/schema-meta-processing.md`**: §2.4/§3.6/§4.8（新設）/§7.6（新設）に本機構の説明を追記。
- 確認: `npm test` 全件成功（199件）。

### add: `TailsUnit` に `LayoutDirection`（分岐の方向性）フィールドを追加 (2026-07-08)

`$Def_TailsUnit` に `LayoutDirection`（`{LayoutFrom, LayoutTo}`、`$EnumDef_Laterality` 参照）を追加し、元の `TailsUnit_JP` にあった「上から下に向かって」「中央から周辺に向かって」のような全体の方向性を構造化した（`Branches[]` の各要素は個別の `Laterality` を持つのみで、段に位置語が無い場合は方向情報が失われていたのを補う）。

- **`data/Works_NumberTales/DataBases/db_meta.json`**: `$Def_TailsUnit.$DefType` に `LayoutDirection`（`Branches` の直後、`Note_JP` の直前）を追加。
- **`lib/section-renders/tailsUnit.js`**: `formatLayoutDirection()` を追加し、`tailsUnitSummary`/`tailsUnitSection` の両方で方向句（JP: 「○○から○○に向かって」/ EN: "From ○○ to ○○"）をBranch内訳の直前に表示するよう更新。
- **`scripts/backfill-tailsunit-layoutdirection.mjs`（新規）**: `db_Secondary.json`/`db_SelfSecondary.json`（narrative形式が存在する2ファイルのみ）の既存 `Branches[]` データから `LayoutDirection` を逆算・付与する一回限りのバックフィルスクリプト（dry-run既定・`--write`で反映）。計44件（22件×2ファイル）に適用。大半は `Branches` 先頭/末尾の `Laterality` から自動導出、8パターン（個別の段の位置語とヘッダ方向語が食い違うケース）は本セッション内での精査記録に基づき直接指定。
- **`tests/data.shape.test.js`** / **`tests/pages.characters.ui-output.test.js`**: `LayoutDirection`/`LayoutFrom`/`LayoutTo` の型宣言・命名規約テストと、方向句の描画確認テストを追加。
- 確認: `npm test` 全件成功（190件）。

### refactor: NumberTales `TailsUnit` を専用構造化型へ移行（`AppearanceDetail` からの離脱） (2026-07-07)

**破壊的変更（例外的にフィールド削除を伴う）**: 尻尾の形状情報を、汎用カタログ `AppearanceDetail[]`（`DesignElement:"#Element_TailsUnit"`）から独立した専用typedef `TailsUnit`（`$Def_TailsUnit[]`）へ全面移行した。旧 `TailsUnit_JP`/`TailsUnit_EN`（自由記述）と、AppearanceDetail 側の `#Element_TailsUnit` エントリは削除（このリポジトリの通常方針「既存フィールドは削除せず並走追加」の明示的な例外）。

- **`data/Works_NumberTales/DataBases/db_meta.json`**:
  - `General.$VarsDef` に `$Def_TailsUnit`（`TailShapeType`/`Count`/`Segment`/`Branches`/`Note_JP`/`Note_EN`）と `$Def_TailsUnitBranch`（`Laterality`/`TailCount`/`ClusterCount`）を新設。`$display:{wrapper:"tailsUnitSummary", sectionWrapper:"tailsUnitSection"}`。
  - `$EnumDef_DesignElement` から `#Element_TailsUnit` を削除（AppearanceDetail側では使用しなくなったため）。
- **`data/Works_NumberTales/DataBases/db_type.json`**: `TailsUnit_JP`/`TailsUnit_EN` を `TailsUnit`（`$Def_TailsUnit[]|#Null`, `$display:{section:"profile", sectionWrapper:"tailsUnitSection"}`）に置き換え。
- **`lib/section-renders/tailsUnit.js`（新規）**: `tailsUnitSummary`（一行サマリー wrapper）と `tailsUnitSection`（標準セクションレンダラー）を自己登録。`pages/characters.js` へ import 追加。
- **`scripts/migrate-appearancedetail-to-tailsunit.mjs`（新規）**: 既存の `AppearanceDetail` Attrs（Shape/Count/Segment/Branch）を新shapeへ機械的変換し、旧フィールドを削除する移行スクリプト（dry-run既定・`--write`で反映）。対象4ファイル計180レコード（`db_Primary.json` 97 / `db_Secondary.json` 37 / `db_SemiPrimary.json` 9 / `db_SelfSecondary.json` 37）に適用済み。
- **`scripts/migrate-appearance-detail.mjs`**: `fromTailsUnit()`（TailsUnit_JP/EN → AppearanceDetail への旧変換）を削除。
- 削除: `scripts/migrate-tailsunit-appearancedetail-secondary.mjs`（前回セッションで作成した TailsUnit→AppearanceDetail 方向の移行スクリプト。今回の方向転換により用済み）。
- **`docs/localization-en-rules.md`** / **`docs/jp-notation-rules.md`**: `TailsUnit_EN` 固有の自由記述翻訳ルール（§3-2）を、`$Def_TailsUnit` 構造化型の説明（辞書ベースの自動生成に置き換わり、レコード単位の翻訳は不要）に更新。
- **`tests/pages.characters.ui-output.test.js`** / **`tests/data.shape.test.js`**: `TailsUnit`/`tailsUnitSection` の描画確認テストと、`$Def_TailsUnit`/`$Def_TailsUnitBranch` の型宣言・命名規約テストを追加。
- 確認: `npm test` 全件成功（既知の無関係な1件を除く）。

### add/fix: AppearanceDetail に `Costume` フィールド新設・BodyPart enum拡張・NumberTales Primary データ修正 (2026-07-06)

- **`data/db_meta.json`**:
  - `$Def_AppearanceDetail.$DefType` に `Costume`（`#DictIndex|#Null`, `$dict: "Costume"`）を新設。衣装バリエーション（例: 通常/ヲタク/アイドル/巫女）を、`value_JP/EN` 内の丸括弧注記だけでなく構造化フィールドとしても表現できるようにした（既存の丸括弧注記は互換のため残置）。
  - `$EnumDef_DesignBodyPart` に `#BodyPart_Interchangeable`（付け替え可能・手持ち小道具用）と `#BodyPart_FaceMaking`（フェイスメイク）を追加。
- **`data/Works_NumberTales/Dictionaries/dict_Costume.json`（新規）**: `usual` / `otaku` / `idol` / `miko` の4値。
- **`lib/section-renders/appearanceDetail.js`**: `resolveCostumeLabel()`（`resolveFormationLabel()` と同パターン）を追加し、`Costume` をヘッダータグとして表示するよう拡張。
- **`data/Works_NumberTales/DataBases/db_Primary.json`**: P1タスク（AppearanceDetailデータ整備）の残件処理。
  - Num 8: JP/EN値コピペ起因の誤り修正（Expression要素のEN値がVRゴーグル要素のものになっていた）。
  - Num 32: Emblem要素に混在していたExpression内容を分離、フェイスメイク該当箇所へ `#BodyPart_FaceMaking` を付与。
  - Num 60: JP/EN値のローテーションずれ4箇所を修正、Expression/CostumeItem混在エントリを分割、衣装別エントリへ `Costume` を付与、「2パターンの衣装」プレースホルダーを削除。
  - Num 61: 衣装別エントリへ `Costume` を付与、プレースホルダー削除、フェイスメイク該当箇所へ `#BodyPart_FaceMaking` を付与。
  - Num 35: 巫女衣装エントリの `BodyPart` 不足を補完（胸・腰を追加）、小道具（御幣）へ `#BodyPart_Interchangeable` を付与、`Costume` 付与、プレースホルダー削除、フェイスメイク該当箇所へ付与。
  - Num 16/18/23/34/53/71/81/99: 同一パターン（丸く剃られた眉・頬の横線メイク）のフェイスメイク該当箇所へ `#BodyPart_FaceMaking` を一括付与（計8箇所）。
- 確認: `npm test`（22 files / 178 tests passed）。ローカルHTTPサーバー + Playwright でNum 35詳細表示を目視確認し、`Costume`（usual/miko）・`FaceMaking`・`Interchangeable` タグの表示とコンソールエラー無しを確認。

### refine: カレンダー(ICS/Google 同期)へ作品色・2/29 平年対応・説明欄の和文統一を追加 (2026-07-04)

- **`data/db_type.json`（$MetaType.$Def_CreationWorkCatalog）**: `CalendarColorId`（カレンダー色ID, `#String|#Null`, internal）を宣言。
- **`data/db_meta.json`（CreationWorks）**: 全9作品へ `CalendarColorId`（Google イベント色 1〜11）を設定（NumberTales=7 Peacock, FLInvestigator78=3 Grape, ShouArRiders=6 Tangerine, UnibyteLive=4 Flamingo, SinisterChangingGirls=11 Tomato, UnauthedLogica=8 Graphite, PastDivers=10 Basil, DestinyFoxRecords=5 Banana, Proxies=1 Lavender）。
- **`tools/build-calendar-ics.mjs`**:
  - 作品色を ICS の RFC 7986 `COLOR`（CSS 色名）として出力（未指定作品は既定パレットを表示順で自動割当）。
  - 2/29 のイベントを `RRULE:FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=-1`（毎年2月末日）へ変更し、平年は 2/28 に表示。`buildRrule()` として共通化。
  - `DESCRIPTION` を和文統一（作品/DB/英名/記念日(`DayAbout_JP`)/出典）。`buildEventDescription()` として共通化・export。
- **`tools/sync-calendar-gcal.mjs`**: 上記共通関数を利用し、Google 側へ `colorId` を反映。変更検知ハッシュに色を含め、色変更でも update が走るように。イベント ID は不変のため既存イベントは削除されず全件 update で移行。
- **`tests/calendar.ics.test.js` / `tests/calendar.gcal-sync.test.js`**: 作品色（作品内同色・複数作品色分け・COLOR 行）、2/29 ルール、和文 DESCRIPTION の回帰テストを追加・追従。
- **`docs/calendar-ics-spec.md`**: §2 / §6 を更新（色・2/29・和文構成）。

### add: Google カレンダー直接同期（push 方式）を追加 — ICS 購読の反映遅延対策 (2026-07-04)

- **`tools/sync-calendar-gcal.mjs`（新規）**: `collectEvents()`（ICS 生成と同一の抽出・除外ルール）を再利用し、サービスアカウント（JWT Bearer・外部依存なし）で Google Calendar API へ**完全ミラー同期**。イベント ID は ICS `UID` と同じ SHA-1 で決定的（冪等 upsert）。`extendedProperties.private.blHash` による変更検知で差分のみ書き込み。`--dry-run` / `--calendar` / `GCAL_SERVICE_ACCOUNT_KEY(_FILE)` 対応。
- **`.github/workflows/gcal-sync.yml`（新規）**: `develop` への push（`data/**`・同期スクリプト変更時）で自動同期。workflow_dispatch で dry-run 選択可。Secrets: `GCAL_SERVICE_ACCOUNT_KEY` / `GCAL_CALENDAR_ID`。
- **`package.json`**: `calendar:sync` / `calendar:sync:dry` を追加。
- **`docs/calendar-ics-spec.md`**: §6「push 方式」を追加（仕組み・初期設定手順・ローカル検証・注意）。§4 の注意書きを push 方式優先の運用へ更新。
- **`tests/calendar.gcal-sync.test.js`（新規）**: 日付導出（うるう日・年末繰越）・ID 決定性（ICS UID と同一ハッシュ）・リソース組み立て・変更検知ハッシュの回帰テスト。
- 背景: ICS 購読(pull)は Google 側のポーリング頻度を制御できず反映されない事象が発生したため、push 方式を実運用の正とする（購読配信は外部公開用に併存）。

### add: データベース改善用に GitHub Issues 機能を追加（サイト連携付き） (2026-07-04)

- **リポジトリ設定**: `radiann-kswg/100BeautiesLab_CreationsDB` の GitHub Issues を有効化。
- **`.github/ISSUE_TEMPLATE/`**:
  - `data-correction.yml` — データ内容の誤り・修正報告用フォーム（対象作品/DB/キャラクター識別情報/該当フィールド/詳細/該当URL）。
  - `feature-suggestion.yml` — 機能・改善提案用フォーム。
  - `config.yml` — 白紙Issueを無効化し、ガイドライン・ホームページへの導線を追加。
- **`pages/characters.html` / `characters.js` / `characters.sass`（`characters.css` も同期反映）**:
  - キャラ詳細表示の `.detail-header` に「⚠ データの誤りを報告」リンク（`#btn-report-issue`）を追加。
  - コントロール行に「⚙ サイト機能を提案」リンク（`#btn-feature-issue`）を追加し、`feature-suggestion.yml` のIssueフォームへ遷移可能に。
  - `buildDataCorrectionIssueUrl()` で表示中の 作品/DB/キャラクター識別情報/現在URL を `data-correction.yml` の各フィールドidへ事前入力し、GitHub Issue作成画面へ遷移させる（サーバー呼び出し無し、静的サイトの制約内で完結）。
  - 言語切替に連動してIssueボタン文言をJP/ENで切替（`#btn-report-issue` / `#btn-feature-issue`）。
  - 非公開キャラクター表示時・一覧表示時はリンクを非表示に維持。
  - `<meta name="asset-version">` を `2026.07.04.1` へ更新。
- 確認: `npm test`（163 tests passed）。ローカルHTTPサーバー + Playwright でキャラ詳細deep link（`?work=NumberTales&db=Primary&idx=2&idxKey=Num`）からのリンク表示・事前入力URL組み立てを目視確認。

### fix: `Relation` のリンク表示名が英名寄りになるケースを修正（pageLang 優先） (2026-07-03)

- **`lib/section-renders/relation.js`**:
  - `Relation` / `RelationTo_*` のリンク名解決に `pickRelationRecordName()` を追加。
  - JP表示時は `Name_JP` 系、EN表示時は `Name_EN` 系を優先するよう統一し、旧互換の `Name` はフォールバックへ移動。
  - 同DB表示（同期）とクロスDBハイドレーション（非同期）で同じ命名優先ロジックを使うように整理。
- **`tests/section-wrapper-common.test.js`**:
  - `pageLang=jp` で `Relation` のリンクラベルが `Name_JP` を優先する回帰テストを追加。
- テスト: `section-wrapper-common` / `pages.characters.ui-output`。

### refine: `sec_Category` / `sec_DesignedBy` の二次創作情報 UI を整理（表示文脈の明確化 + テーブル統一） (2026-07-03)

- **`pages/characters.js`**:
  - `secondaryInfo` セクションを `isSecondaryDbName(dbName)` でガードし、`Secondary` / `SelfSecondary` / `UnprocessedSecondary` 文脈でのみ表示するように整理。
  - セクション内の表示を「タグ + 段落」から `kvTable` ベースへ統一し、基本情報と同じ視認性・読み順に揃えた。
  - `toDisplayNode()` 呼び出しに `recordContext` を渡し、辞書解決の文脈整合を強化。
- **`tests/pages.characters.ui-output.test.js`**:
  - 既存の `secondary metadata fields` 表示テストを維持。
  - Primary 文脈では `sec_*` 値が存在しても `二次創作情報` セクションを出さない回帰テストを追加。
- テスト: `pages.characters.ui-output` / `commons.secondaries`。

### fix: `$display.unit` の和英対応と英語序数化（`0th Gen.`）を追加し、言語切替で別キャラへ飛ぶ不具合を修正 (2026-07-03)

- **`pages/characters.js`**:
  - `formatValueForDisplay()` の unit 処理を拡張し、`$display.unit_JP` / `$display.unit_EN` をページ言語で出し分けるように変更（未定義時は既存 `unit` へフォールバック）。
  - `unit_EN_ordinal: true` 指定時、英語表示で `#Number` 系の値を序数化（`1st/2nd/3rd/...`）してから unit を付与するように対応。
  - `collectIndexEntries()` の比較値 `value` を「表示文字列」ではなく raw 値に変更し、言語切替や表示フォーマット変更の影響を受けない一致判定へ修正。
  - `getIndexIdentifierFromRecord()` を改善し、単一キーで一意に引けない場合は `idxKey=__conditions__` + JSON 条件（複合キー）を生成して同一レコードを再特定できるように対応。
- **`data/Works_UnibyteLive/DataBases/db_type.json`**:
  - `Generation.$display` に `"unit_EN_ordinal": true` を追加（英語表示を `0th Gen.` 形式に統一）。
- **`tests/pages.characters.ui-output.test.js`**:
  - `unit_JP` / `unit_EN + unit_EN_ordinal` の表示回帰（`0期生` / `0th Gen.`）を追加。
  - 単一インデックスが曖昧なケースで複合識別子（`__conditions__`）が生成される回帰を追加。
- テスト: `pages.characters.ui-output` / `wrapper-common` / `enrich.wrapper-summaries`（37 passed）。

### fix: Day wrapper 表示を言語別（JP/EN）へ切替し、`5月19日` / `May.19` を出し分け (2026-07-03)

- **`lib/wrapper-common.js`**: `daySummary` の日付本体を `context.pageLang` で分岐するよう修正。
  - `lang=jp`（既定）: `5月19日`
  - `lang=en`: `May.19`
  - 注釈（`DayAbout_JP` / `DayAbout_EN`）は既存どおり role 解釈に従って末尾へ付与。
- `#List_Month` が読み取れない経路でも、月番号 1..12 を `Jan..Dec` へフォールバックするため EN 表示が安定。
- テスト更新:
  - **`tests/wrapper-common.test.js`**: JP期待値を更新し、`pageLang: 'en'` の `May.19` ケースを追加。
  - **`tests/enrich.wrapper-summaries.test.js`**: enrich の `wrapperSummaries.BirthDay` を JP既定表示へ更新。
  - **`tests/pages.characters.ui-output.test.js`**: 基本情報テーブルの誕生日期待値を JP表示へ更新。
- テスト: `wrapper-common` / `enrich.wrapper-summaries` / `pages.characters.ui-output`（35 passed）。

### add: Day / Era / Area の typedef 駆動を SW/enrich 側へ拡張（role 解釈 + searchable 判定） (2026-07-03)

- **`lib/data-common.js`**:
  - `buildWrapperSummaries()` の wrapper 解決 `typeSources` に `globalMeta` と `mergedVars` 由来 source を追加。これにより `data/db_meta.json` の `General.$VarsDef.$Def_Day.$display.role`（`month`/`dayOfMonth`/`annotation`）を SW/enrich 側でも利用可能にし、field 名依存フォールバック（`Month`/`DayOfMonth` 固定）への依存を緩和。
  - `TypeDefUtils.looksSearchableType()` に `#DictIndex` / `$Def_Day` / `$Def_StoryEra` / `$Def_BaseArea` を追加し、Day / Era / Area 系フィールドを `_enrichment.searchableText` の対象へ typedef 駆動で取り込み。
- **`lib/sw-common.js`**: DB カタログ装飾（bootstrap / `works/{work}/db`）の wrapper summary 解決で `typeSources` に `globalMeta` を追加。
- **`tests/enrich.wrapper-summaries.test.js`**:
  - Day role 定義を vars 側に寄せたケース（`MM`/`DD`/`Note`）で `BirthDay` summary が `1/7（記念日）` になることを追加検証。
  - Day/Era/Area 系型が `_enrichment.searchableText` に含まれることを追加検証。
- テスト: `enrich.wrapper-summaries` / `sw.work-meta-info` / `pages.characters.ui-output`（32 passed）。
- 参照: [`_work_in_progress/2026-07-03_progress_p6-day-era-area-typedef-sw-enrich.md`](_work_in_progress/2026-07-03_progress_p6-day-era-area-typedef-sw-enrich.md)。

### add: bilingual wrapper の UI 列分割表示（StreamingActivity）を `_enrichment.bilingualWrapperFields` 駆動で実装 (2026-07-03)

- **`pages/characters.js`**: enrich メタ `rec._enrichment.bilingualWrapperFields` を path キーで参照する `resolveBilingualWrapperMeta()` を追加。standalone section renderer へ `bilingualColumnsText` と同メタ resolver を helper として受け渡すよう変更。
- **`lib/section-renders/streamingActivity.js`**: `streamingActivitySection` で子フィールドごとに `resolveBilingualWrapperMeta("<親>.<子>")` を照合し、bilingual wrapper（例: `StreamingGreeting` / `ListenerNickname`）は JP/EN を `bilingualColumnsText()` で 2 列表示するルートを追加。既存のタググリッド表示・Summary 表示は維持。
- 目視確認: `Works_UnibyteLive` / `Primary` / `Letter.Generation=5`（S:ナーミィ）で `StreamingActivity` セクション内に `.bilingual-lines-grid` が 2 件生成されることを確認。
- テスト: `pages.characters.syntax` / `pages.characters.ui-output` / `section-wrapper-common` / `enrich.wrapper-summaries`（32 passed）。
- 参照: [`_work_in_progress/2026-07-03_progress_p6-bilingual-wrapper-ui.md`](_work_in_progress/2026-07-03_progress_p6-bilingual-wrapper-ui.md)。

### add: `*_DBLink` タグにクロスワーク参照先の創作名（作品タイトル）を併記 (2026-07-02)

- **`lib/section-renders/dblink.js`**: `dbLinkSection` renderer で、参照先 `_Work` が現在表示中の作品と異なる（クロスワーク）場合のみ、キャラ名リンクの直後に参照先の作品タイトルを併記するようにした（例: `⇒ 零 零（ナンバーテールズ）`）。タイトルは非同期 hydrate で埋め、取得失敗時は無表示のまま（同一作品内の参照には併記しない）。
- **`pages/characters.js`**: `relationApi.getWorkTitle(workKey, lang)` helper を追加。グローバルメタ `CreationWorks.#Works_*.Title_JP / Title_EN` を `fetchGlobalMeta()`（キャッシュ付き）経由で参照し、`lang=jp` は `Title_JP` 優先・`lang=en` は `Title_EN` 優先で返す（和英モード対応）。
- **`pages/characters.sass` / `.css`**: `.tag .dblink-work`（muted・小サイズ）を追加。`pages/characters.html` の `asset-version` を `2026.07.02.1` へ更新。
- テスト: `npm test`（156 passed、回帰なし）。
- 参照: [`_work_in_progress/2026-07-02_progress_jump-dblinkref.md`](_work_in_progress/2026-07-02_progress_jump-dblinkref.md)。

### add: `$enrich` の `$Def_DBLinkRef` 解決で null 入りネストインデックスを許容（1件一致のみ） (2026-07-02)

- **`lib/data-common.js`**:
  - `dbLinkSubsetMatch()`: クエリ側の null を「参照先レコード側も null/undefined」の明示マッチとして扱うよう変更。UnauthedLogica の `Model: { "ModelSeries": null, "Num": null }`（型番未確定インデックス）のような参照を解決可能にした。
  - `dbLinkIndexHasNull()`（新規）: `$Def_DBLinkRef` インデックスに null が含まれるか判定（ネスト対応）。
  - `resolveDbLinkSuffixRef()`: null 入りインデックスは複数レコードに一致し得るため、曖昧一致防止として **1 件一致のみ採用**するガードを追加（null を含まないインデックスは従来どおり先頭一致採用）。
- **`data/Works_UnauthedLogica/DataBases/db_Primary.json`**: `AnotherRegions_DBLink` のインデックスキー誤り `"Num": "N"` / `"Num": "S"` → `"Drc": "N"` / `"Drc": "S"` を修正（SinisterChangingGirls/Primary のインデックスは `Drc`）。
- 効果: SinisterChangingGirls/Primary「六花 雙葉」（Drc: `S`）の `AnotherRegions_DBLink`（→ UnauthedLogica/Primary `Model` 全 null レコード）で `$enrich` マージが機能し、`Height_cm` 等の空値フィールドが参照先から補完されるように。
- テスト: `tests/enrich.dblink.jump.merge.test.js` に成功系（実データ・1件一致）と曖昧一致スキップ（全 null インデックス 2 件一致）の2件を追加。`npm test`（156 passed）。
- ドキュメント: `docs/api-sw-spec.md` §8.2 を新設。
- 参照: [`_work_in_progress/2026-07-02_progress_jump-dblinkref.md`](_work_in_progress/2026-07-02_progress_jump-dblinkref.md)。

### add: `_Jump` に `$Def_DBLinkRef` 形式の `_DBLink` を指定してフィールド単位で参照先を明示できるように (2026-07-02)

- **`lib/data-common.js`**:
  - `EnrichmentProcessor.resolveJumpsWithDbLinkRefs()`（新規）: `{ "_Jump": { "hashTag", "_DBLink": { "_Work", "_DB", "<IndexKey>": <IndexValue> }, "_Search"? } }` 形式の `_Jump` を、レコードルートの `_DBLink`（旧形式・マージ用）が無くても解決・置換できるようにした。参照先の特定は `*_DBLink` suffix フィールドと同じ `resolveDbLinkSuffixRef()`（`$Def_DBLinkRef` 解決・`isPrivate` 除外・ネストインデックス対応）を再利用。解決失敗時は `_Jump` ラッパーを維持し誤置換しない。
  - `enrichRecords()` のステップ 1.75 として組み込み（ルート `_DBLink` 解決より前）。
  - `resolveJumpsInAny()`: 自前 `_DBLink` を持つ `_Jump` はルート `_DBLink` 由来のパスでは置換しないようスキップ条件を追加（二重解決・誤参照防止）。
- **`data/Works_PastDivers/DataBases/db_SemiPrimary.json`**（六花 ルノ）:
  - `BirthDay` の `_Jump` に `_DBLink`（SinisterChangingGirls/Primary の `Drc: "E"`）を明示し、キャラシートで誕生日が表示されるように修正。
  - `AnotherRegions_DBLink` のインデックスキー誤り `"Num": "E"` → `"Drc": "E"` を修正（SinisterChangingGirls/Primary のインデックスは `Drc` のため、旧記述では suffix 解決が常に失敗していた）。
- テスト: `tests/enrich.dblink.jump.merge.test.js` に成功系（実データ参照）と解決失敗時フォールバックの2件を追加。`npm test`（154 passed）。
- ドキュメント: `docs/api-sw-spec.md` §8（順序更新・§8.1 新設）、`docs/db-update-guidelines.md` §6 に追記。
- 参照: [`_work_in_progress/2026-07-02_progress_jump-dblinkref.md`](_work_in_progress/2026-07-02_progress_jump-dblinkref.md)。

### fix: `ChronoizedPurity`（PastDivers）を JP/EN 分割から共有フィールドへ修正 + `data/` 全体の JP→EN 未指定箇所を下書き翻訳 (2026-07-02)

- **`data/Works_PastDivers/DataBases/db_type.json`**: `ChronoizedPurity_JP`（`#String|#String_withAbout`）/`ChronoizedPurity_EN`（`#String_EN|#Null`）の2エントリ構成を、`BustSize` と同じ単一フィールド構成（`ChronoizedPurity`・`hashTag_JP`+`hashTag_EN`両持ち・`$display.langMode: "shared"`）に統合。値がパーセンテージ範囲の数値文字列のみ（例: `91.70-97.11%`）で言語に依存しないにもかかわらず、2026-06-22 の JP/EN 命名標準化作業で機械的に `_JP` サフィックスが付与され、`_EN` 側は一度も入力されていなかった（13レコード中0件）ことが判明したため。
- **`data/Works_PastDivers/DataBases/db_Primary.json`**: `ChronoizedPurity_JP` キーを全13件 `ChronoizedPurity` へリネーム（値は変更なし。`{value, about_JP}` 併記形の `about_JP`/`about_EN` はそのまま翻訳対象として維持）。
- **`data/` 全体の JP→EN 未指定箇所の下書き翻訳**: 一回限りの調査（scratchpad・非コミット）で `data/` の記録系ファイル（`db_*`/`ref_*`/`dict_*`/`trans_*`。スキーマ・メタ系ファイルと `.private/` は除外）を走査し、`localize-en-draft` Skill の手順で下書きを補完:
  - `data/Works_NumberTales/DataBases/db_Primary.json`: `CodeName_EN`（80/90/99番機、§3-1 の桁別変換規則で機械算出）3件、`ConversationPattern.DialogueExamples` の `value_EN`/`about_EN`（2(Twiny)・3(Treiya)・5(Fifa)、GenderType別代名詞ルールに準拠）5件。
  - `data/Works_NumberTales/References/ref_Reference.json`: `Summary_EN`（ヒューマノイド原則法、既存ファイル内パターンに整合）1件。
- 背景: `npm run deepl:build-glossary` の衝突調査（本ファイル前項）に続き、DeepL 用語集とは別に「そもそも `_EN` が未入力の箇所」を User から一通り洗い出すよう依頼された。初回スキャンは `dict_RaceType.json` 等の「素キー=EN・`_JP`が和名」パターン（`extractPairs()` と同型）を誤検知していたため（117→16件に絞り込み）、`obj[base]` が非空文字列なら EN 既存とみなす判定を追加して除外した。`ChronoizedPurity` は残る候補のうち唯一「数値のみで翻訳判断を要さないのに全件未入力」という不自然な傾向を示したため User に確認したところ、`BustSize` 同様の共有フィールド化が妥当と判断し、今回のスキーマ修正に至った。
- 検証: JSON構文確認（両ファイル）、`npm test`（152 passed）。
- 参照: [`_work_in_progress/2026-07-02_progress_data-en-gap-fill.md`](_work_in_progress/2026-07-02_progress_data-en-gap-fill.md)。

### fix: DeepL 用語集ソース生成の EN→JA 衝突を構造的に解消（併記形の分割・単数/複数の除外） (2026-07-02)

- **`tools/deepl/build-glossary-source.mjs`**:
  - `splitMultiForm()`（新規）: `Term_EN` に `"WDCE. / the \"World Development & Creation Era\""` のように略号と全文が併記されているエントリを、`/`（前後空白必須）または改行で分割する。`Demotion/Retrograde` のような複合語中のスラッシュ（前後空白なし）は分割しない。
  - `buildJaEnMap()`: 併記形は**先頭断片**（本文中で優先的に使われる略号・優先表記）を JA→EN の訳語として採用するよう変更。
  - `buildEnJaMap()`: 併記形は**分割後の全断片**を個別の EN ソースキーとして登録するよう変更。これにより `ref_Society.json` の世代呼称（`WDCE.` 系）で、`Term_JP` 由来のペアと `Aliases` 由来のペアが同一の結合文字列キーに集約されて衝突していた問題（EN→JA 10件中ほぼ全てが自己参照ノイズ）を解消。
  - `isPluralPair()`（新規）: 単数形/複数形だけが異なる EN 候補（例: `Regiowner`/`Regiowners`）を検出した場合、JA→EN 用語集への登録を見送り `[文法差につき用語集登録なし]` として `glossary-conflicts.md` に候補を併記するのみに変更。JP側は文法上の数を持たないため、用語集で強制的に片方へ固定すると逆の文脈で誤訳になるため。EN→JA は元々キーが異なり衝突しないため両方とも正しく登録される。
  - `buildEnJaMap()`: `Term_JP` 由来（正式名）のペアと `Aliases` 由来（通称・略称）のペアが同一 EN キーで衝突した場合も同様に**登録を見送る**よう変更（`registerDependent`）。冗長な説明文では通称・略称、該当語自体を定義・説明する文では正式名という文脈依存の使い分けがあり、EN→JA の単一キーには機械的に固定できないため。`glossary-conflicts.md` に `[文脈依存につき用語集登録なし]` として両論併記し、訳出時は人間が文脈判断する運用にした。
- **`data/References/ref_Society.json`**: `Aliases` からEN側の略号トークン（`WDCE.` / `WDC.VII` / `WDP.VII` / `WDC.VIII` / `WDP.VIII`）を削除（本来 JP 別表記のためのリストに EN トークンが紛れていたのが上記衝突の一因だったため）。JP側の本当の別表記（`創世期` 等）は維持。
- 背景: `npm run deepl:build-glossary` 実行時に EN→JA で 10 件の衝突が発生し、内容（文字化けした端末表示）から原因が分かりにくいとの相談を受けて調査。実際は「略号/全文併記」構造がスクリプト側で考慮されていなかったことが主因で、`創造主`（Regiowner/Regiowners）は本当の単数/複数の表記揺れ、残る10件は「正式名 vs 通称」の文脈依存の使い分けだった。いずれも用語集の単一キーには機械的に固定できないため、強制登録せず人間判断に委ねる方針で統一した。
- 検証: `npm run deepl:build-glossary` で `WDCE.` 系の自己参照ノイズが解消し、JA→EN・EN→JA 双方に略号・全文の両方が個別に登録されることを確認（`WDCE.`→`創世期`、`the "World Development & Creation Era"`→`創世期` など）。`創造主` は JA→EN から、`WDC.VII` 系10件は EN→JA から自動除外され、それぞれ `[文法差につき用語集登録なし]` `[文脈依存につき用語集登録なし]` として記録されることを確認。`npm test`（152 passed）。
- ドキュメント: `docs/deepl-localization.md` §8（新規、§8-1〜8-3）に分割ロジック・単数複数・正式名/通称の扱いを追記。
- 参照: [`docs/deepl-localization.md`](docs/deepl-localization.md) §8。

### add: DeepL 下書き翻訳の Python 版 + Claude 自身が翻訳する Skill を追加 (2026-07-02)

- **`tools/deepl_py/`（新規）**: `tools/deepl/draft-translate.mjs`（Node 版）の Python 移植。外部ライブラリ非依存（標準ライブラリの `urllib`/`json`/`re`/`argparse` のみ）。
  - `deepl_client.py`: DeepL REST API 薄いクライアント（`translate()` / `list_glossaries()`。`.env` 自動読込）。用語集の作成・同期は Node 側に一元化し、Python 側には持たせない。
  - `pronoun_normalize.py`: `tools/deepl/pronoun-normalize.mjs` の 1:1 移植（GenderType 別代名詞の確定的正規化、一人称混入・呼称不一致の検知）。Node 版と同じテストケースで出力一致を確認済み。
  - `draft_translate.py`: CLI 本体（`--work --db --id --under --field --limit --apply`）。`.cache/deepl/glossary-ids.json`（Node 版が生成）を共用し、`.cache/deepl/draft-report.md` も Node 版と同じ形式で出力。
  - 用途: Node 環境が無い開発機、または本リポジトリをサブモジュールとして持つ外部リポジトリから Python でローカライズ作業を行いたい場合。`pkg/`（DB 読み取り専用クライアント群）とは目的が異なるため `pkg/` 配下には置かず `tools/deepl_py/` に配置。詳細は [`tools/deepl_py/README.md`](tools/deepl_py/README.md)。
- **`tools/deepl/draft-translate.mjs` に `--field` オプションを追加**: トップレベルの `field_EN` 名で絞り込む（例: `--field Summary` で `Summary_EN` のみ対象）。Python 版にも同時実装。
- **`.claude/skills/localize-en-draft/SKILL.md`（新規）**: Node/Python の下書き翻訳ツールは「既存の `field_EN` キーが空値のときだけ」を対象にし新規キーは追加しないため、まだ一度も `_EN` フィールドが書かれていないレコード（新規キー挿入が必要なケース）向けに、Claude Code / Cowork のセッション内で Claude 自身が `docs/localization-en-rules.md` に従って翻訳・挿入する手順を Skill として型化した。DeepL の MCP コネクタは対話セッション専用でスクリプトから呼び出せないための代替導線。
- 背景: `Works_FLInvestigator78/DataBases/db_Primary.json` の `Summary_JP` はあるが `Summary_EN` キー自体が存在しないレコード（ドゥームズ・ルネ）を手動翻訳した際、(1) 同じ作業を Python からも自動化したい、(2) DeepL の MCP コネクタでは自動化できない旨の要望・質問を受けて対応。
- ドキュメント: `docs/deepl-localization.md` に §2-1（Python 版）・§2-2（Skill）を追加、§3-4 に Python 実行例・`--field` 説明を追記、§6 参照表を更新。
- 検証: `npm test`（152 passed）。Python 側は `pronoun_normalize.py` を Node 版テストと同一ケースで手動突き合わせ、`draft_translate.py` は `translate()` をモック化したフィクスチャで候補抽出・`--field` 絞り込み・`--apply` 書き戻し・スキップ挙動（既存値保持）・レポート出力を確認（DeepL API 呼び出し自体は API キー未設定のため未検証）。
- 参照: [`docs/deepl-localization.md`](docs/deepl-localization.md) §2-1/§2-2。

### add: DeepL 下書き翻訳をキャラ文脈（GenderType・呼称）対応に強化 (2026-07-02)

- **`tools/deepl/pronoun-normalize.mjs`（新規）**: `GenderType`（`FemaleNeutral`/`Female`→she, `MaleNeutral`/`Male`→he, `Neutral`→ze/zir, 未設定→avoid）から代名詞ポリシーを決定し、英文中の代名詞トークンを確定的に正規化する純粋関数群。あわせて一人称混入（`I`/`my` 等）・呼称不一致（`ForMasterCalling_EN` に無い `big bro/sis` 等）を検知するが、これらは自動修正せず警告のみ（文法崩壊やレコード固有の誤爆を避けるため）。
- **`tools/deepl/draft-translate.mjs`（新規・`npm run deepl:draft`）**: `data/Works_*/DataBases/db_*.json` の空 `*_EN` フィールドを再帰走査で収集し、同一レコードの `GenderType`/`ForMasterCalling_EN` 等を踏まえて DeepL 下書き翻訳を行う。代名詞は上記モジュールで正規化、DeepL の `context` パラメータ（`deepl-client.mjs` に追加）もベストエフォートのヒントとして付与。既定では `.cache/deepl/draft-report.md` へレポート出力するのみでデータは書き換えず、`--apply` 指定時のみ**警告が一つも無い候補だけ**を対象レコードの空 `_EN` へ書き戻す。警告付き候補は常にレポート止まり。
- 背景: DeepL は LLM ではなく NMT のため文脈指示に確実には従わない。既存の `evaluate-translations.mjs`（突き合わせ）は書き換えを行わない設計だったが、新規の空 `_EN` を埋める下書き作業では代名詞・呼称の食い違いが頻発していたため、確定的な後処理で補う設計とした。
- テスト: `tests/deepl.pronoun-normalize.test.js`（純粋関数のみ、DeepL API 呼び出しは対象外）。
- 参照: [`docs/deepl-localization.md`](docs/deepl-localization.md) §3-4。

### fix: `/pages/v1/deftype/global` 等が `$DefType` を欠落させる不具合を修正 (2026-07-01)

- **`lib/sw-common.js` `ApiEndpointHandlers.mergeMetaAndTypeVars()`**: `db_type.json` 側の `$VarsDef` / `$MetaType` は合流していたが、**`$DefType`（hashTag / `$dict` 宣言の配列）を結果へコピーしていなかった**。これにより `/pages/v1/deftype/global` と `/pages/v1/works/{work}/meta` のレスポンスから `$DefType` が丸ごと欠落していた。
- 影響: `pages/characters.js` の `findDictNameInSchema()` は `globalDefType.$DefType` を見て「フィールド名→辞書名」（例: `Belonging` → `Faction`）を解決するが、`$DefType` が無いためこの解決が常に失敗し、フィールド名と辞書名が異なる項目（`Belonging`/`FromArea` 等）は EN 表示時に辞書引きへフォールバックできず**未翻訳の生JPテキストがそのまま表示**されていた（`Class` のようにフィールド名＝辞書名の項目は `fn`/`keyBase` 経由のフォールバックで偶然救われていたため気付かれにくかった）。
- 本タスクの `scopeField` 実装とは無関係の既存バグ（今回 Belonging の英語表示崩れを調査する過程で発見）。`type.$DefType` が配列で存在する場合は結果へ `result.$DefType = type.$DefType` として含めるよう修正。
- 検証: Playwright（headless Chromium）で `pages/characters.html?work=Works_SinisterChangingGirls&...&lang=en` を実描画確認。修正前は `Belonging: 百花繚乱研究所`（生JP）だったのが、修正後は `Belonging: HundredBeauties Laboratory` と正しく英訳されることを確認。`npm test` も従来通り 135 passed（既知の無関係2件のみ失敗）。

### 辞書ファイル単位のスコープ条件（`scopeField`）— Belonging別Class辞書の参照解決 (2026-07-01)

- **`data/Dictionaries/db_meta.json`**: `Dictionaries.#Dict_SymphonyXVI` に `"scopeField": { "Belonging": "シンフォニー.XVI(ゼクズィン)" }` を追加。辞書カタログエントリに任意で「その辞書ファイル1本まるごとがどのフィールド＝値のキャラクター向けか」を宣言できる汎用機構（複数キー指定でAND条件）。
- **`data/Dictionaries/dict_SymphonyXVI.json`**: 行ごとのタグ付けは不要（`scopeField` 側にフィールド名・値の両方を持たせたため）。
- **`lib/sw-common.js` / `pages/characters.js`（直fetchフォールバック） / `tests/pages.characters.ui-output.test.js`（テストフィクスチャ）**: 辞書読み込み時（`readDictionaryBundle()` / `fetchDirectDictionaryBundle()` / `loadDictionaryBundle()`）に、カタログの `scopeField` を辞書の全行へ自動合成するよう統一。行側に同名キーがあれば行を優先。
- **`pages/characters.js`**:
  - `findDictScopeCondition()`（旧 `findDictScopeField()`）: カタログから `scopeField` 条件オブジェクトを取得するよう変更。
  - `resolveVarsDefLabelPack()` に第6引数 `recordContext`（対象レコード）を追加。`scopeField` の全キーが同一レコードの対応フィールド値と一致する行を優先解決し、一致が無ければ `scopeField` を持たない共通行へフォールバックする（`rowMatchesRecordScope()` / `rowHasScopeTag()`）。`recordContext` 省略時は従来通りスコープ無視（後方互換）。
  - `formatValueForDisplay()` の `opt.recordContext` を経由して主要な呼び出し箇所（一覧chip・詳細テーブル・関連キャラプレビュー等）へ配線。
  - `mergeVarsDefLayers()` 新設: global/Localization/作品別の `$VarsDef` と `Dictionaries` カタログを、単純な object spread（先勝ち/後勝ち）ではなく「配列は連結・objectは浅いマージ」で合成するよう修正。これにより、global辞書（`#Dict_SymphonyXVI`）と作品別辞書（`data/Works_NumberTales/Dictionaries/dict_Class.json` の `#Dict_Class`）が同じ `compatListKey`（`#List_Class`）を共有していても、作品別辞書に上書きされて global 側が参照不能になる既存の不具合を解消。
- **`docs/schema-meta-processing.md`**: §3.4.1 に `scopeField`（辞書ファイル単位の条件）の仕様と `mergeVarsDefLayers()` の合成方針を追記。
- 背景: NumberTales「錦野 舞」の `Class: ["...", "ベヴストザイン課 D-Vines開発部"]` が、作品別の汎用クラス辞書（`dict_Class.json`）に無い値のため、既存実装では常に未解決（生文字列表示）だった。所属（`Belonging: ["シンフォニー.XVI(ゼクズィン)"]`）を軸に専用辞書 `dict_SymphonyXVI.json` を参照できるようにして解消。
- 詳細は `_work_in_progress/2026-07-01_progress_class-dict-scope-field.md`。

### `README.LOCAL.md` ローカル作業メモ運用ルール追加 (2026-07-01)

- **`CLAUDE.md`**: 「サブローカル並行作業運用（予備作業場）」節の直後に **「`README.LOCAL.md`（ローカル環境ごとの作業メモ）」** 小節を新設。
- **`.github/copilot-instructions.md`**: 同節を同等内容で反映（指示書の両反映ルールに準拠）。
- 決定事項: `README.LOCAL.md` は `.gitignore` 対象（既存）の**ローカル専用メモファイル**で、各ローカルクローン固有の情報（物理パス・作業中ブランチ・引き継ぎ注意点等）を記録する用途に限定。複数ローカル横断で共有すべき正式な進捗・決定事項は引き続き `_work_in_progress/` に記録し、`README.LOCAL.md` はその代替にはしない。パス以外の内容は User が手動追記する前提とし、Claude/Copilot が創作内容や未確認の推測を書き込まない。
- 詳細は `_work_in_progress/2026-07-01_progress_readme-local-agents-rule.md`。

### Copilot 英訳(\_EN)入力補助 — 用語集対応 (2026-07-01)

- **`.github/instructions/localization-en.instructions.md` 新規追加**: `applyTo: data/**/db_*.json, trans_*.json, ref_*.json, dict_*.json`。Copilot Chat/Agent/Edits が `_EN` を補助するときの追加ルール（既存値の上書き禁止・創作本文の新規生成禁止・固有名詞は辞書対訳固定・`hideText` 尊重・最終採否は User）と、外しやすい中核固有名詞（種族・組織）のインライン早見を収録。
- **`docs/localization-glossary-quickref.md` 新規追加（生成物）**: 監修済み辞書（`trans_*`/`ref_*`/`dict_*`）から抽出した固有名詞 JP↔EN 対訳（164 件）を出典別に整形。Copilot Chat 参照用＋インライン補完（ゴーストテキスト）の隣接タブ文脈用。**インライン補完はカスタム指示を読み込まない**ため、早見表を開いて近傍文脈に入れる運用。
- **`tools/deepl/build-copilot-quickref.mjs` 新規追加 / `npm run deepl:build-quickref`**: 上記早見表を `glossary_source.json`（`deepl:build-glossary` の出力）から再生成するジェネレータ。辞書更新時に作り直す。創作本文は元スクリプト側で除外済み。
- **導線追記**: `.github/copilot-instructions.md`・`CLAUDE.md`（主要ドキュメント参照先表）・`docs/deepl-localization.md`（§6 参照先）に相互リンクを追加。
- 仕組み上の注意: カスタム指示ファイル（`copilot-instructions.md` / `*.instructions.md`）が効くのは Chat/Agent/Edits のみで、インライン補完には直接効かない（英訳精度はデータの `_JP`/`_EN` 近接＋早見表の隣接タブ提示で補う）。
- 作業ローカル: sub1（`develop`）。`data/**` は未変更（回帰対象外）。`node_modules` が Windows ネイティブのためサンドボックスで `npm test` 不可 → 本体/Windows で `npm.cmd test` 確認を推奨。詳細は `_work_in_progress/2026-07-01_progress_copilot-localization-en.md`。

### AppearanceDetail 型付きスキーマ改修 — develop 統合 (2026-06-29)

- **`$Def_AppearanceDetail` / `$Def_AppearanceAttr` 正式スキーマ化**: `data/db_meta.json($VarsDef)` に `$Def_AppearanceDetail` / `$Def_AppearanceAttr` の `$DefType` を追加。`data/db_type.json($DefType)` の `AppearanceDetail` フィールドに `"$type": "$Def_AppearanceDetail[]|#Null"` / `"searchable": false` / `"$display.sectionWrapper": "appearanceDetailSection"` を宣言。`$ScalarDef` に `#Hexcode` / `#Hexcode_Color` の base type を追加。
- **`lib/section-renders/appearanceDetail.js` 新規追加**: `$Def_AppearanceDetail[]` を描画する専用セクションレンダラー。Formation でグループ化し、各エントリを「DesignElement / BodyPart / Laterality タグ ＋ 属性リスト（`vdict_*` / `value_Num_*` / `value_JP` / `about_JP`）＋ 補足テキスト」として描画。`$EnumDef_*` を global+local でマージ（`getMergedEnumDef`）し、NT ローカル辞書（`$EnumDef_DesignElement` 等）と global 辞書（`$EnumDef_DesignBodyPart` 等）の両方に対応。
- **NT Primary `db_Primary.json` 大量更新**: 旧形式の uppercase `Value_JP` / `Value_EN` を規約駆動の `value_JP` / `value_EN` へ全件移行（97 レコード × 複数エントリ）。`Formation: null` / `Laterality: null` の省略化・整合も実施。
- **`pages/characters.js` 修正 2 件**:
  - `quickStats` を **opt-in 専用** に変更（`$DetailLayout.quickStats` 配列が明示されている作品のみヒーロー帯に表示。未設定時は全 basicFields をテーブルに表示し、ヒーロー帯には出さない。以前は未設定時も先頭 3 項目を誤ってヒーロー帯に出していた）。
  - `AppearanceDetail` renderer import 追加（`lib/section-renders/appearanceDetail.js`）。
- **テスト修正 3 件** (既知失敗の解消):
  - テスト「`正式名称` が `''` を返す」「`Model Number` が `''` を返す」: quickStats opt-in 修正に伴い解消。
  - テスト「`資料名` が `''` を返す」: NT References メタフィクスチャに `#Ref_Reference` を追加し、fetch モックに NT References typedef ハンドラを追加して解消。
- **テスト新規追加 5 件** (Phase E):
  - `data.shape.test.js`: AppearanceDetail 正式スキーマ検証（`$DefType` 宣言・`$ScalarDef`・`$Def_AppearanceAttr` 内容・NT Primary uppercase フィールド件数）。
  - `pages.characters.ui-output.test.js`: NT キャラ #9 の AppearanceDetail セクション描画検証（折りたたみセクション・辞書解決ラベル・`vdict_*` / `value_Num` の表示）。
- Vitest: 136 テスト全 pass（修正 3 + 新規 5 込み）。
- ブランチ: `refactor-appearance-detail` → `develop` → `addon-ai-tag` の順でマージ・push 済み（Phase 0–3 完了）。詳細は `_work_in_progress/2026-06-29_progress_appearance-detail-merge-integration.md`。

### ローカライズ辞書 — 大陸名の英語表記統一 (2026-06-28)

- **`南雌大陸` の英訳を `Ivesouth Mainland` に統一**（`Evesouth Mainland`／`Ivesouth Continent` の表記不一致を解消）。対象: `data/Dictionaries/dict_Area.json`・`data/Localization/trans_PlaceName.json`・`data/References/ref_Region8.json`。
- **`然天大陸` の英訳を `Naitus Mainland` に統一**（`Naitus Continent` を是正）。対象: `data/References/ref_Region8.json`。
- これは DeepL 用語集再生成時の「読みグロス正規化」が炙り出した真の表記不一致への対応（User 判断）。修正後、用語集ソースは JA→EN 144／EN→JA 138 で**衝突 0**。DeepL 用語集も再登録（疎通確認済み: `南雌大陸→Ivesouth Mainland`／`然天大陸→Naitus Mainland`）。
- 作業ローカル: sub2（`develop`）。`data/**` 変更のため、本体ローカルで `npm test`（Vitest）の確認を推奨。

### DeepL 用語集 — 読み仮名グロス正規化（衝突対策） (2026-06-28)

- **`tools/deepl/build-glossary-source.mjs` v1.1**: 読み仮名併記形（`漢字(かな)`、例 `算象(アリスマ)諸国`）と素形（`算象諸国`）が同一 EN に対応して **EN→JA で衝突**する問題を構造的に解消。`stripReadingGloss` を追加し、「漢字直後のかなのみ丸括弧」だけを読みグロスとして検出（`(後天的)`/`(拡張装備あり)` 等の修飾括弧は誤爆させない）。
- **EN→JA**: 訳先 JP は常に素形を採用（機械訳にフリガナを混ぜない／素の漢字形を正とする）。**JA→EN**: グロスを剥いた素形もソースへ自動追加し、素形・併記形どちらの入力でも英訳が効くようにした（マッチ網羅の拡張）。
- **衝突ログの意味変更**: 読みグロス差は自動正規化され `glossary-conflicts.md` に出なくなり、残るのは「素形でも EN が食い違う」真の衝突のみ。これにより既存データの英語表記不一致 2 件（`南雌大陸`: Evesouth Mainland vs **I**vesouth Continent / `然天大陸`: Naitus **Mainland** vs **Continent**）を検出（User 判断で正規化）。
- 用語集を再登録: JA-EN 142→144（素形展開分）・EN-JA 140。`docs/deepl-localization.md` に §7「読み仮名グロスの正規化」を追記。作業ローカル: sub2（`develop`）。

### DeepL 翻訳 — 創作 DB ローカライズ運用の組み込み (2026-06-28)

- **監修済み辞書から DeepL 用語集を生成する仕組みを追加**: `data/Localization/trans_*.json` / `data/References/ref_*.json` / `data/Dictionaries/dict_*.json` の JP↔EN 対訳を抽出し、双方向の DeepL 用語集として登録できるようにした。固有名詞（作品名・地名・人物名・種族名等）の訳語ブレを防止。文章系フィールド（`Summary`/`BodyBlocks`/`about` 等）は用語集対象外。
- **`tools/deepl/` 新規スクリプト群**: `build-glossary-source.mjs`（辞書走査→用語集ソース TSV/JSON 生成・キー型自動判定・衝突ログ出力）、`deepl-client.mjs`（DeepL REST API 薄いラッパ・`.env` 自動読込・Node 18 対応）、`sync-glossary.mjs`（同名削除→再作成方式で用語集更新・`glossary_id` 書き戻し）、`evaluate-translations.mjs`（既存 `_EN` と DeepL 機械訳の突き合わせレポート・**データ書き換えなし**の添削補助）。
- **DeepL 用語集を実登録**: `100BL-CreationsDB JA-EN`（142 件）/ `100BL-CreationsDB EN-JA`（140 件）を作成。疎通確認で固有名詞（NumberTales / LotusNinea / Shôbai Technology / Zera Norumber 等）が正規表記に固定されることを確認。
- **npm スクリプト追加**: `deepl:build-glossary` / `deepl:sync-glossary` / `deepl:eval`。
- **ローカル環境設定**: `.env.example`（`DEEPL_API_KEY`）追加、`.gitignore` に `.env` 系を追加。生成物は `.cache/deepl/`（Git 管轄外・再生成可能）。
- **ドキュメント**: `docs/deepl-localization.md`（運用ガイド：用語集の仕組み・ワークフロー・方向別運用・添削補助・上書き禁止の境界・既知の制約）を新規作成し、`docs/localization-en-rules.md` §8 から相互リンク。
- **運用原則**: 既存 `_EN`/`_JP` の自動上書き禁止・創作本文の自動生成禁止を厳守。DeepL は「既存対訳の一貫適用」と「英訳突き合わせ（添削補助）」に限定。
- 作業ローカル: 本体（`develop`）。詳細は `_work_in_progress/2026-06-28_progress_deepl-localization.md`。

### サイトUI 紺×水色サイエンスファンタジー化 — テーマCSS＋キャラ紹介ヒーロー帯 (2026-06-27)

- **共通デザインシステム（`pages/characters.sass` / `pages/characters.css`）を「紺×水色 近代サイエンスファンタジー」へ刷新**: `:root` パレットを再設計（`--bg`/`--card`/`--accent`/`--border` ほか値変更）し、新トークン `--bg-deep` / `--panel` / `--accent-bright` / `--azure` / `--glow` / `--border-strong` を追加。既存変数名を維持して `var(--*)` 参照を一括追従させる最小差分方式。
- **空気感の追加**: `body` に紺グラデーション背景、`body::before` で微細グリッド＋星屑テクスチャ。`.site-header` を紺ガラス＋上端発光ライン、`.site-header h1` / `.name` を白→水色グラデーション文字。`.card` をガラス質＋14px角丸＋影、`.card h2` に左端の水色発光バー（`.detail-header h2` は抑制）。`.poster` を発光ボーダー＋内側グロー、`.pill` / `th` / `.tag` の可読性向上。
- **API GUI（`api/stylesheet.sass` / `api/stylesheet.css`）を同テーマへ統一**: 紺グラデ背景・ガラスカード・水色ボタン/フォーカス・深紺の出力エリア。
- **キャラ紹介ヒーロー帯（`pages/characters.js` + CSS）**: 詳細ビューを「枠付き発光バナー」構成へ再構成。`.detail` を縦積みにし、上部 `.detail-hero`（`.detail-hero__portrait` 縦長ポートレート ＋ `.detail-hero__main` 名前見出し/英名/チップ/クイックステータス）、下部 `.detail-body`（ギャラリー＋各セクション）を全幅で配置。`.detail-hero` は発光ボーダー＋上端アクセントライン＋ラジアルグロー（初回モックアップ準拠）。クイックステータス `.detail-quickstats` / `.detail-stat` は **`$DetailLayout.quickStats` を明示した時のみ**表示し、表示項目は基本情報テーブルから除外する（**1 項目 1 箇所**の原則・重複表示の防止）。既定では非表示。値解決は基本情報テーブルと同じ `resolveBasicField` を再利用。DOM は再構成したが `img.poster` / `.name-en` / `.kv-table` / `.section` 等の要素・クラスは保持し、全 UI 回帰テストのセレクタを維持。
- **`pages/characters.html`**: `<meta name="asset-version">` を `2026.06.27.1` に更新（キャッシュ反映）。
- 検証: jsdom で `renderDetail` を直接実行し、ヒーローバナー構成・クイックステータス生成・既存要素維持を確認（13/13・重複解消/既定オフ含む）。`.css` は正なる `.sass` から再コンパイルして整合（編集ツールの大容量ファイル末尾切断を `sass` 直生成で復旧）。Vitest 本体はローカルで実行（当環境は `rolldown` ネイティブバイナリ不在のため起動不可）。
- **クラッタ低減 / 視線誘導**: 背景テクスチャ（グリッド＋星屑）を `opacity 0.5 → 0.28` に抑制。ヒーローは発光控えめの静かな見出し帯（`--border` / `--shadow-md`、上端アクセントは細く）に調整し、ポートレートは `max-height` でバランス。`.detail-header h2`（#detail-title）はパンくず的に控えめ化し、ヒーローの名前を唯一の主役にして重複感を解消。
- **情報量バランス / 可読性 / サイズ感**: ヒーローを大きめ（ポートレート clamp 最大320px・名前 clamp 最大40px）にして余白の間延びを解消。既定でヒーローに基本情報先頭3項目の「要約タイル」を表示し、その項目はテーブルから除外（**1 項目 1 箇所**・重複なし）。詳細ギャラリーは `minmax(240px, 1fr)` の多列、本文系フォントは 15〜16px に拡大、テーブル行間も拡張。
- 詳細は `_work_in_progress/2026-06-27_progress_sci-fantasy-theme.md`。

### ロールプレイ／AGENTS.md 設定の整理・正典化 (2026-06-27)

- **`AGENTS.md`（リポジトリ直下）を新規作成し、扇一春ロールプレイ仕様の「正典（source of truth）」に集約**: 役割・人物像・口調（一人称/二人称/三人称）・OK/NG 口調例・制約・入口ファイル関係表を一本化。AGENTS.md 規約に従うエージェントの入口も兼ねる。
- **`CLAUDE.md` の `@import` バグ修正**: バックスラッシュエスケープでパス解決不能だった `@.github/\_roleplay-datas/...` を `@AGENTS.md` に修正。Cowork 等の `@import` 非展開環境でも声が届くよう、圧縮版「声カード」（一人称/二人称/OK・NG 例）をインライン保持。
- **重複削減**: `.github/copilot-instructions.md` のロールプレイ節をバナー＋正典参照＋最小声カードに圧縮。`.github/instructions/roleplay.instructions.md` も正典参照＋圧縮版声カード化（フル複製を解消）。`roleplay-technical.instructions.md` は現状維持。
- **リマインダー分散**: 巨大指示書の前半に `[ロールプレイ継続]` リマインダーを追加（CLAUDE 4 / copilot 3 箇所）。
- **付随修復**: 保存事故で末尾が途中切断されていた `CLAUDE.md` / `.github/copilot-instructions.md` / `CHANGELOG.md` の末尾を HEAD から復元。
- 作業ローカル: sub1（`develop`）。

### サブローカル並行作業の運用ルール追加 (2026-06-27)

- **`CLAUDE.md` / `.github/copilot-instructions.md` に「サブローカル並行作業運用（予備作業場）」節を追加**: 同一リモートを参照する複数ローカルクローン（本体ローカル + 汎用予備作業場のサブローカル ×2）の運用ルールを明文化。
- **発動条件**: Claude / AI エージェントは、本体ローカルと同時作業できない状況（特に本体が特定ブランチで作業中に別ブランチを並行する必要があるとき）では、サブローカルでの別ブランチ作業を自律判断で行う（当該状況では必須）。
- **安全則**: 着手前の `git branch --show-current` / `git status` 確認、同一ファイルの多重編集回避、`push`/`pull` による同期明示、`_work_in_progress/` への横断作業ログ記録、既存「ブランチ運用方針」の遵守。
- **配布方式**: git 管理ファイルへの記載で全ローカル環境へ commit / pull 経由共通配布（個別ローカルへの手書き複製は行わない）。`develop` ブランチに反映。

### カレンダー ICS 生成 — SUMMARY 改行バグ修正 (2026-06-26)

- **`tools/build-calendar-ics.mjs` SUMMARY 改行問題を修正**: `Name_JP` に改行文字が含まれるキャラクター名（例: `バイナ\n2(ツギ)`）が ICS の `SUMMARY` フィールドにそのまま流れ込み、Google Calendar のインポート・購読パースが失敗していた問題を修正。`summaryName` 変数を追加し、SUMMARY 生成前に改行を `/` に置換するよう変更。`DESCRIPTION` の英名フィールドは変更なし。

### Localization レイヤー 構造改善・仮データ投入 (2026-06-25)

- **`#Loc_Dict` エントリを `DataBases/db_meta.json` から `Localization/db_meta.json` へ移動**: References レイヤーと同様に、各作品の `Localization/db_meta.json` がカタログ所在地となる。`DataBases/db_meta.json` には `#Loc_Dict` を含めない。
- **`lib/sw-common.js` — `mergeLayerDatabases` 汎用メソッド追加**: `mergeRefDatabases` の実装を `mergeLayerDatabases(baseMeta, layerMeta, defaultLayer)` として一般化。`mergeRefDatabases` は thin wrapper に変更。
- **`DataFetcher.readLocMeta` 追加・`readWorkMeta` で呼び出し**: `Works_*/Localization/db_meta.json` を読み込み、`mergeLayerDatabases` で DataBases にマージする。
- **全 9 作品に `Localization/db_meta.json` 新規作成**: `#Loc_Dict` エントリ（`DB_Layer: "Localization"`）を収録。
- **全 9 作品の仮データ投入**: 作品タイトル + 一次キャラクター全名称（`Name_JP` / `Name_EN`）+ NT FormalName（`ナンバーテールズ#番機 → NumberTales ##`）を `trans_Dict.json` に格納（NT: 211件・FL78: 14件・その他 4〜14件）。`TransPolicy`・`Category` は既存英訳パターンから仮判定（原作者による確認・修正を前提とする）。
- **テスト追加**: `readWorkMeta merges Localization/db_meta.json` + `readDB resolves via Localization/db_meta.json` の 2 ケース追加。
- **全スイート 130/130 pass** ✅

### Localization レイヤー（英訳固有辞書 DB）追加 (2026-06-24)

- **新レイヤー `Localization` を追加**: フォルダ名 `Localization/`、カタログキープレフィックス `#Loc_*`、ファイル命名規則 `trans_*.json`（TRANSlate 由来）。
- **グローバル schema 新規作成**:
  - `data/Localization/db_type.json` — 12 フィールド定義（`Term_JP/EN`, `Term_EN_Alt`, `Category`, `TransPolicy`, `Scope`, `Summary_JP/EN`, `TransNote_JP/EN`, `RelatedTerms`, `Links`）
  - `data/Localization/db_meta.json` — `$EnumDef_TransPolicy`（5 件: 原語維持 / 意音ローカライズ / 意訳 / 音訳 / 和英併記）/ `$EnumDef_Category`（13 件）
- **全 9 作品に `#Loc_Dict` エントリを追加**（後に Localization/db_meta.json へ移動）。
- **9 作品の `trans_Dict.json` 作成**・ルーティング拡張（詳細は上のエントリ参照）。
- **テスト `tests/sw.db-layer-routing.test.js`**: Localization 層ルーティング・`#Loc_` prefix 剥がし・`findMetaDbEntry` の 3 ケースを追加。
- **全スイート 129/129 pass** ✅

### References レイヤー basicFields のレイヤー typedef 駆動化 (2026-06-24)

- **`pages/characters.js` `basicFieldKeys` をレイヤー typedef 駆動に変更**: `renderDetail` 内で、`currentLayerName` が非空のとき（References レイヤー等）、`layeredTypeDef.$DefType` の `$display.section:"basic"` エントリから `basicFieldKeys` を自動収集するよう変更した（従来は常に作品の `$DetailLayout.basicFields` を使用）。
- **`data/Works_NumberTales/DataBases/db_meta.json` に `#Ref_Reference` / `#Ref_Vocabulary` を追加**: `findDbCatalogEntry` が `DB_Layer:"References"` を返せるよう、NT 作品メタの `Databases` 直下に両エントリを追加した。これにより `currentLayerName = "References"` が確定し `fetchSharedLayerTypeDef` が実行される。
- **テスト**: `tests/pages.characters.ui-output.test.js` が 24/24 pass（旧 B-2 テストも解消）。全スイート 126/126 pass。

### Google カレンダー連携: 誕生日・記念日 ICS 自動生成・配信 (2026-06-24)

- **`tools/build-calendar-ics.mjs` 新規追加**: `data/Works_*/DataBases/db_*.json` の全公開レコードから `BirthDay`(単一) / `AnivDay`(配列) を収集し、終日・毎年繰り返し(`RRULE:FREQ=YEARLY`)の iCalendar(.ics) を生成する。
- **公開ルール順守**: `isPrivate` レコード、グローバル `CreationWorks.#Works_*.Works_Hidden`、作品別 `Databases` 配下(ネスト含む)の `#DB_*` に付く `DB_Hidden`/`Works_Hidden`、`{hideText}`・日付欠損を除外する。
- **決定的出力**: UID 安定化(作品+DB+索引+種別の SHA-1)・月日順ソート・固定 DTSTAMP により、購読側の再読込時に冪等反映される。
- **`package.json`** に `calendar:build` スクリプト、**`.gitignore`** に生成物 `/calendar/*.ics`(ビルド成果物・コミット対象外)を追加。
- **`.github/workflows/jekyll-gh-pages.yml`** に Node セットアップ＋生成ステップを追加し、`develop` への push 毎に `.ics` を生成して GitHub Pages へ配信する(`https://database.numbertales-radiann.net/calendar/100beautieslab-creations.ics`)。コミットバック不要。
- **テスト `tests/calendar.ics.test.js` 追加**: 除外ルール・UID 一意・終日繰り返し・行折返し(≤75 オクテット)・決定性を検証。
- **ドキュメント**: 利用方法・Google カレンダー購読手順は `docs/calendar-ics-spec.md` を参照。
- **初回イベント数**: 誕生日 19・記念日 131(計 150)。

### JP/EN 命名規則の標準化（Phase 2〜5 完了）(2026-06-22)

- **Phase 2 — typedef リネーム**: `data/db_type.json` および `data/Works_*/DataBases/db_type.json` の全 `$DefType` エントリで、`Name → Name_JP`、`FormalName → FormalName_JP`、`ModelName → ModelName_JP`、`Title → Title_JP`、`Term → Term_JP`、`DayAbout → DayAbout_JP`、`DB_Label → DB_Label_JP` 等の言語サフィックス付与を適用した。
- **Phase 3 — コードフォールバック追加**: Phase 4 のデータ移行完了まで旧フィールド名を許容する一時フォールバックを `lib/` / `pages/` / `pkg/` に追加した（`Name_JP || Name` 等のチェーン）。
- **Phase 4 — データ一括リネーム**: `data/Works_*/DataBases/*.json` 等の全レコードデータと `db_meta.json`（全 works）の `DB_Label → DB_Label_JP` を一括移行した。
- **Phase 4.5 — テスト修正 & `basicFields`/`subFields` ベース名化**: Phase 4 で生じたテスト失敗（`DB_Label`/`FormalName`/`Character` 参照）を修正し、`db_meta.json`（全 works）の `$DetailLayout.basicFields`/`.subFields` から `_JP`/`_EN` サフィックスを除去するベース名書式へ統一した。コードサイドでは `detailSubFieldKeySet`（`pages/characters.js`）と `detailSubFieldSet`（`lib/data-common.js`）がベース名・`_JP`・`_EN` の 3 バリアントを自動展開するよう拡張した。
- **Phase 5 — フォールバック除去（本 PR）**: Phase 3 で追加した旧フィールド名フォールバックを全箇所から削除した。
  - `lib/wrapper-common.js`: `?? value.DayAbout` 削除
  - `lib/section-renders/dblink.js`、`relation.js`: `|| found?.Name`、`|| found?.FormalName`、`|| found?.ModelName` 削除
  - `pages/characters.js`: `getRecordPrimaryTitle`、`getRecordSecondaryTitle`、画像ログ、`shownKeys` 分岐から旧裸フォームを除去
  - `pkg/cloudflare/scripts/migrate.mjs`: `?? info?.Title`、`?? info?.Works_Summary` 削除
  - `pkg/nodejs/index.mjs`: `listWorks()` 戻り値から廃止フィールド `Title`、`Works_Summary` を除去し JSDoc 更新
- **テストデータ更新**: `tests/wrapper-common.test.js` のテストデータを `DayAbout → DayAbout_JP` に更新。
- **注意**: Cloudflare D1/R2 の再同期（`scripts/migrate.mjs` 再実行 → `wrangler deploy`）は別途実施が必要。

### Cloudflare Workers 実 API 初回デプロイ完了・疎通確認 (2026-06-21)

- **`pkg/cloudflare/wrangler.toml` TOML パース修正**: `routes = [...]` が `[vars]` / `[[d1_databases]]` スコープ内に誤配置されており、wrangler が `vars.routes` または `d1_databases[0].routes` として解釈する問題を修正。TOML の root-level キーはすべての `[section]` / `[[array]]` ヘッダーより前に配置しなければならない仕様に従い、`routes = [...]` を先頭スカラー群の直後に移動した。合わせて `[env.production]` セクション（冗長な重複定義）を削除。
- **`pkg/cloudflare/scripts/migrate.mjs` SQLITE_TOOBIG 修正**: `records` テーブルへの D1 INSERT で D1 の 1 文あたり約 100KB 上限を超えて `SQLITE_TOOBIG` が発生する問題を修正。`d1BatchInsert()` を複数 VALUES の一括 INSERT から 1 レコード 1 INSERT 文（`D1_BATCH_SIZE = 10` ファイルあたり 10 文）に変更した（`migrate-aihints.mjs` と同方式）。
- **初回デプロイ・疎通確認完了**: `database.numbertales-radiann.net/api/v1/*` への Worker デプロイが完了し、全エンドポイントの動作を確認した（`/works` 7件・`/Primary/records` 376件・単一レコード取得・FTS5 全文検索）。

### ADR-0001 採択: API 配信基盤を Cloudflare Workers + R2 + D1 へ移行 (2026-06-21)

- **ADR-0001** を採択。API 配信基盤を GitHub Pages + Service Worker の疑似 API から、Cloudflare Workers + R2 + D1 による実 API へ移行する設計を確定した。
- **インフラ作成**: R2 バケット `creationsdb-data`（JSON 静的ミラー）、D1 データベース `creationsdb-d1`（FTS5 検索インデックス）を Cloudflare アカウントに作成した。
- **D1 スキーマ適用**: `pkg/cloudflare/schema/d1-init.sql` を新規作成し、`works` / `dbs` / `records` テーブルと FTS5 仮想テーブル (`records_fts`)・同期トリガーを D1 に適用した。
- **マイグレーションスクリプト**: `pkg/cloudflare/scripts/migrate.mjs` を新規作成。`data/**/*.json` の全 JSON を R2 へアップロードし、作品メタ・DB メタ・レコードを D1 へ投入する。`$IndexDef`（フラット型・ネスト型両対応）から主インデックスキーを自動解決する。
- **Worker 全面改修** (`pkg/cloudflare/worker.js` v2.0.0):
  - データアクセス層を GitHub Pages HTTP fetch → R2 `env.BUCKET.get()` / D1 `env.DB.prepare()` に差し替えた。
  - 検索エンドポイント (`/search`) を D1 FTS5 クエリに変更した。
  - `Works_Hidden` / `DB_Hidden` を D1 クエリレベルで判定するよう改修した。
  - 単一レコード取得を D1 `records` テーブルのインデックスクエリに変更した。
- **wrangler.toml 更新**: R2 バインディング・D1 バインディング・カスタムドメインルーティング (`database.numbertales-radiann.net/api/v1/*`) を追加した。
- **ドキュメント更新**: `CLAUDE.md` / `.github/copilot-instructions.md` / `docs/api-sw-spec.md` / `pkg/cloudflare/README.md` を新アーキテクチャに合わせて更新した。
- **ADR-0002 ドラフト**: Google Cloud (Cloud Run / GCE) を画像生成・バッチ処理専用バックエンドとして設計するドラフトを `_work_in_progress/2026-06-21_progress_cloudflare-api-adr2-gcloud.md` に作成した。GCP プロジェクト ID 確認後に正式着手予定。
- **Service Worker 疑似 API は継続稼働**: `/pages/v1/`, `/svc/v1/` は `_DBLink`/`_Jump` 解決を含む完全 enrich 付き疑似 API として GitHub Pages 上で引き続き稼働する。

### `*_DBLink` suffix セクションレンダラー実装・`ThisMasters` リンク対応

- `lib/section-renders/dblink.js` を新規実装し、`*_DBLink` suffix フィールドを「キャラクターリンク参照」セクションとして描画する `dbLinkSection` renderer を追加した。
  - `$display.sectionWrapper` の指定は不要。`*_DBLink` suffix を自動検出して `CharacterSectionRendererRegistry` に登録する suffix-based dispatch。
  - `$Def_DBLinkRef` 形式（`{ _Work, _DB, {IndexKey: Value} }`）に基づき非同期でキャラクター名をハイドレーション。同DB・クロスDB・クロスワーク参照に対応。ネストインデックス（例: FLInvestigator78 の `Card: { Stoat, StoatNum }`）は subset match で解決。
  - `isPrivate: true` への参照はクライアント側フィルタで非表示にし、全タグ非表示の場合はセクションごと隠す。
- `lib/section-wrapper-common.js` の `structuredObjectSection.match` に `*_DBLink` suffix 除外を追加した。単一オブジェクト形式（`$Def_DBLinkRef|#Null`）の `*_DBLink` フィールドが `structuredObjectSection` に横取りされる問題を修正。
- `lib/section-renders/thisMasters.js` の `hydrateThisMastersLink` を `$Def_DBLinkRef` 形式へ刷新した。
  - 旧フォーマット: `{worksTitle, dbName, _Search: [{hashTag, key}]}` → 新フォーマット: `{_Work, _DB, {IndexKey: Value}}`
  - スカラーインデックス（`Drc: "E"` など）・ネストオブジェクト（`Card: {Stoat, StoatNum}` など）どちらも解決。
  - `about` テキストが空のエントリでリンクが付与されないバグを修正した（`!aboutText` 早期 return がリンク処理を飛ばす問題）。
- `data/Works_NumberTales/DataBases/db_Primary.json`（18件）と `db_SemiPrimary.json`（3件）の `ThisMasters._DBLink` を新フォーマットへ一括移行した。
  - `EnrichmentProcessor` が使うレコードルートの `_DBLink`（マージ用、`db_SelfSecondary.json` 等）は旧フォーマットのまま維持。

### `pkg/` クライアントライブラリ群を新規追加

- サブモジュールとして別リポジトリに導入するための独立クライアントパッケージ群 `pkg/` を新規実装した。
- 含まれるパッケージ: Node.js ESM ライブラリ / Python モジュール / C# クライアント / Cloudflare Workers API / MCP サーバー。
- **コンストラクタ引数の省略対応**: `repoRoot`（リポジトリルートパス）の引数を省略可能にし、サブモジュール配置時は `new CreationsDBClient()` のみで動作するようにした。
  - Node.js: `import.meta.url` から 2 階層上を自動解決
  - Python: `__file__` から 4 階層上を自動解決
  - C#: `FindRepoRoot()` がアセンブリ位置から `data/db_meta.json` を目印に上方探索
- 既存の `lib/` / `pages/` / `api/` / `svc/` への変更はなし（非破壊）。
- 詳細設計: `docs/pkg-client-libraries.md`

### `Works_Hidden` による作品単位の完全非公開フラグを追加

- `data/db_meta.json` の `CreationWorks.#Works_<WorkName>` に `"Works_Hidden": true` を置くことで、その作品全体をAPIから完全に非公開にできる仕様を追加した。
- 適用エンドポイント: `GET .../works` 一覧、`GET .../index`、`GET .../bootstrap` から該当作品を除外。`GET .../works/{work}` / `.../works/{work}/db` / `.../works/{work}/db/{dbName}` / `search?works=...` は 404 `"Work not found"` を返す。
- グローバルメタ (`data/db_meta.json`) 欠損時はチェックをスキップし、既存の耐性設計を維持する。
- `DB_Hidden`（DB単位）と同様の設計で、`isPrivate`（レコード単位）との段階的非公開を構成する。

### `DB_Hidden` による DB 単位の完全非公開フラグを追加

- `db_meta.json` の `Databases.#DB_<DbName>` に `"DB_Hidden": true` を置くことで、そのDBをAPIから完全に非公開にできる仕様を追加した。
- `lib/sw-common.js` の `listWorkDBs()` を修正し、`DB_Hidden: true` のエントリをDBリスト (`works/{work}/db`) から除外するようにした。
- `lib/sw-common.js` の `handleDbEndpoint()` を修正し、直接URL (`works/{work}/db/{dbName}`) へのアクセスも `DB_Hidden: true` の場合は 404 を返すようにした。メタ欠損時はチェックをスキップし、既存の耐性設計を維持する。
- 初期適用として `Works_NumberTales/DataBases/db_meta.json` の `#DB_UnprocessedSecondary` に `"DB_Hidden": true` を設定した。

### 創作作品ガイドラインを言語別ファイルへ集約

- 一次/二次創作ガイドラインの本文と「二次創作 OK/NG リスト」を、リポジトリ直下の `guideline.md`（日本語版・正本）および `guideline.en.md`（英語版）の 2 ファイルへ集約した。
- 既存の文面は一言一句変更せずに移植し、OK/NG リストはこれまで PNG 画像で配布していた表を Markdown 表として書き起こした（既存の `SecondaryWorksPermissionList_*.png` ファイル自体はリポジトリに残置）。
- `README.md` の冒頭ガイドライン章はリンクのみに簡略化し、`docs/guidelines.en.md`（paraphrased な英訳メモ）は重複回避のため削除した。
- 併せて `CONTRIBUTING.md` / `.github/copilot-instructions.md` / `docs/README.md` を、ガイドラインの正本が `guideline.md` / `guideline.en.md` であることを示す表記に更新した。

### `subFields` の非文字列型 standalone section を折りたたみ UI 化

- `pages/characters.js` は `data/db_meta.json` の `CreationWorks.*.$DetailLayout.subFields` により standalone 描画された top-level subField のうち、文字列表示型ではない section を `details/summary` ベースの折りたたみ UI で包むようにした。
- 折りたたみ対象の standalone section は初期状態を展開済みではなく閉じた状態とし、必要なときだけユーザーが開く挙動へ調整した。
- 判定は field 名ハードコードではなく、primitive / `#String` / `#Summary` / `#Dialogue` を text-like と見なし、それ以外の object / list / relation / stats 系を折りたたみ対象にする方針へ寄せた。
- `Relation` / `RelationToPrimary` は `renderRelations()` に `wrapInSection: false` オプションを追加し、既存の relation tag-grid 本体を保ったまま standalone subField 側の共通シェルへ包めるようにした。
- `pages/characters.sass` には `.section--collapsible` と `summary` の最小スタイルを追加し、見出しのトグル affordance を明示した。あわせて `pages/characters.html` の asset version を更新した。
- 回帰確認として `tests/pages.characters.ui-output.test.js` に `data-subfield-key` ベースの assertion を追加し、ConversationPattern / AbilityStats / NumerospecStats / Relation は折りたたみ UI、NumerospecAbout は通常 section のまま描画されることを確認した。

### `Relation` の特殊描画を `section-wrapper-common.js` へ移設

- `pages/characters.js` 末尾に残っていた `renderRelations()` の個別組み立て本体を `lib/section-wrapper-common.js` の built-in `relationSection` renderer へ移し、relation label 解決・comment 整形・index link 組み立て・standalone wrapper 連携を subscript 側で扱うようにした。
- `pages/characters.js` の `renderRelations()` は、DOM/format/navigation の共通 helper をまとめて renderer へ渡す bridge に縮小した。
- `CharacterSectionRendererRegistry` には `renderNamedSectionRenderer()` を追加し、non-subField からも built-in section renderer を明示的に再利用できるようにした。
- 回帰確認として `tests/section-wrapper-common.test.js` に built-in relation renderer の最小ケースを追加し、`tests/pages.characters.ui-output.test.js` の Relation / RelationToPrimary 系ケースで表示互換を確認した。

### `subFields` 用 section renderer registry を `lib/section-wrapper-common.js` へ分離

- `lib/wrapper-common.js` は値 summary の wrapper registry に責務を限定し、`subFields` の standalone section 描画ディスパッチは新設した `lib/section-wrapper-common.js` へ分離した。
- `pages/characters.js` は `CharacterSectionRendererRegistry` を先に試し、`$display.sectionWrapper` で宣言された `structuredObjectSection` / `relationSection` / `statsSection` を通して `subFields` を描画するようにした。
- global / work typedef には `ConversationPattern`、`AbilityStats`、各作品の `*specStats`、`Relation` / `RelationToPrimary` へ `$display.sectionWrapper` を追加し、renderer 選択を meta/schema 駆動へ寄せた。
- 回帰確認として `tests/section-wrapper-common.test.js` を追加し、built-in section renderer 登録と helper dispatch の最小ケースを検証できるようにした。
- 続けて `pages/characters.js` は `subFields` に列挙された top-level key を basic/profile/relation の既定ルートより優先して扱うようにし、JSON 側で宣言した順序どおりに standalone section を並べるようにした。
- 続けて `pages/characters.js` は spec 系の leaf 値に `hideText` が指定された場合も raw 文字列で短絡せず、元の typedef が持つ表示書式に従って整形するようにした。`#String_JP` / `#ListLink` / `$EnumDef` などの書式を持つ項目では `data/db_type.json` の `#List_hideText` を参照して `hideText_JP` / `hideText_EN` も解決できるようにした。
- 追加で `hideText` だけを持つ wrapper object でも親 schema 配下の leaf typedef を推定できるようにし、`SafetyLevel` のような spec 項目も `hideText` 時に別ブロックへ崩さず通常の tag/grid 書式のまま表示するようにした。
- 追加で `alphaLabel` / `codeLabel` は `EnumLink` / `ListLink` の説明文を JP 単独ではなく JP/EN pack から組み立てるようにし、`A（強力 / Powerful）` のような和英併記表示へ統一した。

### NumberTales の `ConversationPattern` を subField 独立セクション化

- `data/db_meta.json` の `CreationWorks.#Works_NumberTales.$DetailLayout.subFields` に従い、`pages/characters.js` が top-level 項目を standalone subField section として描画できるようにした。
- これにより `ConversationPattern` は従来の「プロフィール/テキスト」内の専用ブロックではなく、`Relation` と同様に独立したセクション見出し付きで表示されるようになった。
- 既存の `Relation` / `RelationToPrimary` の個別描画は維持しつつ、meta に列挙された subField の順序を優先してレンダリングするよう整理した。
- 回帰確認として `tests/pages.characters.ui-output.test.js` に NumberTales の `ConversationPattern` が standalone section として描画されることを確認するケースを追加した。

### `subFields` による `Stats` 系 standalone 描画を他作品へ拡張

- `pages/characters.js` は `data/db_meta.json` の `CreationWorks.*.$DetailLayout.subFields` に列挙された `AbilityStats` と各作品の `*specStats` を、従来の共通 `スペック/能力` セクションに固定せず standalone section として描画できるようにした。
- promoted された `*specStats` 配下の子項目は、typedef 上の `$display.section` が `profile` / `spec` に分かれていても親 subField section 内へまとめて表示し、別セクションへの重複表示を防ぐようにした。
- これにより NumberTales / FLInvestigator78 / ShouArRiders / PastDivers など、meta 側で `subFields` に stats を宣言した作品が同じ描画ルートで表示されるようになった。
- 回帰確認として `tests/pages.characters.ui-output.test.js` に NumberTales の `能力値` と `“カバラの加護”(数秘的加護)の特性`、PastDivers の `時空遷移能力の特性` が standalone section として描画されるケースを追加した。

### Day / StoryEra の特殊整形を shared wrapper registry の受け口へ分離開始

- `lib/wrapper-common.js` を追加し、UI / Service Worker 共有で使える value wrapper registry を新設した。
- 最初の built-in wrapper として `daySummary` と `storyEraSummary` を登録し、`$display.role` を使った Day / StoryEra の summary 整形を shared 層へ切り出せる土台を用意した。
- `pages/characters.js` は object 値の整形時に registry を先に試し、未一致または空文字時のみ従来の Day / StoryEra fallback を使うようにしたため、初回導入時点では既存挙動を維持する。
- `api/sw.js` / `pages/sw.js` / `svc/sw.js` も `lib/wrapper-common.js` を読み込むようにし、今後 SW / enrich 側から同じ wrapper registry を利用できる shared 層を揃えた。
- 回帰確認として `tests/wrapper-common.test.js` を追加し、built-in wrapper 登録と Day / StoryEra summary の最小整形を単体で検証できるようにした。
- 続けて `StoryEra` は `$MetaType.$Def_StoryEraCatalog.$display.wrapper = storyEraSummary` を宣言し、characters 側の local formatter 実装を削除して shared registry 経由へ本格移行した。
- 続けて `Day` と `Era` も `$display.wrapper` 主体へ寄せ、`$Def_Day -> daySummary`, `$Def_StoryEra -> eraSummary`, `$Def_StoryEraCatalog -> storyEraSummary` という shared な割り当てを明示した。
- `lib/data-common.js` は enrich 結果に `_enrichment.wrapperSummaries` を追加し、top-level の wrapper 対象項目の summary を SW/UI から再利用できるようにした。
- `lib/sw-common.js` の DB カタログ応答は `StoryEraSummary` も返すようになり、works/{work}/db 系 API でも shared wrapper による summary を利用できるようになった。さらにこの summary 生成は `StoryEra` の個別ハードコードではなく、`$Def_DatabaseCatalog` の wrapper 対象項目から自動導出する方式へ寄せた。

### `StoryEra` 用の最小 meta schema を追加

- `data/db_type.json` のトップレベル `$MetaType` に `$Def_StoryEra` を追加し、`EraGen` / `YearInEra` / `byRealYear` / `about_JP` / `about_EN` を持つ単点年代の宣言を導入した。
- あわせて `$Def_StoryEraCatalog` を `FromEra[]` / `ToEra[]` / `InEra[]` + `about_JP` / `about_EN` を持つ構造へ拡張し、既存の作品別 `db_meta.json` で使っている StoryEra 実データ形状を global schema に追従させた。
- `tests/meta.catalog.schema.test.js` を更新し、新しい schema 宣言の存在と `Works_NumberTales` の StoryEra 実データが `FromEra` / `ToEra` / `InEra` を持つことを確認するケースを追加した。
- `docs/schema-meta-processing.md` と `docs/api-sw-spec.md` も、新設した `$Def_StoryEra` と拡張後の `$Def_StoryEraCatalog` の説明へ同期した。
- 追加で `pages/characters.js` の `StoryEra` summary 表示は `about_JP` / `about_EN` を優先しつつ、未指定時は `InEra` または `FromEra` / `ToEra` から自動整形できるようにし、`tests/pages.characters.ui-output.test.js` に回帰テストを追加して 14 件成功を確認した。
- 続けて `$display.role` を `$Def_StoryEraCatalog` / `$Def_StoryEra` / `$Def_Day` へ導入し、`pages/characters.js` 側も role 優先で summary を組み立てるようにした。Day は実データの `Day` ラッパーが残るため、現段階では role 解釈と既存 shape 互換の併用としている。

### `RelationToPrimary` を Primary DB 詳細へ遷移できるリンク表示へ調整

- `pages/characters.js` の関係表示で、`RelationToPrimary` は現在選択中 DB ではなく `Primary` DB の index 直リンクを生成するようにした。
- 同一 DB 内の `Relation` は従来どおり現在のレコード群から即時詳細表示しつつ、`RelationToPrimary` は現在 state に一次創作レコードが載っていない場合でも `work/db/idx/idxKey` を保ったまま `Primary` 側へ遷移できるようにした。
- 回帰確認として `tests/pages.characters.ui-output.test.js` に `RelationToPrimary` のリンク先が `db=Primary` になることを確認するケースを追加し、13 件成功を確認した。

### 画像ディレクトリ命名を `Images/DB_*` / `Images/Ref_*` へ移行

- `pages/characters.js` と `lib/data-common.js` の画像パス解決を更新し、通常 DB は `Images/DB_<DbName>/...`、References 系 DB は `Images/Ref_<RefName>/...`、作品共通画像は `Images/General/` を既定で解決するようにした。
- これに合わせて、各作品の `data/Works_*/Images/` 配下に残っていた `Primary` / `Secondary` / `Proxy` などの旧サブフォルダ名を `DB_Primary` / `DB_Secondary` / `DB_Proxy` などへ移行し、`Works_NumberTales` には `Ref_Glossary` / `Ref_Reference` を追加した。
- 回帰確認として `tests/pages.characters.ui-output.test.js` に References 画像パスの検証を追加し、`tests/data.sanity.test.js` に `Images` 直下の命名規則チェックを追加した。
- 追加で、References 画像は shared `data/References/db_type.json` だけでなく作品別 `References/db_type.json` も UI 側で合流して解釈し、`Images.*` 配下の field 名から folder hint を導出して `concept-figure` のようなサブフォルダを hardcode なしで解決できるようにした。
- あわせて `README.md`、`pages/README.md`、`docs/db-update-guidelines.md`、`docs/api-sw-spec.md`、`docs/schema-meta-processing.md`、`docs/readme.en.md`、`docs/viewer-guide.md`、`.github/copilot-instructions.md` を新規則へ同期した。

### References レイヤーの DB をキャラシート UI で表示可能にした

- `pages/characters.js` で、現在選択中 DB の catalog entry を参照し、`DB_Layer: References` の場合は shared `data/References/db_type.json` を追加で読み込んで work typedef へマージするようにした。
- これにより、`Title` / `Term` / `BodyBlocks` / `RelatedCreations` など、通常キャラクター DB とは異なる資料系フィールドでも、キャラシート詳細で label / section / 表示整形を shared references typedef に従って解釈できるようにした。
- 一覧・詳細の見出し fallback も `Name` / `FormalName` だけでなく `Title` / `Term` を使えるようにし、References レコードでもタイトル未設定扱いにならないようにした。
- 追加で、一覧検索を `Title` / `Term` 系も対象に広げ、`RelatedTerms` を Glossary DB の絞り込みリンク、`RelatedCreations` を対象 work/db への遷移リンクとして「関連情報」セクションに表示するようにした。
- 回帰確認として `tests/pages.characters.ui-output.test.js` に References 表示・一覧 fallback・関連リンクのケースを追加し、8 件成功、および `tests/pages.characters.syntax.test.js` の成功を確認した。

### References typedef を shared `data/References/db_type.json` へ集約

- References 用の共通 typedef は global `data/db_type.json` ではなく、shared layer の `data/References/db_type.json` を正本として扱う構成へ揃えた。
- `data/Works_NumberTales/References/db_type.json` は作品固有 typedef を持たない空オブジェクトへ縮退し、資料系フィールド宣言は shared references layer から供給する前提へ整理した。
- `tests/data.shape.test.js` を `data/References/db_type.json` 前提へ更新し、`tests/data.shape.test.js` の 3 件成功を確認した。

### References typedef の `RelatedWorks` を object 配列化

- `data/Works_NumberTales/References/db_type.json` では、資料系の関連先フィールドを `RelatedWorks` から `RelatedCreations` へ改名し、object 配列 typedef として各要素が `RelatedWorks` と `RelatedDB` を持てるようにした。
- これにより、資料系 DB でも `_DBLink` に近い粒度で「どの作品に紐づく関連か」「その作品内のどの DB まで紐づくか」を 1 要素ごとに表現できるようにした。
- 新構造の代表キーは `RelatedCreations[]` とし、その子要素に `RelatedWorks` / `RelatedDB` を持たせる形へ整理した。
- 回帰確認として `tests/data.shape.test.js` を更新し、`tests/data.shape.test.js` の 3 件成功を確認した。

### NumberTales の資料系 DB を `References/ref_*.json` へ統合

- `data/Works_NumberTales/DataBases/db_meta.json` と `data/Works_NumberTales/References/db_meta.json` の資料系 catalog key を `#DB_Glossary` / `#DB_Reference` から `#Ref_Glossary` / `#Ref_Reference` へ変更した。
- `data/Works_NumberTales/References/` へ glossary / reference の実データを統合し、`ref_Glossary.json` と `ref_Reference.json` に改名した。
- `lib/sw-common.js` は `#Ref_` prefix を資料系 catalog key として扱い、`References/ref_*.json` を `DB_File` なしで既定解決できるようにした。
- 回帰確認として `tests/sw.db-layer-routing.test.js`、`tests/data.sanity.test.js`、`tests/sw.work-meta-info.test.js` を実行し、通過を確認した。

### NumberTales に Glossaries / References の空テンプレートを追加

- `data/Works_NumberTales/DataBases/db_meta.json` に `#DB_Glossary` と `#DB_Reference` を追加し、それぞれ `DB_Layer: Glossaries` / `References` を宣言した。
- `data/Works_NumberTales/Glossaries/` と `data/Works_NumberTales/References/` に `db_meta.json`, `db_type.json`, 空の `db_Glossary.json` / `db_Reference.json` を追加し、User 手入力前提の最小テンプレートを配置した。
- これにより、既存の works/{work}/db 導線から NumberTales の新規レイヤー DB を段階的に増やせる土台を実ファイルとして用意した。

### `Databases.#DB_*` に `DB_Layer` を追加し、非 `DataBases/` レイヤーの受け皿を実装

- `data/db_type.json` の `$MetaType.$Def_DatabaseCatalog` に `DB_Layer` を追加し、作品別 `db_meta.json` から DB 実体の配置レイヤーを宣言できるようにした。
- `lib/sw-common.js` の `DataFetcher.readDB()` / `listWorkDBs()` は `Databases.#DB_<DbName>.DB_Layer` を参照して、`Glossaries/` や `References/` のような非 `DataBases/` レイヤー配下の `db_<DbName>.json` を読めるようにした。
- DB 一覧カタログでも `DB_Layer` を返すようにし、UI/API 側が各 DB の配置レイヤーを参照できるようにした。
- 回帰確認として `tests/sw.db-layer-routing.test.js` を追加し、layer-aware な DB 読み込みと一覧応答を検証した。

### 最小の `isPrivate` 公開制御を追加

- `lib/sw-common.js` の `db` / `search` エンドポイントで `isPrivate: true` のレコードを除外し、公開 API 応答へ含めないようにした。
- `lib/data-common.js` でも typedef 駆動検索と `_DBLink` 参照先探索から private レコードを除外し、enrich 経路での露出を抑えた。
- `pages/characters.js` では一覧再描画時に public レコードだけを扱い、private レコードが直接渡された場合も詳細画面に本文を描かず「非公開」表示で止めるようにした。
- 回帰確認として `tests/sw.dbmeta.tolerance.test.js` と `tests/pages.characters.ui-output.test.js` を更新し、通過を確認した。

### `_Secondaries` 要素用の `$MetaType` を追加し、二次創作情報 UI の hardcode を削減

- `data/db_type.json` のトップレベル `$MetaType` に `$Def_SecondaryMeta` を追加し、`sec_Category` / `sec_DesignedBy` など `_Secondaries[]` 要素で使う補助フィールドのラベルと型を宣言できるようにした。
- `pages/characters.js` の「二次創作情報」セクションは、この `$Def_SecondaryMeta` を参照して描画項目を決めるように変更し、sec 系フィールド配列のハードコードを外した。
- 回帰確認として `tests/meta.catalog.schema.test.js` と `tests/pages.characters.ui-output.test.js` を更新対象に含める前提を整えた。

### `_Secondaries` の series 一致から `sec_Category` / `sec_DesignedBy` も補完

- `lib/sw-common.js` と `pages/characters.js` で、`Databases.#DB_*._Secondaries[]` のうち `sec_SeriesTitle` などで一致した定義を保持し、その `_Commons` だけでなく `sec_Category` / `sec_DesignedBy` も空欄時にレコードへ補完するようにした。
- これにより、`db_Secondary.json` 側で `sec_SeriesTitle` のみを持つレコードでも、meta 側のシリーズ定義から二次創作分類と制作・考案者を UI/API で一貫して扱えるようにした。
- 回帰確認として `tests/commons.secondaries.test.js` と `tests/pages.characters.ui-output.test.js` を更新し、通過を確認した。

### `Class` を作品別 `dict_Class` 辞書参照へ移行

- `data/Works_NumberTales/DataBases/db_SelfSecondary.json`、`db_SemiPrimary.json`、`db_UnprocessedSecondary.json`、`data/Works_UnauthedLogica/DataBases/db_PrimaryMobs.json`、`data/Works_ShouArRiders/DataBases/db_Primary.json`、`data/Works_PastDivers/DataBases/db_meta.json` の `Class` / `Class_EN` を、作品別 `Dictionaries/dict_Class.json` を正とした `Class` 配列へ変換した。
- `data/Works_PastDivers/DataBases/db_meta.json` の隠し値 `{ hideText: "？？？" }` / `{ hideText_EN: "????" }` も、辞書プレースホルダ `"？？？"` を使う配列形式へ揃えた。
- `data/db_type.json` ではトップレベル `Class` を `#DictIndex[]` + `$dict: "Class"` へ変更し、旧 `Class_EN` のトップレベル宣言を削除した。
- `pages/characters.js` では一覧 chip と `_DBLink` 参照結果の Class 表示を `formatValueForDisplay()` 経由へ寄せ、配列化された辞書キーからラベル解決するようにした。
- 回帰確認として、対象 6 ファイルから `Class_EN` が消えていることを確認し、関連テストを実行して検証した。

### `Belonging` の参照先辞書を `Faction` へ改名し、`$dict` ベースで表示解決するよう統一

- `data/db_type.json` でトップレベル `Belonging` の `$dict` を `Faction` へ変更し、表示フィールド名と辞書名を分離した。
- `data/Dictionaries/db_meta.json` では辞書カタログを `#Dict_Faction` / `keyField: Faction` へ改名し、実体ファイルも `dict_Belonging.json` から `dict_Faction.json` へ変更した。
- `pages/characters.js` の辞書表示解決は、`#DictIndex` 系フィールドについて `fieldKey` 名ではなく typedef の `$dict` を優先して `#Dict_*` / `#List_*` を参照するようにした。
- これにより、record 側のフィールド名が `Belonging` のままでも、辞書項目側は `Faction` / `Faction_EN` を代表キーとして保持できるようにした。
- 回帰確認として `tests/data.shape.test.js`、`tests/sw.deftype.merge.test.js`、`tests/sw.enrich.basic.test.js`、`tests/pages.characters.syntax.test.js` を実行し、通過を確認した。

### `data/Dictionaries/` と作品別 `Dictionaries/` を追加し、`Area` / `Belonging` 辞書本体を分離

- グローバル辞書用に `data/Dictionaries/` を追加し、`db_meta.json` の辞書カタログと `dict_Area.json` / `dict_Belonging.json` の実体ファイルへ `Area` / `Belonging` 辞書を分離した。
- 作品別にも `data/Works_*/Dictionaries/` を追加し、作品固有辞書を今後増やせる受け皿として `db_meta.json` / `db_type.json` の空プレースホルダを用意した。
- `lib/sw-common.js` の `readGlobalMeta()` / `readWorkMeta()` は `Dictionaries/` 側のカタログと各 `dict_*.json` を runtime で読み込み、`General.$VarsDef` へ `#Dict_*` と後方互換の `#List_*` の両方を合流して返すようにした。
- `pages/characters.js` の direct fetch fallback も `data/Dictionaries/` を読むようにし、Service Worker を経由できない環境でも `BelongingArea` を含む辞書表示が崩れないようにした。
- `data/db_meta.json` からは `#List_Area` / `#List_Belonging` の実体配列を削除し、静的実体は辞書 DB 側を正とする構成へ切り替えた。
- 辞書カタログでは JSON ファイル名を個別指定せず、`#Dict_*` から `dict_{DictName}.json` を推論する方針へ変更した。
- 回帰確認として `tests/sw.deftype.merge.test.js`、`tests/sw.enrich.basic.test.js`、`tests/pages.characters.syntax.test.js`、`tests/data.shape.test.js`、`tests/enrich.dblink.jump.merge.test.js` を実行し、通過を確認した。

### `Area` / `Belonging` を `#DictIndex` 化し、`BelongingArea` 補助展開を廃止

- `data/db_type.json` で `Area` を `#DictIndex`、`Belonging` を `#DictIndex[]` として宣言し、いずれも `$dict` で辞書名を持てるようにした。
- これにより `BaseArea` は `$Def_BaseArea` という object typedef 名へ役割を限定し、トップレベル実フィールドは `BelongingArea` に統一した。
- `data/db_meta.json` の `#List_Belonging` でも、所属辞書の補助情報キーを `BaseArea` から `BelongingArea` へ改名した。
- `lib/data-common.js` では、`#List_Belonging` から top-level `BelongingArea` を自動補助展開する処理を削除し、所属辞書の拠点情報は辞書項目側の情報としてのみ保持するようにした。
- `pages/characters.js` は `#DictIndex` を `#ListIndex` と同系統の辞書参照型として表示解決できるようにし、将来 `#Dict_*` へ辞書定義を分離する準備を入れた。
- 回帰防止として `tests/data.shape.test.js` と `tests/enrich.dblink.jump.merge.test.js` を更新し、対象テストと `tests/pages.characters.syntax.test.js` の通過を確認した。

### basic セクションの既定表示を `basicFields` / typedef 指定のみに限定

- `pages/characters.js` で、`$DetailLayout.basicFields` 未指定時に使っていた固定 fallback 配列を廃止した。
- これにより、basic セクションへ出る項目は、作品別 `db_meta.json($DetailLayout.basicFields)` に列挙されたものと、`db_type.json($DefType).$display.section = basic` を持つものだけになった。
- `Belonging` / `BirthDay` / `AnivDay` / `BaseArea` / `Area` など schema 側で basic 指定がある項目は従来どおり表示されるが、未指定作品での `FormalName` / `ModelName` / `ModelNumber` などの自動 fallback 表示は行わないようにした。
- `pages/characters.html` の `asset-version` を更新し、ブラウザが新しい `characters.js` を取得しやすくした。

### `Belonging` 辞書内の `BaseArea` を enrich で `BaseArea` として補助展開

- `lib/data-common.js` で `#List_Belonging` の各項目に含まれる `BaseArea` を逆引きできる index を構築し、`Belonging` だけを持つレコードでも enrich 時に `BaseArea` を補助展開できるようにした。
- `BaseArea` が未設定で、所属から一意に活動拠点を導ける場合のみ top-level `BaseArea` に反映し、複数候補がある場合は `_enrichment.derivedBaseAreas` に保持するようにした。
- `data/db_type.json` / 作品別 `db_type.json` / `db_meta.json` に残っていた `$TypeDef` を `$DefType` へ統一し、live data 上の旧キー依存を解消した。
- `data/db_type.json` の `$Def_BaseArea` を `$DefType` ベースへ正規化し、`about` / `about_EN` を含む宣言へ拡張した。`BelongingArea` はこの object typedef を使い、top-level `Area` は `#ListIndex` の独立宣言として分離した。
- `pages/characters.js` では `$Def_BaseArea` の表示整形を `Area + about` 対応へ寄せ、`Area` の補助ハードコードを削減した。
- 回帰防止として `tests/enrich.dblink.jump.merge.test.js` に `Belonging -> BaseArea -> BelongingArea` の補助展開テストを追加し、通過を確認した。
- 追加で `tests/data.sanity.test.js` に「`/data` 配下で `$TypeDef` を使わない」検証を追加し、通過を確認した。

### `Day` / `StoryEra` の表示を typedef 駆動へ寄せ、basic 補助行ハードコードを削減

- `data/db_type.json` の `BirthDay` / `AnivDay` に `$display.section: basic` を追加し、キャラシートが schema に従って基本情報へ載せられるようにした。
- `pages/characters.js` の表示整形で、`$Def_Day` / `$Def_Day[]` を `DayAbout` 含みで generic に整形し、`AnivDay` 配列は改行ベースで表示するようにした。
- `pages/characters.js` で `StoryEra` の概要表示を共通 formatter 経由へ寄せ、DB 概要パネルの年代メモも `about_JP/about_EN/about` ベースの typedef 的な扱いへ揃えた。
- `pages/characters.js` では `Belonging` / `BirthDay` / `AnivDay` の basic 補助行ハードコードを減らし、schema と `$DetailLayout.basicFields` 側の責務を優先するようにした。
- 回帰確認として `tests/pages.characters.syntax.test.js` を実行し、通過を確認した。

### `db_type.json` / `db_meta.json` の宣言面と内部処理ドキュメントを補強

- `docs/schema-meta-processing.md` を追加し、`$DefType` / `$VarsDef` / `$IndexDef` / `$MetaType` と `CreationWorks` / `Databases` / `_Commons` / `_Secondaries` の責務、および SW/enrich/UI での合流順を整理した。
- `docs/db-update-guidelines.md` に、作品/DB カタログ schema、DB 表示名、`$VarsDef` 合流方針への補足を追加した。
- `docs/README.md`、`docs/api-sw-spec.md`、`docs/implementation-playbook.md` から新しい技術メモへ辿れるようにした。

### セッション完了状態に合わせて指示書と進捗ログを同期

- `.github/copilot-instructions.md` に、`docs/schema-meta-processing.md` の参照方針、`$MetaType` / `DB_Label` の運用、`$VarsDef` の実行時合流前提を追記した。
- `_work_in_progress/2026-03-31_remaining-task.md` に、希望タスク 1〜3 の完了状況を追記した。
- `_work_in_progress/2026-04-21_progress_multi-index-display.md`、`_work_in_progress/2026-04-22_progress_creationwork-meta-api-ui.md`、`_work_in_progress/2026-04-22_progress_schema-meta-docs.md` の未完了タスク欄を完了状態へ更新した。

### `db_meta.json` の創作タイトル情報を API/UI で参照可能に拡張

- `lib/sw-common.js` の `works` / `works/{work}` / `works/{work}/db` / `bootstrap` 応答へ、`CreationWorks` の `Title` / `Title_EN` / `Works_Summary` / `OldTitles` と、作品別 `Databases` の `DB_Summary` / `StoryEra` を正規化して含めるようにした。
- `pages/characters.html` / `pages/characters.js` / `pages/characters.sass` に、選択中の作品情報と DB情報を表示する概要パネルを追加し、作品概要・旧題・年代メモ・DB概要を閲覧できるようにした。
- 回帰確認として `tests/sw.work-meta-info.test.js` と `tests/pages.characters.syntax.test.js` を実行し、通過を確認した。

### DB 表示名とカタログ用 schema 宣言を追加

- 作品別 `data/Works_*/DataBases/db_meta.json` の各 `Databases.#DB_*` に `DB_Label` / `DB_Label_EN` を追加し、DB セレクトや概要表示で人間向けラベルを使えるようにした。
- `lib/sw-common.js` の DB カタログ整形で `DB_Label` / `DB_Label_EN` を返し、旧メタには既定ラベルを補完するようにした。
- `pages/characters.js` と `pages/characters.html` で DB キー直表示をやめ、表示名優先で選択肢と概要ヘッダを描画するようにした。
- `data/db_type.json` に `$MetaType` を追加し、CreationWorks / OldTitles / DatabaseCatalog / StoryEra の補助 schema 宣言を持たせた。
- 回帰確認として `tests/sw.work-meta-info.test.js`、`tests/pages.characters.syntax.test.js`、`tests/meta.catalog.schema.test.js` を実行し、通過を確認した。

### object 形式 `#Index` の複数要素表示と `$display.index` 制御を追加

- `pages/characters.js` で object 形式の `#Index` を複数要素として収集できるようにし、一覧 chip / 詳細 pill / `#Index` 値整形 / `idx` `idxKey` 一致判定を同じ helper 群へ統一した。
- 既定値として、一覧 chip と canonical な直リンクは主要サブ要素を優先しつつ、詳細ヘッダと `#Index` 値表示では非空の全サブ要素を表示するようにした。
- 各サブ要素の `"$display": { "index": { list, detail, value, link, priority, order } }` により、作品別 typedef 側で表示対象と優先順位を宣言的に調整できるようにした。
- 運用ルールを `docs/db-update-guidelines.md`、`docs/implementation-playbook.md`、`.github/copilot-instructions.md` へ同期した。

### `_Secondaries` の default fallback 優先順位を明確化

- `lib/sw-common.js` と `pages/characters.js` で、`Databases.#DB_<DbName>._Secondaries[]` のうち全 `sec_**` 条件が `null` / 空の定義をデフォルト fallback として扱い、条件付き定義が一致した場合はそちらを優先するように整理した。
- これにより、`_Secondaries` 配列の並び順に依存せず、`sec_Category` / `sec_DesignedBy` / `sec_SeriesTitle` を持つ具体定義が fallback 定義より優先されるようにした。
- `data/Works_NumberTales/DataBases/db_SelfSecondary.json` では、一部レコードの `sec_DesignedBy` typo を正規キーへ揃え、`ナンバーテールズ化企画` 向け `_Commons` に一致するよう修正した。
- 回帰確認として `tests/commons.secondaries.test.js`、`tests/sw.enrich.basic.test.js`、`tests/sw.dbmeta.tolerance.test.js` を実行し、通過を確認した。

### 実装運用プレイブックと Copilot 指示書を更新

- `docs/implementation-playbook.md` を追加し、UI / API / SW / data / docs の各レイヤーで「まずどこを正にするか」「どのファイルを先に確認するか」「変更後にどの docs を同期するか」を整理した。
- `.github/copilot-instructions.md` に、2026-04 セッションで確定した運用ルールとして、List 系詳細の multiline 表示、bilingual multiline の 2 列表示、basic 補助行の重複抑制、cross-work `_DBLink` 制約、`db_meta.json` 欠損耐性、docs 同期方針を追記した。
- `docs/README.md` から新しい実装運用プレイブックへ辿れるようにした。

### API / SW 周辺の技術仕様ドキュメントと注釈を補強

- `docs/api-sw-spec.md` を追加し、`/api/v1` / `/pages/v1` / `/svc/v1` の役割差、`db_type.json` / `db_meta.json` / 予約語の責務分担、`_enrichment` の出力仕様、`db_meta.json` 欠損時ポリシーを整理した。
- `docs/README.md` と `docs/viewer-guide.md` から新しい API/SW 技術メモへ辿れるようにした。
- `lib/sw-common.js` に、bootstrap / DB取得 / search / varsdef の設計意図が分かる注釈を追加した。
- `lib/data-common.js` に、work context の辞書合成、cross-work `_DBLink` の schema 制約、`_enrichment` / `displaySections` の位置づけが分かる注釈を追加した。

### `_DBLink` の別作品参照で schema 未宣言項目を抑止

- `lib/data-common.js` の `_DBLink` 穴埋めマージで、別作品から参照する場合は対象作品の `db_type.json($DefType)` とグローバル `data/db_type.json($DefType)` に宣言されたトップレベル項目だけを取り込むようにした。
- これにより、`Works_UnauthedLogica` から `Works_NumberTales` を `_DBLink` 参照した際に、UnauthedLogica 側で宣言していない `Relations` などのトップレベル項目が不要に混入する経路を遮断した。
- 回帰防止として `tests/enrich.dblink.jump.merge.test.js` に「別作品 + schema 未宣言キーはマージしない」テストを追加した。

### `#ListIndex[]` / `#ListLink[]` の詳細表示を要素ごと改行

- `pages/characters.js` の表示整形で、typedef 上の `#ListIndex[]` / `#ListLink[]` は配列要素を `, ` 連結せず改行連結するようにした。
- `kvTable()` 側でも改行文字列を `white-space: pre-wrap` で表示するようにし、`Belonging` のような複数所属が 1 要素 1 行で読めるようにした。
- 詳細ビューの basic 補助テーブルでは、`Belonging` / `Area` / `BirthDay` / `AnivDay` が `db_meta.json($DetailLayout.basicFields)` ですでに表示されている場合に重複追加しないようにした。
- `##String_JP` / `##String_EN` の名称系フィールドで、和英のどちらかに改行が含まれる場合は詳細テーブル内で JP/EN を左右 2 列に分けて表示するようにした。

### データ schema の typo・命名修正

- 共有 schema と作品別データで、relation label の typo `secletRelation` を `secretRelation` へ統一した。
- 共有 schema / NumberTales / PastDivers の relation 応答キー `ComeBacked` を `Reply` へ改名した。
- 共有 schema と NumberTales 系データの関連メモ項目 `RelationAbouts` を `RelationNotes` へ改名した。
- 共有 schema と複数作品データの能力値キー `Communicating` を `Communication` へ統一した。
- 共有 schema と複数作品データの弱点項目 `Weakpoint` を `Weakness` へ改名した。
- 作品識別子 `DestinyFoxsRecords` を `DestinyFoxRecords` へ更新した。
- 回帰確認として `tests/data.sanity.test.js` / `tests/data.shape.test.js` / `tests/sw.deftype.merge.test.js` / `tests/sw.enrich.basic.test.js` を実行し、通過を確認した。

### Decave enum 辞書の API/UI 合成対応

- `lib/sw-common.js` の `v1/deftype/global` で、`db_meta.json` に加えて `data/db_type.json($VarsDef)` も `General.$VarsDef` へ合流して返すようにした。
- `lib/sw-common.js` の `v1/works/{work}/meta` でも、作品別 `db_type.json($VarsDef)` を `meta.General.$VarsDef` に含めるようにした。
- `pages/characters.js` の `fetchGlobalDefType()` で、API 応答が古い/不完全な場合でも `db_type.json` 側の `$EnumDef_*` を補完し、`Decave` の表示解決を維持するようにした。
- 回帰防止として `tests/sw.deftype.merge.test.js` を追加した。

### キャラシートの wrapper/spec 表示修正

- `pages/characters.js` で、`$EnumDef_*` / `#ListIndex` / `#ListLink` / `#Index` の wrapper object を汎用 object 展開より優先して整形するよう変更した。
- これにより、`Works_UnauthedLogica` の `ExistingRarity` が `Rarity: SSR` のような内部キー表示へ崩れる問題を修正した。
- `pages/characters.js` で `specStats` 内の `SpecType` 候補推定を補強し、`Works_FLInvestigator78` で `EffectStats` を誤って能力種別扱いしにくいよう調整した。
- `pages/characters.html` の `asset-version` を更新し、ブラウザ側で新しい `characters.js` を確実に取得できるようにした。
- `pages/characters.js` で `specStats` コンテナ自体を能力値グリッド推定から除外し、`Works_FLInvestigator78` の `ArcanumspecStats` が `能力種別: [object Object]` / `効果詳細: 普通, ...` として誤描画される経路を遮断した。
- `pages/characters.js` で `specStats` 配下の未処理フィールドを `$display.section` に従って spec/profile セクションへ合流するよう変更し、`Works_PastDivers` の `ChronoizedPurity` と `ChronoizedAbout` が表示されるようにした。
- `lib/data-common.js` の enrich 処理で `#ListLink_*` を varsdef から逆引きし、`EffectText` / `SafetyLevelText` などの wrapper object に `Rank` と補助ラベルを再帰補完するよう変更した。
- これにより、作品ごとの差分ではなく SW 側の共通正規化で「スペック/能力」の表示書式を揃えやすくした。
- 回帰防止として `tests/enrich.dblink.jump.merge.test.js` に `#ListLink` 補完テストを追加した。
- `pages/characters.js` の API fetch を `cache: 'no-store'` に変更し、ブラウザが古い enrich 応答を再利用して表示差分が反映されない状況を避けるようにした。
- `pages/characters.html` の `asset-version` を `2026.04.06.5` へ更新し、最新の `characters.js` を取得しやすくした。
- `pages/characters.js` の spec/effect 判定で使う「単一葉オブジェクト」判定を緩和し、SW enrich によって `Rank` や `*_EN` が補完された `#ListLink` wrapper でも `EffectStats` / `SafetyLevel` を表示対象として維持するよう修正した。
- `pages/characters.js` で `SpecLevel` のような rank 系 spec 項目を `SafetyLevel` と同じタグ群へ寄せ、`運命線探偵78` の「安全レベル」と「能力レベル」で表示レイアウトが分かれる問題を解消した。
- `pages/characters.js` で `BirthDay` を `AnivDay` と同じ basic 補助行として扱うよう修正し、`誕生日` が「その他の項目」へ落ちる不具合を解消した。
- `pages/characters.js` の詳細表示を typedef / meta 駆動へ寄せ、未定義のトップレベル項目を自動的に「その他の項目」へ流すフォールバック、および `_DBLink` / `_DBLinkResolved` の表示を停止した。

### API テスト UI のエンドポイント検証を強化

- `api/api.js` で、API テスト UI の入力値をそのまま `fetch()` しないよう変更した。
- カスタム入力およびボタン経由のパスは、同一オリジンかつ `'/api/v1/*'` に解決される場合のみ実行するよう制限した。
- `javascript:` などの不正スキーム、外部オリジン URL、許可外パスは UI 上で拒否し、エラーログ表示へ切り替えるようにした。
- 回帰防止として `tests/api.endpoint-guard.test.js` を追加した。

## 2025.08.21〜2025.08.30

### DB大規模拡張・データ構造整備 / APIテストページ整備

- 複数作品（NumberTales / FLInvestigator78 / ShouArRiders / SinisterChangingGirls / Proxies / DestinyFoxRecords 等）の DB 更新と、`db_meta.json` などメタ情報の整理を実施。
- `api/` 側のテストページ・スクリプトの整備を進め、疑似 API の動作確認導線を改善。

#### 影響範囲（代表）

- `api/api.js`, `api/index.html`
- `data/db_meta.json`
- `data/Works_*/DataBases/*.json`

## 2025.10.25〜2025.10.30

### キャラシート機能（pages）実装・安定化 / テスト導入

- `pages/characters.*` を中心に、キャラシート表示ページの実装と段階的な動作検証（試運転）を実施。
- `pages/sw.js` を含む Service Worker 連携の整備と bugfix を反復し、GitHub Pages 環境での動作安定性を向上。
- Vitest による基本テスト（データ整合・構造・SW エンドポイント）を追加。
- GitHub Pages 向けの運用整備として、`.nojekyll` の追加や GitHub Actions ワークフロー追加を実施。

#### 影響範囲（代表）

- `pages/characters.html`, `pages/characters.js`, `pages/characters.sass`, `pages/characters.css`
- `pages/sw.js`, `api/sw.js`, `svc/sw.js`
- `tests/data.sanity.test.js`, `tests/data.shape.test.js`, `tests/sw.enrich.basic.test.js`
- `.github/workflows/jekyll-gh-pages.yml`, `.nojekyll`

## 2025.11.23

### 共通ライブラリアーキテクチャの実装

#### 実装された変更内容

1. **SharedLibrary アーキテクチャの導入**
2. **StandardEndpointHandlers クラスの実装**
   - Service Worker 間で重複していた標準エンドポイント処理を統合

- UI: 詳細ビューの表示制御を拡張し、`data/db_meta.json` の `CreationWorks.<work>.$DetailLayout`（`headerPills`/`basicFields`/`suppressKeys`）に追従できるようにした。
- UI: `data/db_type.json` の `"$display"` に `auto:false` を追加し、自動表示から除外できるようにした（別名/統合表示向け）。
- Data: `data/db_type.json` に `ModelName`/`Class`/`Class_EN` のトップレベル定義を追加し、`CodeName`/`SPCodeName_EN`/`Class_EN` へ `auto:false` と `aliasOf` を付与した。
  - スコープ対応機能（API、Pages、SVC）
  - エンリッチメント制御（Pages スコープでのみ有効）
  - 約 300 行以上の重複コード削除を実現

3. **EnrichmentProcessor.enrichRecords()メソッドの追加**
   - キャラクターデータの充実化処理機能
   - 画像情報の自動抽出と処理
   - 検索可能テキストのインデックス化
   - エラーハンドリング機能付き

4. **Service Worker 統合とマルチスコープ対応**
   - api/sw.js: 標準 API エンドポイント（エンリッチメントなし）
   - pages/sw.js: キャラクターページ特化（エンリッチメント付き）
   - svc/sw.js: 広告ブロッカー回避用（エンリッチメントなし）

#### 技術的効果

- **保守性向上**: 共通ライブラリによる一元管理
- **コード削減**: 300 行以上の重複コード削除
- **機能統一**: 全スコープで統一された API 動作
- **エラー修正**: enrichRecords メソッド不存在エラーの解決
- **テスト通過**: 全 4 つのテストケースが成功

## 2025.11.26〜2025.12.27

### DB更新（コンテンツ追加・調整）

- DB進捗更新（例: ナンバーテールズ / 運命線探偵 / 獣爾騎兵）を継続。

#### 影響範囲（代表）

- `data/Works_NumberTales/DataBases/db_Primary.json`
- `data/Works_ShouArRiders/DataBases/db_Primary.json`

## 2026.01.24〜2026.01.27

### DB整備・README更新

- 複数作品の DB 情報追加と、`db_meta.json` / `db_type.json` 周辺の整備・軽微な bugfix を実施。
- `README.md` の更新（複数コミット）を実施。

#### 影響範囲（代表）

- `data/Works_*/DataBases/*.json`, `data/db_meta.json`, `data/db_type.json`
- `README.md`

## 2026.02.03

### 呼称フィールド正規化（後処理）と半自動チェックの追加

- 呼称フィールド（callings）正規化のための半自動チェック・後処理手順を整理。
- 正規化支援スクリプト `tools/normalize-callings.mjs` を追加。
- 作業ログを `_work_in_progress/2026-02-03_callings-normalize.md` に記録。

#### 影響範囲（代表）

- `tools/normalize-callings.mjs`
- `data/Works_*/DataBases/*.json`
- `_work_in_progress/2026-02-03_callings-normalize.md`

## 2026.02.18

### typedef 駆動エンリッチ強化 / キャラシート不足フィールドの改善

- `db_type.json($DefType)` を参照した typedef 駆動のエンリッチ・表示追従を強化。
- キャラシート側の不足フィールドや表示追従を改善し、挙動を作業ログに整理。

#### 影響範囲（代表）

- `lib/data-common.js`, `lib/sw-common.js`
- `pages/characters.js`, `pages/sw.js`
- `_work_in_progress/2026-02-18_characters-missing-fields.md`
- `_work_in_progress/2026-02-18_sw-typedef-driven-enrichment.md`

## 2026.02.20

## 2026.03.06

### 会話パターン情報追加のためのスキーマ拡張（typedef）

- `data/db_type.json($DefType)` に `ConversationPattern` を追加し、会話パターン（口調/話題傾向/頻度等）を格納できるようにした。
- `ConversationPattern` 配下の `DialogueExamples` を `#Dialogue[]|#Dialogue_withAbout[]|#Null` として整理し、台詞系テキストであることを typedef 上で明示した。
- 値（コンテンツ）は User 手動入力を前提とし、Copilot による創作内容の自動生成を避ける運用を想定。
- `ConversationPattern` は当面 `searchable:false` とし、表示は可能だが検索インデックスへは含めない方針を明示した。
- `#Dialogue[]|#Dialogue_withAbout[]|#Null` の運用確認として、ネストした array union 型の enrich 正規化と、`ConversationPattern` の構造化表示に対応した。
- `data/Works_NumberTales/DataBases/db_type.json` の `Relation.*.Comments` を `#Dialogue` 化し、関係欄コメントも台詞系として schema-driven に整形できるようにした。

### pages/characters.js の構文エラー修正

- `pages/characters.js` 先頭に関数内コード断片が混入し、ブラウザで `Illegal return statement` が発生してキャラシートが表示不能になる不具合を修正した。
- あわせて `tests/pages.characters.syntax.test.js` を追加し、`node --check` による構文スモークテストで同種の破損を検知できるようにした。

### `#Dialogue` 表示統一と nullable 型の整理

- `#Dialogue` 型は `Relation.Comments` の本文と同じ共通ノードで描画するようにし、会話例と関係コメントの表示書式を統一した。
- `Hobby` / `SpetialSkill` / `Favor` / `Unlike` / `Strength` / `Weakpoint` を `#String|#Summary|#Null` に統一した。
- `ConversationPattern` の `TalkingTone` / `TopicPreference` / `TalkFrequency` / `PreferredTopics` / `AvoidedTopics` / `ConversationNotes` も `#String|#Summary|#Null` に統一した。

### `ConversationPattern` の詳細表示レイアウト調整

- `ConversationPattern` は表形式ではなく、項目ごとの「見出し枠 + 本文」で表示するように変更した。
- `DialogueExamples` は `Relation` セクションに近い `kv-grid` の複数枠表示へ寄せ、各台詞例を独立した枠として表示するようにした。

### Object 型フィールド処理の強化（その1〜3）

#### 変更内容

1. **キャラシート表示の Object 値フォーマット強化**
   - `pages/characters.js` で、Object 型値が `[object Object]` にならないよう表示整形を強化
   - `_Jump` / `_DBLink` / `_Search` などの参照系オブジェクトを人間が読める形に整形
   - `Weight_kg` / `Height_cm` など単位付きの基本項目でも、`{ value, about_* }[]` / `{ hideText }` を含めて表示可能に
   - `_Commons` 適用時に `#List_*` 等のメタ定義がレコードへ混入しないよう、`#`/`_` 始まりキーを除外

2. **検索（EnrichmentProcessor.searchRecords）の Object 値比較を強化**
   - Object/配列/ラッパー（`{ value, about_* }` / `{ hideText }` 等）の揺れを吸収し、検索一致判定の耐性を向上

3. **参照マージ出力（\_DBLink / \_Jump）の実装**
   - `lib/data-common.js` の `EnrichmentProcessor.enrichRecords()` に、参照先DBの解決→同名フィールド穴埋め→`_Jump` 実値置換を追加
   - `_Search` は **1件一致のみ採用**（曖昧一致・複数一致はスキップ）
   - `hideText` は意図的マスクとして尊重（参照先値で上書きしない）
   - 画像系フィールドは **別DB（別JSON）から参照しない**（同一JSON参照の場合のみマージ許可）

4. **テスト追加**
   - `tests/enrich.dblink.jump.merge.test.js` を追加し、`_DBLink/_Jump` マージ挙動を回帰防止

5. **進捗ログ追加**
   - `_work_in_progress/2026-02-20_dblink-jump-merge.md` に実装方針・影響範囲・検証結果を記録

#### 影響範囲

- `pages/characters.js`
- `lib/data-common.js`
- `tests/enrich.dblink.jump.merge.test.js`
- `_work_in_progress/2026-02-20_dblink-jump-merge.md`

### typedef 表示メタデータ（`$display`）の試験導入

- `db_type.json($DefType)` に後方互換な表示メタ情報 `"$display"` を追加（宣言のみ・既存挙動は維持）。
- まず `unit`（例: `Height_cm`/`Weight_kg`）と、UI分類用の `section`、管理主体/タグ領域を表す `tagSpace`（`creation`/`creatorProgress`/`system`/`internal` 案）を導入。
- グローバルだけでなく、作品別 `data/Works_*/DataBases/db_type.json` にも `Images` や enum/list 系フィールドへ `section/tagSpace` を追記し、スキーマ駆動表示への移行準備を開始。
- クライアント（`pages/characters.js`）で `"$display.unit"` を参照し、身長/体重などの単位付き表示を typedef 駆動へ移行（cm/kg のハードコードを撤去）。
- クライアント（`pages/characters.js`）で `"$display.section"` を参照し、未表示のトップレベル項目を `basic/profile/spec/other` へ自動振り分けして表示するよう対応。
- 設計メモを `_work_in_progress/2026-02-20_schema-driven-display-format.md` に整理。

## 2026.02.21

### キャラシート: db_meta.json（$VarsDef）ネスト定義の参照強化

- `pages/characters.js` の `#ListIndex` 表示解決で、作品別 `db_meta.json` にある `$Def_*` 配下の `#List_*`（例: `$Def_ArcanumspecStats.$Def_SpecType.#List_Material`）も参照して表示名を解決できるようにした。
- `DualizePattern` のように `#List_<Field>` 内の実値キーが `Pattern` になるケースも、値一致による柔軟な逆引きで表示名へ解決するよう改善。

### キャラシート: object子要素の分解表示 / Relation表示の宣言駆動化

- UI（`pages/characters.js`）: typedef 上で子フィールドが定義されている object 値（例: `For79or80thDealerCalling` / `SpecType.ActionType`）を、子ラベル付きで展開して表示するようにし、`[object Object]` 表示を回避。
- UI（`pages/characters.js`）: `Relation.Related[].RelationLabel` を `db_meta.json($VarsDef.#List_RelationLabel)` でJP化して表示するようにした。
- Data（NumberTales）: `data/Works_NumberTales/DataBases/db_type.json` の `$VarsDef.$Def_Relations.$TypeDef` を `data/Works_NumberTales/DataBases/db_meta.json(General.$VarsDef.$Def_Relations.$TypeDef)` へ移動し、`db_type.json` からは `$VarsDef` を削除。
- Data（ShouArRiders）: `BeastspecName` / `BeastspecName_EN` に `$display.section:"profile"` を追加し、「プロフィール/テキスト」へ自動分類されるようにした。
- UI（`pages/characters.js`）: `resolveVarsDefLabel()` が `Databases.*._Commons`（例: ShouArRiders の `#List_Beast`）も探索して `#ListIndex` の表示名解決に利用できるようにした。
- UI（`pages/characters.js`）: `#ListIndex_withAbout[]`（例: `RaceType`）の `{ <Field>: code, about(_JP|EN) }` を「表示名（about）」として整形できるようにした。

#### 影響範囲（代表）

- `pages/characters.js`
- `db_type.json($DefType)` の `$alt`（代替フィールド参照）を UI と enrich 出力が解釈し、該当キーが無い場合に代替キーを参照できるようにした。

### EnumDef/EnumLink 表示のフィールド単位制御（Rank/Rarity）

- UI（`pages/characters.js`）で、typedef 由来の `$type` に含まれる `$EnumDef_*` / `$EnumLink` を汎用的に解釈し、Rank/Rarity などの定義型を共通ロジックで表示整形できるようにした。
- UI（`pages/characters.js`）の表示整形（`formatValueForDisplay()`）へ `fieldKey` を伝播し、作品別 `db_meta.json` の `$EnumLink_${Field}`（例: `$EnumLink_ExistingRarity`）から表示名を解決できるようにした。
- `$EnumLink` が存在する場合の既定表示は「alphaLabel（コード＋ラベル）優先」（仮設定）としつつ、`db_type.json($DefType)` の `$display` に `rankFormat` / `rarityFormat` / `enumFormat` を指定することでフィールド単位に表記を切り替えられるようにした。
- `$EnumLink_*` 定義が `db_meta.json` の `$VarsDef` 内でネストしているケース（例: `$Def_AbilityStats.$EnumLink_AbilityText`）を想定し、UI 側でネスト探索して解決できるようにした。
- `db_type.json($DefType)` の `$display.enumLinkKey` により、参照する `$EnumLink_*` をフィールド単位に指定できるようにした（例: `AbilityStats` → `AbilityText`、`SpecLevel` → `SpecLevelText`）。
- `#ListLink_*` が typedef で宣言されている「文字列ラッパー」（例: `{ EffectText: '絶大' }` / `{ SafetyLevelText: '安全' }`）について、`db_meta.json` の `#ListLink_*` 定義から逆引きして `Rank` を取り出せる場合は `alphaLabel`（例: `S（絶大）`）として表示できるようにした。
- `db_type.json($DefType).$display` に `listLinkShowEnum`（boolean）/ `listLinkEnumName`（string）を追加し、#ListLink の enum 併記可否・参照する enum キーを JSON 側で制御できるようにした（JS 側のハードコード削減）。
- Data: `data/db_type.json` の `AbilityStats` に `$display.rankFormat` を追記（例示）。
- Data: `data/Works_UnauthedLogica/DataBases/db_type.json` の `ExistingRarity` に `$display.rarityFormat` を追記（例示）。

#### 影響範囲（代表）

- `data/db_type.json`
- `data/Works_FLInvestigator78/DataBases/db_type.json`
- `data/Works_NumberTales/DataBases/db_type.json`
- `data/Works_ShouArRiders/DataBases/db_type.json`

### EnumDef/#ListIndex: JP/EN 併記と表示制御（langMode）

- UI（`pages/characters.js`）: `$EnumDef(|$EnumDef_withAbout)` および `#ListIndex(|#ListIndex_withAbout)` の表示で、辞書（`db_meta.json`）から JP/EN を取得し `JP / EN` 形式で併記できるようにした。
- UI（`pages/characters.js`）: 作品別メタで `#List_*` が `General.$VarsDef` 以外（例: `General.$Def_Relations.#List_RelationLabel`）に定義されている場合も探索して解決できるようにし、RelationLabel がコード（英語）だけになる問題を回避。
- UI（`pages/characters.js`）: typedef の `$display.langMode`（任意）で、JP/EN の表示切替・併記抑制ができるようにした（例: `'jp' | 'en' | 'enJp' | 'raw'`）。
- UI（`pages/characters.js`）: グローバル定義辞書の取得失敗時に「空オブジェクトをキャッシュして固定化」しないようにし、Service Worker が制御状態になった後に再試行で復旧できるようにした。
- UI（`pages/characters.js`）: グローバル辞書/typedef キャッシュが期待形でない場合は自動的に破棄して再フェッチする自己復旧を追加（古いキャッシュ等で辞書解決できずコード表示に戻るケースの緩和）。
- UI（`pages/characters.js`）: `fetchGlobalDefType()` の API 応答が期待形でない場合に、`/data/db_meta.json` を `cache:'no-store'` で直 fetch する最終フォールバックを追加（GenderType 等がコード表示に戻るケースの最終救済）。
- UI（`pages/characters.js`）: `fetchGlobalDefType()` の妥当性判定を強化し、`General.$VarsDef.$EnumDef_GenderType` を含まない不完全な辞書（誤レスポンス等）を有効キャッシュしないよう修正（「性別だけ FemaleNeutral が残る」根本原因の可能性に対応）。
- UI（`pages/characters.js`）: Service Worker の controller 待ちで「タイムアウトでも成功扱い」になっていたため未制御のまま `/pages/v1/works` を叩いて 404 になる問題を修正（制御されるまで待機し、失敗は初期化エラーとして扱う）。
- UI（`pages/characters.js`）: controller が付与されないケースの救済として、SW ready 後に `clients.claim()` を先に依頼し、短い待機→再試行の段階的待機に変更（SW/キャッシュリセット直後の初期化が 15s 固定で遅くなる問題を緩和）。
- UI（`pages/characters.js`）: `schemaType` 推定が `#String` 等になってしまう経路でも、`fieldKey` があれば `db_meta.json($VarsDef)` を最後に参照して Enum/List の表示名解決を試すよう改善（GenderType が英語コードのまま残るケースの緩和）。
- UI（`pages/characters.js`）: `fieldKey` が `GenderType_JP` のような言語サフィックス付きで伝播した場合でも、VarsDef 参照用のキーをベース名（`GenderType`）へ正規化して Enum/List の表示名解決ができるよう修正（kv-table の性別が `FemaleNeutral` のまま残るケースの根治）。
- UI（`pages/characters.js`）: `$display` 抽出拡張に伴う `ReferenceError`（`traverseTmp` 未定義）で初期描画が落ちる不具合を修正。
- UI（`pages/characters.js`）: `#List_Belonging` のように「ベースキーがJP文字列で \*\_JP が無い」辞書定義でも、JP/EN 併記が EN-only にならないようフォールバックを改善。
- `data/Works_SinisterChangingGirls/DataBases/db_type.json`
- `data/Works_Proxies/DataBases/db_type.json`
- `data/Works_DestinyFoxRecords/DataBases/db_type.json`
- `data/Works_UnauthedLogica/DataBases/db_type.json`
- `_work_in_progress/2026-02-20_schema-driven-display-format.md`

### Secondary DB（二次創作DB）の表示追従（isForSecondary / RelationToPrimary）

- UI（`pages/characters.js`）: `db_type.json($DefType)` のトップレベル項目抽出で `isForSecondary` を DB 文脈（Primary/Secondary）に応じてフィルタし、Secondary 専用フィールドが Primary 側に出ないよう制御を追加。
- UI（`pages/characters.js`）: `RelationToPrimary` を「関係」系セクションとして描画し、Secondary レコードで「原作との関係」を表示できるようにした。

## 2026.02.21

### 2言語対応フィールド（_\_JP / _\_EN）の同義解釈

- UI（`pages/characters.js`）: 詳細ビューの基本情報テーブルとスキーマ駆動の自動表示で、`*_JP`/`*_EN` を同義フィールドとして1行に統合し、重複表示を抑止。
- UI（`pages/characters.js`）: リスト側の簡易検索（`matchFilter`）に `Name_JP`/`FormalName_JP` などの互換キーも追加。
- SW（`lib/data-common.js`）: `EnrichmentProcessor.searchRecords()` が、クエリ hashTag の `base`/`*_JP`/`*_EN` を相互にエイリアス扱いして一致判定できるように拡張。
- Test: `tests/bilingual-fields.test.js` を追加。

### `_Commons` 既定値の適用強化（空値も未設定扱い）

- SW（`lib/sw-common.js`）: `CommonsProcessor.applyCommonsToRecords()` の既定値適用で、`undefined` だけでなく `null` / `''` / `[]` / `{}` も未設定扱いにして `_Commons` を適用するよう拡張。
- `{ hideText: '...' }` は意図的マスクとして扱い、空値として上書きしない。
- これにより、作品別 `db_meta.json` の `_Commons` で指定した初期値が、後段の `_DBLink` 参照で穴埋めされる値より優先される。

### キャラシート: JP/EN 併記・辞書表示・空表示抑止の追補

- UI（`pages/characters.js`）: スキーマ上に base キーしか無い場合でも、実データに `*_JP` / `*_EN` があれば 1 行に統合して表示するよう拡張。
- UI（`pages/characters.js`）: base キーが表示済みの場合は `*_JP` / `*_EN` を二重表示しないよう抑止。
- UI（`pages/characters.js`）: 空配列/空オブジェクト等を「表示不要」とみなす判定を強化し、空の能力種別が余分に出るケースを抑制。
- UI（`pages/characters.js`）: `_DBLink` 解決結果のチップ（`RaceType`/`GenderType`）を typedef/meta 駆動の整形へ統一。
- SW（`lib/sw-common.js`）: `v1/deftype/global` が誤って `db_type.json` を返していたため、`db_meta.json`（`General.$VarsDef` の定義辞書）を返すよう修正。これにより `GenderType` / `RelationLabel` 等の和文化が安定して動作する。
- UI（`pages/characters.js`）: `fetchGlobalDefType()` がラッパー形式（例: `{ meta: ... }`）のレスポンスを受け取った場合でも辞書本体を復元できるようにし、`GenderType` などが英語コード表示にフォールバックするケースを緩和。
- UI（`pages/characters.js`）: 詳細ビューの基本情報テーブルで、値整形に `metaForLookup`（work+global 統合メタ）を使うよう統一し、グローバル辞書（`$EnumDef_GenderType`）を確実に参照できるようにした。
- UI（`pages/characters.js`）: `#ListIndex` の表示名解決で「値一致を確認せずに先頭要素のラベルを返してしまう」不具合を修正。これにより `Belonging` 等が“常に同一値”になる問題を解消。
- UI（`pages/characters.js`）: typedef が `$EnumDef(|$EnumDef_withAbout)` / `#ListIndex[]` のフィールドについて、辞書定義に応じて「JP/EN 併記（例: `日本語 / English`）」で表示できるようにした（例: `GenderType`, `Belonging`, `RelationLabel`）。
- Data（NumberTales）: `Relation.Related` / `Relation.Commented` / `ComeBacked` の typedef を `$Def_Relations[]` に揃え、実データ（配列）と現行 UI ロジックに合わせて堅牢化。

### GenderType 辞書表示の堅牢化 / `Valiable` 統合

- UI（`pages/characters.js`）: `resolveVarsDefLabelPack()` で `$EnumDef_*` の辞書解決を「キー直引き（例: `#FemaleNeutral`）」優先にし、スキャン依存による取りこぼしを低減。
- UI（`pages/characters.js`）: `GenderType` の typo コード `Valiable` を `Variable` として正規化し、辞書に無くても表示が崩れないよう後方互換を追加。
- Data（`data/db_meta.json`）: `$EnumDef_GenderType` から `#Valiable` を削除し、`#Variable` に統合。
- UI（`pages/characters.js`）: typedef から `GenderType` の `schemaType` が取得できない経路でも、`$EnumDef` として辞書解決を試すフォールバックを追加（英語コード表示の取りこぼし対策）。
- UI（`pages/characters.js`）: デバッグON時に、詳細ビューDOM内に `GenderType` の生コードが残っている箇所を自動検出してコンソールへ出力（表示経路特定用）。

## 2026.03.04

### セキュリティアラート対応（CodeQL 指摘の修正）

- SW（`lib/sw-common.js`, `pages/sw.js`）: `works` / `db` パラメータを英数字+`_` のみ許可し、不正な入力は 400（Bad Request）として扱うように修正（パス注入/パストラバーサル対策）。
- SW（`lib/sw-common.js`）: `works/db` の不正入力や DB 不存在を 500 で落とさず、400/404 で返すようハンドリングを改善。
- UI（`pages/characters.js`, `pages/characters_final.js`）: `innerHTML` による動的文字列描画を廃止し、`textContent` と DOM 構築で表示（DOM XSS 対策）。
- UI共通（`lib/frontend-common.js`）: `DOMUtils.createElement()` で `innerHTML` を直接セットしないよう変更。

### トップページ導線（GitHub Pages / README）改善

- GitHub Pages: ルートに `index.html` を追加し、UI / API / ガイドラインへの入口を明確化。
- README（`README.md`）: トップ導線をデプロイ先 URL（`database.numbertales-radiann.net`）中心に整理。
- README（`README.md`）: 折りたたみ（`<details>`）内の Markdown 互換性向上のため `markdown="1"` を付与。

### `#Index` 型の段階導入（API 側: search/enrich）

- SW 共通（`lib/data-common.js`）: `EnrichmentProcessor.searchRecords()` が `hashTag:'#Index'` を解釈し、作品 typedef（`data/Works_*/DataBases/db_type.json.$IndexDef`）に基づいて実フィールドへ展開できるようにした。
  - スカラー（例: `key: 1`）だけでなく、ネスト index（例: `key: { Stoat: 'Major', Num: 0 }`）も AND 条件として展開して検索できる。
- 回帰修正（`lib/data-common.js`）: index 子要素が `#Number|#String` のような union の場合は数値比較を抑止し、`'0'` が `'000'` 等に誤一致して複数ヒットになるケースを回避。
- 回帰修正（`lib/data-common.js`）: 検索クエリで `key:null` を明示した場合は `val:null` を一致扱いにし、`#String|#Null` のような Null 許容サブキー（ネスト index）を含む検索が成立するようにした。
- 仕様整理（Breaking）（`lib/data-common.js`, `pages/characters.js`）: `$Index` 互換を削除し、`#Index` に統一。
- UI（`pages/characters.js`）: 一覧・詳細の `#Index` 表示（チップ/ピル/テーブル値）を直リンク（`idx/idxKey`）としてリンク化。
- Test（`tests/enrich.dblink.jump.merge.test.js`）: `#Index` 検索（スカラー/ネスト）の回帰テストを追加。
- Data（作品別 typedef）: 作品ごとの index ルートキー（例: `Num` / `Card` / `BeastType` / `Drc` / `Unit` / `Generation` / `Model`）を、各 `data/Works_*/DataBases/db_type.json($DefType)` に `"$type":"#Index"` として明示。
- Data（Breaking）: 作品ごとの index 定義（表示名/ネスト構造）は `data/Works_*/DataBases/db_type.json.$IndexDef` に集約し、`data/db_meta.json(CreationWorks.*.$DefType_Index / $Def_Index)` から削除。

### Enum/List 表示名解決の堅牢化（一覧の GenderType 回帰対策）

- UI（`pages/characters.js`）: `resolveVarsDefLabelPack()` が `#FemaleNeutral` のような「#付きコード」を受け取っても辞書（`$EnumDef_*` / `#List_*`）から JP/EN 表示名を解決できるようにし、一覧で英語コード表示へ退避する回帰を緩和。
- UI（`pages/characters.js`）: デバッグON時に、一覧の GenderType が生コードに退避した場合のみ最小ログを出力し、辞書欠損/値形式の切り分けを容易化。
- UI（`pages/characters.js`）: 一覧の GenderType チップ表示では `$display.langMode` を適用せず、既定の JP/EN 併記を優先（意図しない `langMode:'en'` 混入で英語コードのみになる回帰の暫定回避）。
- UI（`pages/characters.js`）: `schemaType:'$EnumDef|$EnumDef_withAbout'` を `$EnumDef_withAbout` の文字列一致で誤って enum 名扱いしないよう修正し、EnumDef の辞書解決がスキップされて raw（英語コード）に退避する問題を修正。

### フェーズ2: DB 種別多様化への耐性（メタ欠損フォールバック）

- SW 共通（`lib/sw-common.js`, `pages/sw.js`）: 作品別 `db_meta.json` の欠損/取得失敗時に、DB取得/検索/エンリッチが 500 で落ちないようにし、`_Commons` 適用のみスキップして継続。
- SW 共通（`lib/sw-common.js`）: メタが欠損している場合の DB 列挙フォールバック候補に `PrimaryDealer` / `PrimaryMobs` / `UnprocessedSecondary` を追加。
- SW 共通（`lib/sw-common.js`）: `db_meta.json.Databases.#DB_*._Secondaries[]` の `sec_Category` / `sec_DesignedBy` / `sec_SeriesTitle` による `_Commons` 分岐適用を調整。
  - `sec_SeriesTitle` が未指定の定義では、`sec_Category` 等の指定がある場合はレコード側でも必須一致として扱い、誤適用を防止。
- Test（`tests/sw.dbmeta.tolerance.test.js`）: `readWorkMeta()` 失敗時の耐性に関する回帰テストを追加。
- Test（`tests/commons.secondaries.test.js`）: `sec_Category` による `_Secondaries` 分岐（primary未指定時の必須一致）の回帰テストを追加。

### 開発支援（テスト/ドキュメント）

- Test（`tests/docs.lin
