# 進捗レポート: `addon-ai-tag` マージ事故（逆マージ+revert 巻き込み）の復旧 (2026-07-01)

## 目的

- サブローカル環境（本ドキュメント記載の作業ディレクトリ）で `develop` → `addon-ai-tag` の通常マージ（`git merge develop`, `MERGE_HEAD=04c7785`）を実行したところ、AIHints 機能一式が丸ごと削除されそうになった事故を調査・復旧する。

## 背景・原因

- `b0c539c`（`Merge branch 'addon-ai-tag' into develop`）で、本来禁止のはずの **`addon-ai-tag` → `develop` への逆マージ**が実行されてしまっていた（ブランチ運用方針違反）。
- `develop` 側で `f9a3ebe`（`Revert "Merge branch 'addon-ai-tag' into develop"`）により、その逆マージを打ち消す revert が行われた。この revert は develop にとっては正しい対処だが、**`b0c539c` が持ち込んだ差分をまるごと打ち消す**ため、「AIHints 関連の全ファイル・全フィールドの削除」という形で `develop` の履歴に残った。
- その後 `develop` はさらに進み（`04c7785 DB情報追加中止(ナンバーテールズ)` 等）、通常運用どおり `develop → addon-ai-tag` の取り込みマージを実行したところ、**revert が持つ「AIHints 削除」差分がそのまま `addon-ai-tag` 側に伝播**し、コンフリクトの有無に関わらず AIHints 機能一式を本拠地の `addon-ai-tag` から消してしまう状態になっていた。

## 影響範囲（確認・復旧したファイル）

### コンフリクト（`<<<<<<<`/`=======`/`>>>>>>>`）として検出され、ours（`addon-ai-tag`側）を採用したもの

- `_work_in_progress/2026-06-09_progress_aihints-from-identitymotif.md`（deleted by them → 復元）
- `_work_in_progress/2026-06-09_progress_corefolder-nld-template-and-silhouette-structure.md`（deleted by them → 復元）
- `docs/ai-hints-usage.md`（deleted by them → 復元）
- `tools/patch-aihints.mjs`（deleted by them → 復元）
- `data/Works_NumberTales/DataBases/db_Primary.json`（92 件のコンフリクト。全件「ours 側のみ `AIHints` フィールドが存在し、develop 側は空」というパターンで一致。全件 ours を採用）
- `_work_in_progress/README.md`（2 箇所の明示コンフリクト＋非コンフリクト領域にも同種の巻き込みを検出したため、最終的にファイル全体を ours へ復元）

### クリーンにマージされてしまっていた（コンフリクト無しで AIHints 関連が消えていた）ため、ours へ復元したもの

- `.github/copilot-instructions.md`（`AI_Optout` 節・AIHints corefolder 運用ルール 4 項目）
- `.github/workflows/cf-api-sync.yml`（`addon-ai-tag` トリガー・AIHints D1 同期ステップ）
- `.github/prompts/aihints-fill.prompt.md`（削除されていた）
- `CHANGELOG.md`（AIHints/addon-ai-tag 関連の過去 253 行の履歴ブロックが削除されていた）
- `docs/aihints-spec.md`（削除されていた）
- `docs/api-sw-spec.md`（§5.5 `AI_Optout` 節、`/api/ai/` エンドポイント表記）
- `docs/deploy-howto.md`（§7 AIHints D1 投入手順）
- `pkg/cloudflare/README.md`（`addon-ai-tag` 専用手順の大半）
- `pkg/cloudflare/wrangler.toml`（Worker 名 `creationsdb-api-ai` / ルート `/api/ai/*`）
- `pkg/cloudflare/worker.js`（AIHints D1 クエリ関数・Bearer 認証・`/api/ai/*` エンドポイント一式）
- `pkg/cloudflare/schema/d1-aihints.sql`（削除されていた）
- `pkg/cloudflare/scripts/migrate-aihints.mjs`（削除されていた）
- `tests/aihints.schema.test.js`（削除されていた）
- `data/db_type.json`（グローバル `AIHints` フィールド宣言）
- `data/Works_NumberTales/DataBases/db_type.json`（`$Def_AIColorPalette` / `$Def_AIReferenceImages` / `$Def_AIHintsCommon` 等 AIHints typedef 一式、約280行）
- `data/Works_NumberTales/DataBases/db_meta.json` / `References/db_meta.json`、および他 8 作品の `db_meta.json`（全 DB/Ref エントリの `AI_Optout` フラグ）
- `_work_in_progress/2026-06-21_progress_addon-ai-tag-api-separation.md`、`_work_in_progress/2026-07-01_progress_addon-ai-tag-merge-conflict-and-log-cleanup.md`、`_work_in_progress/20260619_progress_db-images-phase2.md`、`all_images_list.txt`（`addon-ai-tag` 由来のログ・作業ファイルで削除されていた）

### develop 側の正当な変更として、そのまま受け入れたもの

- `data/Works_NumberTales/DataBases/db_Primary.json` の `arts_metadata` / `designAlt_metadata` サブフィールド削除（`04c7785 DB情報追加中止(ナンバーテールズ)` によるもの。AIHints とは無関係の develop 側の意思決定と判断）。
- `_work_in_progress/2026-06-28_progress_conversationpattern-handoff.md`、`_work_in_progress/2026-07-01_progress_conversationpattern-refine.md` の削除（`develop` の `dc93d09` 以前から存在するファイルで、`develop` 側の正当な完了整理と判断。`README.md` 側でも「完了」セクション記載と整合）。

## 検証

- 全ファイルについて、`git diff <merge-base> <develop側コミット>` と `git diff <merge-base> HEAD` を突き合わせ、「develop 側の差分が AIHints/addon-ai-tag 専有コンテンツの削除のみで構成されているか」を個別に確認した（誤って develop の正当な更新を握りつぶしていないことを確認済み）。
- `data/Works_NumberTales/DataBases/db_Primary.json` の JSON 構文を `node -e "JSON.parse(...)"` で確認 → 正常。
- `npm test` 実行 → 21 ファイル / 147 件 全 pass。

## 未完了タスク

- マージコミットの作成・push は **User 判断待ち**（本レポート作成時点では未実施）。
- 今回のような事故の再発防止として、`addon-ai-tag → develop` 方向のマージを誤操作しないための CI/hook 等のガード導入は未検討（必要であれば別途検討）。

## 参考

- `_work_in_progress/2026-07-01_progress_addon-ai-tag-merge-conflict-and-log-cleanup.md`（別件・より前の `develop→addon-ai-tag` マージ時のコンフリクト解消ログ。今回の事故とは別事象）
- ブランチ運用方針: `CLAUDE.md` §「ブランチ運用方針」
