# GitHub 未解決問題トリアージ（2026-07-22）

自動スケジュールタスクによる調査ログ。コード変更・commit・push・GitHub書き込み系操作は一切行っていません（読み取りと調査のみ）。

## 目的

Gmail通知（GitHub notifications）と GitHub API（読み取り専用）を突き合わせ、本リポジトリで未解決とみられる項目を洗い出し、修正方針を提案する。

## 対象範囲

- Gmail検索: `from:notifications@github.com` 直近14日分
- GitHub確認: `list_issues` / `list_pull_requests` / `list_commits`（読み取りのみ）
- ローカル: `develop` ブランチをチェックアウト中の作業ツリー、および `git show addon-ai-tag:...` によるブランチ内容の読み取り（チェックアウト切替は行っていません）

---

## 1. Issue #13（未解決・OPEN）

**タイトル**: キャラ別「数秘解説」「スキンシップ反応」フィールドの追加（Bot F-06/F-15 連携）
**起票**: 2026-07-21 02:09 / **状態確認**: GitHub API `list_issues` で OPEN を実測確認（2026-07-22時点）

### 内容

NumberTales-MisskeyAIBot 側の F-06（数秘解説）・F-15 Phase 3（スキンシップ反応）実装のため、本DBに新フィールド2件（`NumerologyExamples` / `SkinshipReactions` 相当）を追加してほしいという依頼。Bot側はフィールド未存在でもフォールバックする設計のため、緊急度は高くない。

### 提案

- 命名・配置は Issue 本文が「DB側の規約にお任せ」としている。既存の `DialogueExamples`（`ConversationPattern` 配下、`value_JP`/`about_JP` を持つリスト型）と同型にするのが `$DefType` スキーマ駆動方針と整合的。
- 追加時は `docs/schema-meta-processing.md` の `$slot` マーカー運用に従い、対象作品（NumberTales Primary/SemiPrimary released個体）に段階導入する。
- 内容（監修済み台詞）は User 手動入力が前提のため、本タスクでは**フィールド定義の追加提案のみ**にとどめ、実データの生成は行わない（ロールプレイ制約：未公開創作内容の自動生成禁止）。
- 対応不要ではなく **対応待ち（要User判断）**。次回作業時に `db_type.json($DefType)` へのフィールド追加を検討してください。

---

## 2. CI失敗: Cloudflare API 自動更新（develop, 42c7140 / 2026-07-13）→ 対応不要（既知の一過性）

`R2/D1 データ同期` ジョブのみ失敗（6分6秒で失敗。他2ジョブ`変更ファイル検出`/`Worker デプロイ`は成功）。

### 調査結果

- ワークフロー (`cf-api-sync.yml`) 自身のコメントに「develop / addon-ai-tag が近接pushすると同一D1への import が競合し `Currently processing a long-running import` エラーで失敗する」既知事象の記載があり、対策として `concurrency: group: cf-api-sync-d1-creationsdb`（キューイング、cancel-in-progress: false）が既に導入済み。
- 2026-07-13以降、同ワークフローの失敗通知は確認されず（07-16のAIHints失敗とは別ジョブ）。再発なし。

**結論**: 既知の一過性競合であり、既に緩和策（concurrency直列化）が入っている。コード変更提案なし。再発が続く場合は `wrangler d1 execute` 側のタイムアウト延長を検討。

---

## 3. CI失敗: AIHints 構造的再同期（addon-ai-tag, 7fb4d43 / 2026-07-16, Attempt#1・#2とも失敗）→ 要調査・修正提案あり

### 調査結果（`git show addon-ai-tag:.github/workflows/aihints-structural-resync.yml` を読み取り専用で確認）

ジョブは以下の順で実行：
1. `data/Works_*/DataBases/db_*.json` から `"AIHints"` キーを grep で持つDBを列挙（対象DB決定）
2. 各対象DBに対し `node tools/patch-aihints.mjs --work ... --db ... --all --resync-structural --apply` を実行
3. 整形 → 差分判定 → テスト → PR作成

ワークフロー自身のコメントに重要な記述あり:
> 「`AI_Optout: true` の DB は `patch-aihints.mjs` 側のガードが exit 2 で拒否する（`_Secondaries` のカテゴリ単位 opt-out は DB全体を止めず、該当レコードのみ `skipped-ai-optout` になるため、ここでの列挙には影響しない）」

つまり、**DB全体レベルの `AI_Optout: true`** が設定されているにもかかわらず `"AIHints"` キーがまだ残っているDBが列挙対象に混入すると、`patch-aihints.mjs` が exit code 2 で終了します。ステップ2のループ（`for target in ...; do node tools/patch-aihints.mjs ...; done`）には `|| true` 等のエラーハンドリングが無く、GitHub Actions の `run:` ステップは既定で `set -e` 相当のため、**exit 2 がそのままジョブ全体の失敗として伝播**します。失敗までの時間が23〜28秒と短く（npm ci＋最初の対象DBでの早期失敗に一致）、この仮説と整合します。

### 再発有無

07-16 のAttempt#1・#2失敗以降、addon-ai-tag では `develop` からのマージコミットのみが記録されており（`Merge branch 'develop' into addon-ai-tag`）、`data/Works_*/DataBases/db_*.json` を直接変更するpushが無かった可能性があり、再発の有無は未確認（ワークフローのトリガー条件が同パスの変更を要するため）。

### 提案（修正方針）

- **応急**: ステップ「構造的再同期の実行」のループ内で、`patch-aihints.mjs` の終了コードを捕捉し、exit 2（AI_Optoutガード）の場合はエラーではなく `::warning::` を出して `continue`（該当DBをスキップ）するよう変更する。
  ```bash
  node tools/patch-aihints.mjs --work "$work" --db "$db" --all --resync-structural --apply || {
    code=$?
    if [ "$code" -eq 2 ]; then
      echo "::warning::${work}/${db} は AI_Optout のためスキップしました"
      continue
    fi
    exit "$code"
  }
  ```
- **恒久**: ステップ「対象DBの列挙」で `"AIHints"` の grep に加えて `AI_Optout` フラグも確認し、DB全体オプトアウトのDBは列挙時点で除外する（ワークフロー自身のコメントが想定する設計意図と一致）。
- 実際にどのDBがこの原因に該当するかは、7fb4d43 時点の `data/Works_*/DataBases/db_meta.json` の `AI_Optout` 設定を確認する必要があります（本タスクでは実行時のActionsログ本文にアクセスできないため、上記は email通知とワークフロー定義から導いた仮説です。実行ログの「Annotations」欄で実際のエラーメッセージを確認してから修正することを推奨します）。

---

## 4. 参考: GitHub Pages系デプロイの同時期失敗パターン（本リポジトリ含む複数リポジトリ）

2026-07-15〜07-16の短期間に、以下の独立したリポジトリで Pages 系ワークフローが軒並み失敗しています。

- 100BeautiesLab_CreationsDB: `Deploy Jekyll with GitHub Pages dependencies preinstalled`（develop, e1fb60c）
- ChearSheet-of_Numbers: 同ワークフロー（main, 2件）
- CheatSheet-of_HttpResponceDataCode: `Deploy GitHub Pages`（main）
- ShouArRider-HTML_CSS: `Deploy static content to Pages`（main, 24b703f）

いずれも数秒〜十数秒で失敗しており、ビルド内容起因というより **Pages機能自体の設定（Settings > Pages > Build and deployment source が "GitHub Actions" になっているか、環境 `github-pages` の保護ルール、Organization/Account単位のActions権限変更等）** が疑わしいです。複数の独立リポジトリで同時多発している点から、個別のワークフローYAMLのバグよりも account/repo設定側の変更を先に確認することを推奨します（本タスクの範囲では repo設定の確認・変更はできないため、User側での確認をお願いします）。

---

## まとめ

| 項目 | 状態 | 対応 |
| --- | --- | --- |
| Issue #13（DBフィールド追加要望） | OPEN | User判断待ち。追加時のスキーマ方針を本ログに記載 |
| Cloudflare API 自動更新 失敗 | 解消（一過性・既知） | 対応不要、再発時のみ要監視 |
| AIHints 構造的再同期 失敗（addon-ai-tag） | 原因仮説あり・要確認 | ワークフローにエラーハンドリング追加を提案 |
| Pages系デプロイ失敗（複数repo） | 未確認 | account/repo設定の確認をUserに依頼 |
