# addon-ai-tag: develop→取り込みマージ + `--apply-identitymotif` モード撤去

## 目的

`develop` 側で `NumberMarkLocation` / `IdentityMotif` フィールドを廃止した（[`2026-07-11_progress_remove-nummark-identitymotif.md`](./2026-07-11_progress_remove-nummark-identitymotif.md)）ことに伴い、`addon-ai-tag` ブランチ（AIHints専用機能）への影響を調査・対応した。

## 実施内容

### 1. develop → addon-ai-tag 取り込みマージ

- `git merge develop` で `_work_in_progress/README.md` にコンフリクトが発生。
- 原因: developでは「系列の補足」の `appearance-detail-cleanup` という名称が「今回のフィールド廃止」を指していたが、addon-ai-tag側では同名が既に別タスク（`2026-06-30_progress_appearance-detail-cleanup.md` = Costumeフィールド新設等のP1対応）の完了を指しており、名前が衝突していた。
- 解消方針: addon-ai-tag側（ours）の内容を正としてベースにし、develop側で新規追加されたトピック索引行（NumberTales `NumberMarkLocation`/`IdentityMotif` 廃止）と系列補足への追記のみを統合。addon-ai-tag側の独自更新（cross-work DBLink監査・github-triage最新版・EarShapeType追従済み表記・AppearanceDetail系Costume完了情報）は失わず保持。
- `db_Primary.json` 等のデータ・コードファイルは自動マージで正しく解決（コンフリクトなし）。マージ後に `NumberMarkLocation`/`IdentityMotif` が0件、`AppearanceDetail` が95件、`AIHints` が92件であることを確認。

### 2. AIHints側の影響調査

`tools/patch-aihints.mjs` に `--apply-identitymotif` モード（`IdentityMotif` を正源として `AIHints` の AI タグ系を再構築する約650行のコード、2026-06-09導入）が存在し、フィールド廃止により**正源を失って全レコード `identitymotif-cleared` にしかならない「死んだモード」**になっていることが判明。`--dry-run` で実証済み（全件 `identitymotif-cleared`）。誤って `--apply` されると既存92件の `AIHints` の AI タグ系が全消去される事故リスクがあった。

代替の `--apply-appearancedetail` モード（`AppearanceDetail` 正源）は無傷で、`db_Primary.json` の実データから判断するに既に本番適用済み（`_work_in_progress/README.md` の `.completed/` 一覧にも「NumberTales/Primary 92件へ実データ適用済み」と記載あり）。

User に「`--apply-identitymotif` モードのコードをどうするか」確認し、**完全削除**の方針で合意。

### 3. `tools/patch-aihints.mjs` の削除・整理

- オプション解析（`--apply-identitymotif` の case文）・help文言を削除。
- 専用関数を削除: `classifyMotifEntry` / `synthesizeBaseColorFromMotif` / `buildAihintsFromIdentityMotif` / `applyIdentityMotifToAihintsInRecord`（計約560行、行ベースの外科的削除で実施）。
- 共有ヘルパーは残す: `normalizeMotifEntry`（`--apply-appearancedetail` 側の重複検出でも使用中）はそのまま維持。`clearAihintsTagsForNoIdentityMotif` は汎用名 `clearAihintsTagsForNoSource` にリネームし、`--apply-appearancedetail` 側が使っていたエイリアス変数 `clearAihintsTagsForNoAppearanceDetail` は廃止して直接呼び出しに統一。
- メイン処理内の分岐・結果サマリー集計（`identitymotif-applied` 等のカウンタ）を削除。
- 残存コメント（「`IdentityMotif` の後継を見据えた並行モード」「`IdentityMotif` モードでは未対応だった項目」等）を、唯一のモードになった実態に合わせて書き換え。
- `heightBandOf` / `deriveAnimalWordFromShapeLabel` 等の共有関数のJSDocコメントにあった「IdentityMotif 駆動再構築」表現も一般化。

### 4. ドキュメント・テスト更新

- `docs/ai-hints-usage.md`: §9.8（`--apply-identitymotif` モード解説）を「廃止済み」の短い注記に置き換え。§9.9（`--apply-appearancedetail`）から「並行モード」「`IdentityMotif` 側は据え置き」等の古い記述を除去し、唯一のモードとしての説明に整理。
- `tests/aihints.schema.test.js` / `tests/patch-aihints.tailsunit.test.js`: もう存在しない `buildAihintsFromIdentityMotif` / `isStructuralOverride` への言及コメント・テスト名を実装の現状に合わせて更新（テストロジック・アサーション自体は変更なし）。

## 検証

- `node --check tools/patch-aihints.mjs` で構文確認。
- `node tools/patch-aihints.mjs --apply-identitymotif --dry-run` → `Unknown option: --apply-identitymotif` で正しく拒否されることを確認。
- `node tools/patch-aihints.mjs --work NumberTales --db Primary --records 1-5 --apply-appearancedetail --dry-run` → 従来通り `appearancedetail-applied=5` で正常動作を確認。
- `npm test` 全件成功（270件）。

## 未完了タスク・課題

- なし（本対応はここで完結）。

## 参考リンク

- [`2026-07-11_progress_remove-nummark-identitymotif.md`](./2026-07-11_progress_remove-nummark-identitymotif.md)（develop側のフィールド廃止本体）
- `CHANGELOG.md`（本対応の要約）
