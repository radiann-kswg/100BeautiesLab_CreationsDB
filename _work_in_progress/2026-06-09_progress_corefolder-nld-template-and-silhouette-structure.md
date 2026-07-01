# 2026-06-09 progress: corefolder NLD のテンプレ化 + silhouette_notes の object 構造化

## 目的

NumberTales/DB_Primary の AIHints corefolder 形態について、以下 3 点を解消する:

1. `corefolder.natural_language_description` に「humanoid 衣装語（coat / dress / bodysuit / pants / shoes など）」が混入し、球体本体素体としての記述から逸脱しているレコードがある。
2. `silhouette_notes` が flat array で「素体記述」と「装着付属品記述」が同列に混在しており、後段の vision-fill / prompt 生成で区別がつきにくい。
3. 個別不具合: `#42` は behavior 描写が NLD に流出、`#57` は「番号 '57' が髪束の上に書かれている」と誤記述（実画像では本体表面の黄色エリアに縦書き）。

## 変更点の要約

### スキーマ

- `data/Works_NumberTales/DataBases/db_type.json`:
  - `$Def_AIFormVariant.silhouette_notes` を `#String[]` → `$Def_AISilhouetteNotes|#Null` に変更。
  - `$Def_AISilhouetteNotes` typedef を追加（`body_description: #String[]|#Null` / `attached_items: #String[]|#Null`）。

### ツール (`tools/patch-aihints.mjs`)

- 新モード `--migrate-silhouette-structure`: flat array → object 形式の移行。装着具語キーワードで自動分割。schema 宣言順にキー再整列。
- 新モード `--rewrite-corefolder-nld` (+ `--force-rewrite-nld`): corefolder NLD をテンプレート `"Corefolder form: a spherical cushion-like body in {color}, with the number '{N}' {marking placement}; {accessory}."` で再生成。
- `buildDefaultSilhouetteNotes(num, formKey)` 新設。`COREFOLDER_DEFAULT_SILHOUETTE_NOTES` 定数を削除。
- `extractBaseColor()`: 4 パターン（"X base coloring" / "X fox with" / "X fox" / "X palette/coloring"）で `body_description` → `attached_items` 順にフォールバック。
- `extractMarkingInfo()`: 番号刻印記述から `{kind: 'normal'|'none', phrase}` を抽出。`SUBJECT_RE` で number/marking/Roman-numeral/kanji/katakana/hiragana を識別、`normalizeVerbs` で is rendered/printed/drawn/written/marked/displayed/shown/formatted/inscribed/embroidered/split/placed/positioned/located/stamped/engraved/etched を bare verb 化、`trimTail` で `single fixed slot` 等の末尾を除去。「番号刻印なし」と明示されたレコードは `no number identifier printed on the body` を返す。
- `extractAccessoryPhrase()`: `attached_items` の先頭 non-TODO エントリから装着具フレーズを抽出。
- `shouldRewriteCorefolderNld()`: 空 / `[TRANSLATE:` / 旧 scaffold (`A corefolder form character featuring`) / `TODO:` / humanoid 衣装語混入 / `Corefolder form:` 見出しなし、を検出して強制再生成対象に判定。
- `detectVisualTodos()` / `applyVisionResultsToAihints()`: 両形式（legacy array / new object）に対応。`vr.corefolderBodyDescription` / `vr.corefolderAttachedItems` / `vr.humanoidBodyDescription` / `vr.humanoidAttachedItems` を新規キーとして受理（旧 `corefolderSilhouetteNotes` / `humanoidSilhouetteNotes` は `body_description` 側へ追記する下位互換）。

### データ (`data/Works_NumberTales/DataBases/db_Primary.json`)

- 89 レコードを silhouette_notes object 形式へ移行。
- 82 レコードの corefolder NLD をテンプレで再生成。
- `#57` の `immutable_traits` を手動修正: "written vertically on the side-pony hair bundle (on the yellow side of the sphere body, mid-height area)" → "on the yellow surface area near the head, written vertically"。
- `#67` / `#70` は `forms.corefolder = null` のため silhouette migration / NLD 再生成ともに skip。
- `#28` は元データに base color 情報が無いため `TODO: fill base color` を保持（正当な TODO）。
- `#61` は `outfit-dependent locations` 等の corefolder 衣装バリアント記述が含まれるが、`outfit` は除外語に含めないため再生成対象にならない（正常動作）。

### テスト (`tests/aihints.schema.test.js`)

- corefolder / humanoid 両形態の silhouette_notes アサーションを object 形式へ更新。
  - `silhouette_notes` は object（非 array）であることを assert。
  - `body_description` は配列かつ最低 1 件、`attached_items` は配列であれば空も許容。
  - `immutable_constraints` / `negative_keywords` は引き続き非空 array を assert。
- 新規ケース: corefolder NLD が `Corefolder form: a spherical cushion-like body in` で始まり、humanoid 衣装語（`hoodie|blazer|coat|jacket|dress|bodysuit|pants|shorts|skirt|trousers|shoes|boots|socks|sneakers|loafers|stockings|leggings`）を含まないことを検査。
- 結果: 11/11 pass。

### ドキュメント

- `docs/ai-hints-usage.md`:
  - §4 `silhouette_notes` 行を object 形式の説明へ書き換え。
  - 新節 §9.6 `--migrate-silhouette-structure` モード（分割ヒューリスティクス / コマンド / 冪等性）。
  - 新節 §9.7 `--rewrite-corefolder-nld` モード（テンプレ / 再生成条件 / 適用順）。
- `CHANGELOG.md` 先頭にエントリ追加。
- `.github/copilot-instructions.md` の「最近の実装運用ルール」に `silhouette_notes` object 形式と corefolder NLD テンプレの方針を追記。

## 影響範囲

- 編集ファイル:
  - `data/Works_NumberTales/DataBases/db_type.json`
  - `data/Works_NumberTales/DataBases/db_Primary.json`（89 件 silhouette migration + 82 件 NLD 再生成 + #57 手動修正）
  - `tools/patch-aihints.mjs`
  - `tests/aihints.schema.test.js`
  - `docs/ai-hints-usage.md`
  - `CHANGELOG.md`
  - `.github/copilot-instructions.md`
- 他作品 / 他 DB: `AI_Optout: true` により対象外（変更なし）。
- 他テスト: 既存 6 件失敗は本変更前から残る無関係な失敗（commons.secondaries / data.shape / enrich.dblink.jump.merge / pages.characters.ui-output）。

## 未完了タスク

- 残 TODO の手動穴埋め: `#28` の base color、および各キャラ固有スロット（特定キャラだけが持つ NG / ハーネス形状 / 個別禁止要素）は User 手動入力の対象として継続。
- 他作品（FLInvestigator78 / ShouArRiders 等）への corefolder 概念の有無確認・適用は本セッション対象外。
- `--rewrite-corefolder-nld` の humanoid 版 (`--rewrite-humanoid-nld`) は未実装。必要になった時点で対応。

## 検証

- `npm.cmd test tests/aihints.schema.test.js`: 11/11 pass。
- スポットチェック: `#1` / `#3` / `#15`（ローマ数字 XV）/ `#16` / `#28`（正当な base color TODO）/ `#30` / `#42` / `#55`（分割表記）/ `#57`（位置修正反映）/ `#58`（no marking 表現）/ `#61`（outfit-dependent 維持）/ `#75` / `#99`（漢字）/ `#2-alt` / `#10-alt` / `#000` の NLD を目視確認。

## 参考リンク

- `docs/ai-hints-usage.md` §4 / §9.6 / §9.7
- `tools/patch-aihints.mjs` (新規ヘルパー: `buildDefaultSilhouetteNotes` / `extractBaseColor` / `extractMarkingInfo` / `extractAccessoryPhrase` / `buildCorefolderNldFromTemplate` / `shouldRewriteCorefolderNld` / `migrateSilhouetteStructureInRecord` / `rewriteCorefolderNldInRecord`)
- `_work_in_progress/2026-06-08_progress_aihints-corefolder-vision-fill.md`（前段の vision-fill バッチ）
- `_work_in_progress/2026-06-08_progress_aihints-remove-harness-contamination.md`（structural default からハーネスを外す方針の根拠）
