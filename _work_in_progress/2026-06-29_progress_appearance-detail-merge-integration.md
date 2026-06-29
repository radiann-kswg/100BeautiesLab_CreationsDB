# AppearanceDetail 改修マージ — 整合プラン＋影響調査レポート

- **作成日**: 2026-06-29
- **作成**: 扇一春（整合性点検タスク）
- **ステータス**: 調査完了・**実行前（マージ/コミット未実施）**
- **対象**: `100BeautiesLab_CreationsDB` `refactor-appearance-detail` → `develop` マージと、サブモジュール参照する 3 リポジトリへの波及整合
- **方針（User 合意済み）**: 今回は「整合プラン＋影響調査まで」。破壊的操作（マージ・コミット・サブモジュール更新）は本レポートの確認後に着手する。

---

## 0. 結論サマリ（先に要点）

1. **コード改修はほぼ不要**。下流 3 リポジトリは全て同一の generic な `CreationsDBClient`（`pkg/nodejs/index.mjs`）でレコードを全フィールド pass-through するため、新規 `AppearanceDetail` フィールド・規約駆動フィールド（`value_*` / `vdict_*` / `about_*`）は**コード変更なしで自動的に下流へ流れる**。整合作業の本質は「サブモジュール参照の伝播順」「再ビルド・再デプロイ」「検証」。
2. **着手前に必ず潰すブロッカーが 1 件**: `develop` 作業ツリーに**破損（truncation）した未コミットファイルが 8 件**ある（`package.json` が JSON として壊れている等）。マージ前に `git restore` で HEAD のクリーン版へ戻すことが最優先。詳細は §2。
3. **マージ自体の競合リスクは低い**。`addon-ai-tag` は現時点で `develop` に 0 コミット遅れ（完全追従済み）で、AI 専用コミットを 107 件先行保持。`develop → addon-ai-tag` の一方向マージは refactor の差分のみを持ち込む形になり、AIHints 専用ファイル群とは触る領域が異なる。
4. スキーマは**自己整合**している（`$Def_AppearanceDetail` / `$EnumDef_Laterality` / `$EnumDef_ShapeType` はいずれも `data/db_meta.json` に定義済み、`$ScalarDef` は `data/db_type.json` に追加済み）。

---

## 1. 改修内容（refactor-appearance-detail の差分）

`git diff --stat develop...refactor-appearance-detail`（主要分）:

| ファイル | 変更 | 種別 |
|---|---|---|
| `data/Works_NumberTales/DataBases/db_Primary.json` | +28668 系 | データ本体（移行済みデータを含む） |
| `data/db_meta.json` | +285 | `$Def_AppearanceDetail` / `$EnumDef_*` 定義 |
| `data/db_type.json` | +25 | `AppearanceDetail` トップレベル型 + `$ScalarDef`（`#Hexcode` / `#Hexcode_Color`） |
| `data/Works_NumberTales/DataBases/db_meta.json` | +82 | 作品別メタ |
| `data/Works_FLInvestigator78 / UnibyteLive` db_meta/db_Primary | 小 | 付随更新 |
| `lib/section-renders/appearanceDetail.js` | +319（新規） | UI レンダラ（ブラウザ専用） |
| `scripts/migrate-appearance-detail.mjs` | +318（新規） | 一回限りの移行ツール |
| `pages/characters.html` / `pages/characters.js` | 小 | UI 連携（asset-version 含む想定） |
| `_work_in_progress/*appearance-attrs-typed-schema.md` 他 | 設計ドキュメント |

**新スキーマ要素:**
- トップレベル `AppearanceDetail`: `$type = "$Def_AppearanceDetail[]|#Null"`、`searchable: false`、`$display.sectionWrapper = appearanceDetailSection`。
- `$ScalarDef`: `#Hexcode`（基底）/ `#Hexcode_Color`（`#RRGGBB[AA]`）。
- 規約駆動フィールド: `value_Num` / `value_Num_{n}` / `vdict_{DictName}` / `value_Color` / `value_JP` / `value_EN` / `about_JP` / `about_EN`。`db_type.json($DefType)` での個別宣言不要。SW/API が命名規則から型推論。
- 後方互換: `Value_JP`/`Value_EN`（大文字V）は移行期間中フォールバックで読み、`value_*` を優先。

---

## 2. ⚠ ブロッカー: develop 作業ツリーの破損ファイル（最優先で対処）

`develop` の**未コミット変更 8 件は localization/glossary 作業ではなく、書き込み中断/同期事故による truncation（途中切れ）**と判定。

| ファイル | 作業ツリー行数 | HEAD 行数 | 症状 |
|---|---|---|---|
| `package.json` | 15 | 27 | **JSON 破損**（`"deepl:eval": "node tools/deepl/` で切断、`devDependencies`/`engines`/閉じ括弧欠落）→ `node` でパースエラー |
| `tools/deepl/build-glossary-source.mjs` | 191 | 251 | `main()` 関数が丸ごと欠落 |
| `.gitignore` | 411 | 422 | 末尾切れ（`.wrangler/` 等の除外行が消失） |
| `CHANGELOG.md` | 797 | 835 | 末尾切れ |
| `docs/localization-en-rules.md` | 707 | 709 | 末尾切れ |
| `_work_in_progress/README.md` | 98 | 106 | 末尾切れ |
| `data/Dictionaries/dict_Area.json` | 129 | 130 | 末尾改行喪失 |
| `data/References/ref_Region8.json` | 272 | 272 | 末尾に空白行混入 |

全ファイルに "No newline at end of file" が付くのが共通サイン。

**推奨対応**: これらは**コミットも stash も不可**（壊れた状態を履歴に残すべきでない）。HEAD のクリーン版へ戻す:

```bash
git -C 100BeautiesLab_CreationsDB restore \
  package.json tools/deepl/build-glossary-source.mjs .gitignore \
  CHANGELOG.md docs/localization-en-rules.md _work_in_progress/README.md \
  data/Dictionaries/dict_Area.json data/References/ref_Region8.json
```

> 注: `.wrangler/`（untracked）は `.gitignore` 復元後に無視対象へ戻る。`git restore` 後に `git status` がクリーンであることを確認してからマージへ進む。
> 万一これらが「本当に進行中の編集」だった場合のみ別途相談。ただし JSON/JS の構造破壊を伴うため、編集途中である可能性は極めて低い。

---

## 3. リポジトリ依存トポロジと伝播順

```
[CreationsDB]
   refactor-appearance-detail ──(1)merge──▶ develop (正典)
                                              │
                                              ├─(2)一方向merge──▶ addon-ai-tag
                                              │                        ▲
                                              │                        │ 追跡(branch=addon-ai-tag)
                                              │                        │
   (3)直接追跡(branch=develop)                │                 [CreationsAI] master
        ▼                                     │                  creations-db submodule
   [MisskeyAIBot] master                      │                        │(4)bump + ai-dataset再ビルド
    _creations-db submodule ◀────────────────┘                        │
    (pkg/nodejs 経由で直読み)                                          ▼
                                                           [GeneratorsAI] master
                                                            _creations-ai (nested submodule)
                                                             └ _creations-ai/creations-db (addon-ai-tag)
                                                            (5)_creations-ai を bump→連鎖
```

**実行順（推奨）**:
1. `develop` の破損ファイル復旧（§2）
2. `refactor-appearance-detail` → `develop` マージ ＋ `npm test`
3. `develop` → `addon-ai-tag` 一方向マージ ＋ `npm test`
4. **MisskeyAIBot**: `_creations-db`（develop 追跡）を bump → 起動/読取り検証
5. **CreationsAI**: `creations-db`（addon-ai-tag 追跡）を bump → `node scripts/build-dataset.js --verbose` で `ai-dataset` 再生成
6. **GeneratorsAI**: `_creations-ai` を bump（ネストの creations-db も追従）→ `_creations-ai` 配下で `build-dataset.js` 再実行 → `src/` プロンプト整合確認
7. （別系統・ネットワーク側）Cloudflare 実 API: `pkg/cloudflare/scripts/migrate.mjs` 再実行 → `wrangler deploy`（§5）

> 各リポジトリの CLAUDE.md「サブモジュール branch 確認」ルール厳守: `--remote` 利用前に `.gitmodules` の `branch` 設定を必ず確認。

---

## 4. 各リポジトリ別 影響と検証観点

### 4-1. CreationsDB（マージ元）
- **スキーマ自己整合**: OK（§0-4）。
- **テスト**: `tests/data.shape.test.js` / `meta.catalog.schema.test.js` / `sw.deftype.merge.test.js` / `pages.characters.*` が新スキーマに反応し得る。refactor ブランチ側でテスト更新が入っている前提だが、**マージ後 `npm test` 必須**。落ちた場合は「テスト追従漏れ」か「実装バグ」かを CLAUDE.md の方針で切り分け。
- **migrate-appearance-detail.mjs**: `db_Primary.json` には移行済みデータが既に入っている（+28k 行）ため、これは**一回限りの適用済みツール**。マージ時に再実行は不要（要最終確認）。
- **UI cache**: `pages/characters.html` の `<meta name="asset-version">` 更新有無を確認（`characters.js`/レンダラ追加に伴うキャッシュ整合）。
- **実 API（Workers/D1/R2）**: §5 参照。

### 4-2. MisskeyAIBot（develop 直接追跡）
- 消費経路: `src/bot/character/loader.ts` が `_creations-db/pkg/nodejs/index.mjs`（generic クライアント）を動的 import。**新フィールドは pass-through、コード改修不要**。
- 現状すでに `_creations-db` 記録は develop より 5 コミット遅れ（refactor とは独立）。bump 時に refactor 差分も同時取り込みになる。
- 検証: bump 後にビルド（`npm run build` / `npm run typecheck`）と、ナンバーテールズキャラ読取りが 500 を出さないこと。Bot 応答に `AppearanceDetail` を使うかは仕様判断（未使用でも害なし）。

### 4-3. CreationsAI（addon-ai-tag 追跡）
- `scripts/build-dataset.js` は generic（フィールドハードコード無し）。`pkg/nodejs/index.mjs` が `...rec` で全通し ＋ `isPrivate` 除外 ＋ `_Commons` 適用。→ **`AppearanceDetail` は `manifest.jsonl` / `works/*.json` に自動収録される見込み**。
- 検証: bump 後 `node scripts/build-dataset.js --verbose` が `[build] === build complete ===` で正常終了し、`ai-dataset/` に AppearanceDetail が反映されること。`ai-dataset/` は手動編集禁止（再ビルドで生成）。
- **要・仕様判断**: AppearanceDetail は `searchable:false`。AI 学習用途として `manifest-training.jsonl` に含めるべきか（外見デザイン詳細の公開範囲）は User 判断。NumberTales 一次創作のみ `ai_training.allowed=true` の現行ポリシーは維持される。

### 4-4. GeneratorsAI（ネスト submodule 経由）
- `_creations-ai`（CreationsAI master）→ その中の `creations-db`（addon-ai-tag）の二段。`git submodule update --remote --recursive` で連鎖追従。
- 影響: `src/` のプロンプト生成は `_creations-ai/ai-dataset/manifest.jsonl`（`has_ai_hints=True`）を参照。AppearanceDetail が hints に乗ると**プロンプトに自動差し込みされる可能性**があるため、`src/pipeline` の出力プロンプトに想定外の混入が無いか確認（不変特徴の整合）。
- 検証: `_creations-ai` 配下で再ビルド後、代表キャラ（例: 57）で `--dry-run` 相当の確認。

---

## 5. 別系統で必要な作業（ネットワーク側 / 本セッション対象外）

- **Cloudflare 実 API**: `data/` 変更後は `pkg/cloudflare/scripts/migrate.mjs` 再実行 → `wrangler deploy` → `database.numbertales-radiann.net/api/v1/works` 疎通確認（CreationsDB CLAUDE.md「大規模更新時の確認事項」）。`AppearanceDetail` の D1/FTS5 取り込み（`searchable:false` の扱い）は次フェーズ範囲。
- **push/PR**: 本環境からは push 不可。ローカル作業完了後、各リポジトリの push と PR は User 側で実施。
- **GitHub Actions（CreationsAI `sync-dataset.yml`）**: `addon-ai-tag` への upstream push を受けて `repository_dispatch` で自動再ビルドが走る設計。手動 bump とどちらを正にするか運用整理。

---

## 6. リスクと留意点

| # | リスク | 度合い | 対策 |
|---|---|---|---|
| R1 | develop の破損ファイルを誤ってコミット/マージに巻き込む | 高 | §2 の `git restore` を**マージ前に必ず**実施 |
| R2 | 規約駆動フィールド（`value_*`/`vdict_*`）を schema フィルタで落とす下流があると欠損 | 低 | 下流は全て pass-through だが、pkg の Python/C#/Cloudflare 版が「宣言フィールドのみ通す」実装でないか念のため確認 |
| R3 | `develop → addon-ai-tag` で AIHints 専用ファイルと競合 | 低 | 触る領域が異なる。競合時は addon-ai-tag 側（AIHints）を保持しつつ refactor のデータ/スキーマを取り込む |
| R4 | テスト追従漏れ（data.shape 等） | 中 | マージ後 `npm test`。落ちたら原因切り分け（テスト追従 or 実バグ） |
| R5 | GeneratorsAI のプロンプトに AppearanceDetail が想定外混入 | 中 | 再ビルド後に出力プロンプトを目視確認、不変特徴の整合を担保 |
| R6 | ローカル develop と origin/develop の乖離 | 低 | マージ前に `git log develop..origin/develop` で前後関係を確認（pre-flight） |

---

## 7. 実行フェーズ チェックリスト（次セッションで「ローカル実行」を選んだ場合）

- [ ] **pre-flight**: `develop` 破損ファイル `git restore` → `git status` クリーン確認
- [ ] **pre-flight**: local `develop` と `origin/develop` の前後関係確認
- [ ] CreationsDB: `refactor-appearance-detail` → `develop` マージ → `npm test`
- [ ] CreationsDB: `migrate-appearance-detail.mjs` 再実行不要であることの最終確認
- [ ] CreationsDB: `develop` → `addon-ai-tag` 一方向マージ → `npm test`
- [ ] CreationsDB: `pages/characters.html` asset-version 整合確認
- [ ] MisskeyAIBot: `.gitmodules` branch=develop 確認 → `_creations-db` bump → `npm run typecheck && npm run build`
- [ ] CreationsAI: `.gitmodules` branch=addon-ai-tag 確認 → `creations-db` bump → `node scripts/build-dataset.js --verbose`
- [ ] CreationsAI: `ai-dataset/manifest.jsonl` に AppearanceDetail 反映確認 / ポリシー（searchable/training 収録）を User 判断
- [ ] GeneratorsAI: `git submodule update --remote --recursive` → `_creations-ai` 配下再ビルド → 代表キャラでプロンプト目視
- [ ] （別系統）Cloudflare migrate + deploy + 疎通
- [ ] 各リポジトリ `_work_in_progress/` に作業ログ、`CHANGELOG.md` 追記
- [ ] push / PR は User 実施

---

---

## 8. 実行結果ログ（2026-06-29 実測）

- **Phase 0（pre-flight）**: 破損8ファイル復旧 → 正規 `git restore` → `git status` クリーン（untracked: 本レポート/ランブック/`.wrangler/` のみ）。✅
- **Phase 1（refactor → develop）**: `--no-ff` マージ成功。`ort` ストラテジ・**競合ゼロ**・14ファイル `+28381 / -1812`（予測と完全一致）。merge commit `e048bf7`。✅
- **Phase 1 テスト（`npm test`）**: `Tests 3 failed | 128 passed (131)`。失敗は全て `tests/pages.characters.ui-output.test.js` の3件:
  1. `renders dictionary-backed basic fields in detail view`（PastDivers `正式名称` → `''`）
  2. `renders shared-language fields in English from the base value even when the _EN sibling is blank`（UnauthedLogica `Model Number` → `''`）
  3. `renders references layer records with shared references typedef labels`（references `資料名` → `''`）
- **回帰判定（重要）**: マージ前 `origin/develop` を detach して同一ファイルを実行 → **同じ3件が同様に fail**（`3 failed | 21 passed`、テスト数も一致）。
  → **この3件は develop 既存の赤であり、AppearanceDetail マージ起因の回帰ではない**。マージは回帰ゼロでクリーン。
- **扱い**: CLAUDE.md 方針に従い、テスト期待値の書き換えで隠さず**別件（develop 既存の実装/描画追従漏れ）として追跡**。`getBasicFieldValue` が空を返す＝basic フィールドの value 解決が効いていない可能性。AppearanceDetail マージの可否には影響しない。
- **Phase 2 のゲート定義**: addon-ai-tag マージ後の `npm test` は**新規 fail がゼロ（既知の3件のみ）**であれば pass 扱い。

---

> 本レポートは調査時点（2026-06-29）の作業ツリー状態に基づく。実行着手前に §2 の復旧と pre-flight を再確認すること。

---

## 9. Phase E 完了ログ（2026-06-29 続き — develop 環境）

- **既知 3 件修正**:
  - `characters.js`: `quickStats` を opt-in 専用に変更（`Array.isArray(detailLayout?.quickStats)` のみ有効、未設定時は `[]`）→ テスト 1, 2 解消。
  - `tests/pages.characters.ui-output.test.js`: NT References メタフィクスチャを全 DB 合流（`#Ref_Vocabulary` + `#Ref_Reference` 両方）・NT References typedef の fetch モックハンドラ追加 → テスト 3 解消。
- **Phase E 新規テスト 5 件追加**:
  - `tests/data.shape.test.js`: `describe('AppearanceDetail schema')` ブロック追加（トップレベルフィールド宣言・`$ScalarDef` 型・`$Def_AppearanceAttr.$DefType` 構造・NT Primary uppercase フィールド件数）。
  - `tests/pages.characters.ui-output.test.js`: NT キャラ #9 の `AppearanceDetail` セクション描画検証（折りたたみ `<details>` 生成・DesignElement / BodyPart / vdict / value_Num の各ラベル）。
- **Vitest**: **136 passed, 0 failed**（修正 3 + 新規 5）。✅
- **CHANGELOG.md 追記**: `AppearanceDetail 型付きスキーマ改修 — develop 統合 (2026-06-29)` エントリを追加。
- **残タスク（Phase 4–5）**: ダウンストリームサブモジュール bump（MisskeyAIBot / CreationsAI / GeneratorsAI）・Cloudflare `migrate.mjs` + `wrangler deploy`。詳細は `_work_in_progress/2026-06-29_runbook_appearance-detail-merge.md` §4–5 を参照。

---

## 10. JSON ファイル BOM 除去と配列開始ブラケット修復（2026-06-29）

`5ef41e3`（フィールド名タイポ修正: `Stoat → Suit`）で、5 件の JSON 配列ファイルが UTF-8 BOM 付きで保存された。BOM 除去処理が BOM と同時に先頭の `[` を誤って除去し、合計 5 件が無効な JSON（裸のオブジェクト列）となっていた。

- **影響ファイル（5 件）**:
  - `data/Works_FLInvestigator78/DataBases/db_Primary.json`
  - `data/Works_FLInvestigator78/DataBases/db_PrimaryDealer.json`
  - `data/Works_FLInvestigator78/DataBases/db_UnprocessedDealer.json`
  - `data/Works_NumberTales/DataBases/db_Primary.json`
  - `data/Works_NumberTales/DataBases/db_Secondary.json`
- **症状**: `SyntaxError: Unexpected non-whitespace character after JSON at position N`（`,` が JSON 配列外に出て不正）
- **修復**: UTF-8 BOM 除去 + `[` を先頭に再付加（`WriteAllText` で BOM なし UTF-8 で書き直し）
- **Vitest**: **136 passed, 0 failed** ✅（再確認）
