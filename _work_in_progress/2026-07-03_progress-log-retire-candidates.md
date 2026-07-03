# 2026-07-03 進捗ログ退避候補リスト（.completed への移動候補）

## 目的

進捗ログの棚卸し結果にもとづき、`_work_in_progress/.completed/` へ退避できる候補を整理する。
本ファイルは候補提示として作成したが、2026-07-03 の実行で候補 A/B の移動を完了した。

## 実行結果（2026-07-03）

- 候補 A/B のうち以下 8 ファイルを `.completed/` へ移動済み:
  - `2026-07-03_progress_github-triage.md`
  - `2026-07-02_progress_jump-dblinkref.md`
  - `2026-07-01_progress_readme-local-agents-rule.md`
  - `2026-07-01_progress_appearance-detail-ear-en.md`
  - `2026-07-01_progress_github-triage.md`
  - `2026-07-02_progress_github-triage.md`
  - `2026-06-25_progress_github-triage.md`
  - `2026-06-24_progress_github-triage.md`

## 退避判定ルール（今回）

- 実装・検証が完了し、本文の「未完了タスク」が実質 `なし` か、運用上クローズ済みであること
- 後続の新しいログで状態が上書きされ、現行判断の起点として使わないこと
- User 手動作業が残っていても、内容が「完了ログ + 任意確認」の性格であること

## 候補 A（優先して退避してよい）

- `2026-07-03_progress_github-triage.md`
  - 理由: 「未解決項目 該当なし」で現状クローズ。最新基準ログとして保存価値は高いが、進行中管理には不要。
- `2026-07-02_progress_jump-dblinkref.md`
  - 理由: 未完了タスクなし。実装・テスト・ドキュメント更新まで完了。
- `2026-07-01_progress_readme-local-agents-rule.md`
  - 理由: 運用ルール追記が完了済みで、残りは commit/push のみ。
- `2026-07-01_progress_appearance-detail-ear-en.md`
  - 理由: データ補完とテスト完了。残りは訳文最終確認とコミットのみ。

## 候補 B（退避可能だが、ひとまとまりで判断推奨）

- `2026-07-01_progress_github-triage.md`
- `2026-07-02_progress_github-triage.md`
- `2026-06-25_progress_github-triage.md`
- `2026-06-24_progress_github-triage.md`
  - 理由: GitHub triage 系の履歴群。最新 `2026-07-03` で状態が上書き済み。
  - 備考: 履歴比較を頻繁に行う場合は、A を先に退避し、B は次回まとめて退避でもよい。

## 候補 C（いまは保留推奨）

- `2026-06-28_progress_conversationpattern-handoff.md`
  - 理由: ユーザ端末作業（lock 解消、最終コミット等）が明確に残っている。
- `2026-06-30_progress_appearance-detail-cleanup.md`
  - 理由: BodyPart 手動入力など、未完了項目が残っている。
- `2026-06-18_progress_dblink-enrich.md`
- `2026-06-18_progress_dblink-renderer.md`
  - 理由: ブラウザ確認待ちが残っている。
- `2026-06-28_progress_deepl-localization.md`
- `2026-07-02_progress_deepl-py-and-skill.md`
  - 理由: 実 API キーでの運用確認など、実行待ちが残っている。

## 推奨アクション

1. 候補 A を先に `.completed` へ移す。
2. 候補 B は「triage 履歴一式」としてまとめて移す。
3. 候補 C は現行タスク台帳で継続管理する。
