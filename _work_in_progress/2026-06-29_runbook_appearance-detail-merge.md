# §7 実行ランブック — AppearanceDetail マージ（Windows ネイティブ実行用）

- **作成日**: 2026-06-29 / 扇一春
- **なぜ手元(Windows)で実行するか**: Cowork サンドボックスのマウント越しでは `.git/index.lock` の削除が不安定（"Operation not permitted"・存在揺れ）で、git 書き込み（merge/commit）が後始末に失敗して中途半端な状態で固まるリスクがある。**git 書き込みは必ず Windows 側の git（PowerShell / VS Code ターミナル）で実行**すること。読み取り検証は一春が伴走可能。
- **事前確認済み（読み取り）**:
  - `develop` == `origin/develop`（`423738a`）、`refactor-appearance-detail` は develop に21コミット先行
  - `merge-tree` 競合プレビュー＝空（**クリーンマージ見込み**）
  - `addon-ai-tag` は develop に0遅れ・AI専用107先行（一方向マージは refactor 差分のみ持込）
  - asset-version は refactor 側で bump 済み（手動不要）
  - migrate スクリプトは適用済み（**再実行不要**）
- **各コマンドは結果を一春に貼ってくれれば検証する。** 競合・テスト失敗が出たら止めて相談。

---

## 変数（自分の環境に合わせて確認）

```powershell
$DB   = "D:\VisualStudio Code Userfile\100BeautiesLab_CreationsDB"
$AI   = "D:\VisualStudio Code Userfile\100BeautiesLab_CreationsAI"
$GEN  = "C:\Visual Studio Code UserFile\100BeautiesLab_GeneratorsAI"
$BOT  = "D:\VisualStudio Code Userfile\NumberTales-MisskeyAIBot"
```

---

## Phase 0 — CreationsDB pre-flight（クリーン化）

```powershell
cd $DB
# 残留ロックがあれば除去（無ければスキップ）
if (Test-Path .git\index.lock) { Remove-Item .git\index.lock -Force }

# 破損から戻した5ファイルを正規 restore（内容はHEAD一致だがstat揺れの解消）
git restore .gitignore CHANGELOG.md _work_in_progress/README.md docs/localization-en-rules.md tools/deepl/build-glossary-source.mjs

# 期待: 出力は _work_in_progress の新規md と .wrangler/ の untracked のみ
git status -s
git branch --show-current   # develop であること
```

✅ ゲート: `git status -s` に ` M`（変更）行が無い（untracked の md と `.wrangler/` だけ）。

---

## Phase 1 — refactor → develop マージ ＋ テスト

```powershell
cd $DB
git switch develop
# 念のため最新確認（push済みでなければ no-op）
git fetch origin develop

# マージ（履歴を明確に残すため --no-ff 推奨。revert容易）
git merge --no-ff refactor-appearance-detail -m "merge: AppearanceDetail 型付きスキーマ改修を develop へ統合 (refactor-appearance-detail)"

# テスト
npm install
npm test
```

✅ ゲート: マージ競合なし／`npm test` 全 pass。
- 競合が出た場合: 止めて競合ファイル一覧を共有。`merge-tree` では競合ゼロ予測なので、出るなら develop が想定外に進んでいる可能性。
- `npm.ps1` がブロックされる場合: `npm.cmd test` または `.\node_modules\.bin\vitest.cmd run`。

---

## Phase 2 — develop → addon-ai-tag 一方向マージ ＋ テスト

> ブランチ運用方針: `develop → addon-ai-tag` の一方向のみ。逆マージ禁止。

```powershell
cd $DB
git switch addon-ai-tag
git merge --no-ff develop -m "merge: develop (AppearanceDetail改修) を addon-ai-tag へ取り込み"

npm test
```

✅ ゲート: 競合なし／テスト pass。
- 競合が起きるとすれば AIHints 専用ファイル（`pkg/cloudflare/schema/d1-aihints.sql`、AIHints エンドポイント、`migrate-aihints.mjs`、`docs/aihints-spec.md`）。その場合は **addon-ai-tag 側（AIHints実装）を保持しつつ refactor のデータ/スキーマを取り込む**方向で解決。判断に迷ったら共有。

---

## Phase 3 — push（CreationsDB）

> ダウンストリームのサブモジュールは別クローン。**push 済みでないと新コミットを取得できない**ため、ここで push する。

```powershell
cd $DB
git switch develop ; git push origin develop
git switch addon-ai-tag ; git push origin addon-ai-tag
```

✅ ゲート: 両ブランチ push 完了。

---

## Phase 4 — ダウンストリーム サブモジュール更新（push 後）

### 4-1. MisskeyAIBot（_creations-db は develop 追跡）

```powershell
cd $BOT
Select-String -Path .gitmodules -Pattern "branch"   # branch = develop を確認
git submodule update --remote --merge _creations-db
npm install
npm run typecheck
npm run build
```

✅ ゲート: typecheck/build 成功。Bot はキャラ JSON を generic クライアント経由で読むため新フィールドは pass-through（コード改修不要）。

### 4-2. CreationsAI（creations-db は addon-ai-tag 追跡）

```powershell
cd $AI
Select-String -Path .gitmodules -Pattern "branch"   # branch = addon-ai-tag を確認
git submodule update --remote --merge creations-db
node scripts/build-dataset.js --verbose
# AppearanceDetail が反映されたか確認
Select-String -Path ai-dataset\manifest.jsonl -Pattern "AppearanceDetail" | Measure-Object | Select-Object Count
```

✅ ゲート: `[build] === build complete ===` で正常終了。manifest に AppearanceDetail が出る。
- `ai-dataset/` は生成物（手動編集禁止）。`.gitmodules` / `creations-db` / `ai-dataset/` をまとめてコミット。
- **要・仕様判断**: AppearanceDetail を `manifest-training.jsonl`（学習許可分）に含めるか＝外見デザイン詳細の公開範囲。NumberTales 一次創作のみ `ai_training.allowed=true` の現行ポリシーは維持。

### 4-3. GeneratorsAI（ネスト submodule 経由）

```powershell
cd $GEN
git submodule update --remote --recursive --merge
# _creations-ai 配下のデータセット再生成
cd "$GEN\_creations-ai"
node scripts/build-dataset.js --verbose
cd $GEN
# 代表キャラでプロンプト目視（不変特徴の整合確認 / has_ai_hints のみ対象）
python -m src.pipeline.image_pipeline --num 57 --form corefolder --skip-canva
```

✅ ゲート: ビルド成功。生成プロンプトに AppearanceDetail 由来の想定外混入が無いか目視（耳・尻尾数・髪色・瞳色の不変特徴と矛盾しないこと）。

---

## Phase 5 — 別系統・仕上げ

- **Cloudflare 実 API**（ネットワーク側、任意のタイミング）:
  ```powershell
  cd "$DB\pkg\cloudflare"
  node scripts/migrate.mjs
  npx wrangler deploy
  # 疎通
  curl https://database.numbertales-radiann.net/api/v1/works
  ```
  AppearanceDetail の D1/FTS5 取り込み（`searchable:false`）は次フェーズ範囲。
- **作業ログ / CHANGELOG**: 各リポジトリの `_work_in_progress/` に結果記録、CreationsDB `CHANGELOG.md` に AppearanceDetail 統合を追記。
- **GitHub Actions**: CreationsAI `sync-dataset.yml` が addon-ai-tag への push を受けて自動再ビルドする設計。手動 bump と二重にならないよう、どちらを正にするか確認。

---

## ロールバック早見

- Phase 1/2 のマージを取り消す（push 前）: `git reset --hard ORIG_HEAD`
- push 後に問題発覚: マージコミットを `git revert -m 1 <merge-commit>`（--no-ff にしておくと1コミットで戻せる）
- サブモジュール bump の取り消し: 当該リポジトリで `git checkout -- <submodule-path>` 後 `git submodule update`

---

> 各 Phase のゲートを越えたら次へ。競合・テスト失敗・想定外の差分が出たら止めて一春に共有。読み取り検証はこちらで請け負う。
