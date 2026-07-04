# 進捗レポート: Google カレンダー直接同期（push 方式）の実装 (2026-07-04)

## 目的

ICS 購読(pull)方式で「配信は正常だが Google がポーリングに来ない/遅く、購読カレンダーへ反映されない」事象が発生。
配信側から解決不能と確定したため、Calendar API でカレンダーへ直接 upsert する **push 方式**を実装し、
リポジトリ push への完全自動追従を実現する。

## 変更点の要約

| ファイル | 内容 |
| --- | --- |
| `tools/sync-calendar-gcal.mjs`（新規） | 完全ミラー同期スクリプト。`build-calendar-ics.mjs` の `collectEvents()` を再利用（抽出・除外ルールは ICS と同一）。サービスアカウント JWT 認証（外部依存なし・Node 18+）。イベント ID は ICS UID と同じ SHA-1 で決定的 → 冪等 upsert。`blHash` による変更検知で差分のみ書き込み。DB 側から消えたイベントは削除。429/5xx は指数バックオフ、409 は update で復活。`--dry-run` 対応 |
| `.github/workflows/gcal-sync.yml`（新規） | `develop` push（`data/**`・スクリプト変更時）で自動同期。workflow_dispatch（dry_run 入力付き）。concurrency で直列化 |
| `package.json` | `calendar:sync` / `calendar:sync:dry` 追加 |
| `docs/calendar-ics-spec.md` | §6「push 方式」追加（仕組み / 初期設定手順 / ローカル検証 / 注意）。§4 注意書きを push 優先へ更新。§5 関連ファイル更新 |
| `tests/calendar.gcal-sync.test.js`（新規） | 日付導出・ID 決定性（ICS UID 一致）・リソース組み立て・変更検知ハッシュの回帰テスト |
| `CHANGELOG.md` | 本件を追記 |

## 合意事項

- **完全ミラー方式**（User 確認済み）: カレンダーは DB の鏡とし、DB 側から消えたイベントは自動削除。
  対象カレンダーは同期専用として扱う。
- **同期先**（User 確認済み）: 既存の編集可能カレンダー「「百花繚乱研究所」創作キャラクター」
  (`1124a248...@group.calendar.google.com`) ※ID 全文は GitHub Secrets にのみ登録し、公開ログには残さない。
- 初回同期では、前回コネクタ経由で登録済みの非決定 ID イベント（約 164 件=繰り返し展開込みの計数。マスターは 80 件前後）が
  一度削除され、決定的 ID で再登録される（表示内容は同等）。
- ICS 配信(pull)は外部公開用として併存。実運用の反映経路は push 方式を正とする。

## 検証

- `node --check tools/sync-calendar-gcal.mjs` OK。
- dry-run 実行 OK: `DB 側イベント=74 (誕生日=33 記念日=41) → 追加=74`（2026-07-04 時点の data/）。
- 純粋関数チェック（サンドボックス・素の Node で同等検証）: うるう日 2/29 保持 / 年末 12/31→1/1 繰越 /
  Google イベント ID 規約適合 / ICS UID と同一ハッシュ / 変更検知ハッシュの安定・変化 — 全て OK。
- `npm test`（Vitest）: サンドボックスは Windows 用ネイティブバイナリのため実行不可。**User 端末での実行が未完**（下記）。

## 未完了タスク（User 操作）

1. サービスアカウント作成 + Calendar API 有効化 + 鍵 JSON 発行（`docs/calendar-ics-spec.md` §6.2 手順 1-3）。
2. 対象カレンダーへサービスアカウントを「予定の変更権限」で共有（手順 4）。
3. GitHub Secrets 登録: `GCAL_SERVICE_ACCOUNT_KEY` / `GCAL_CALENDAR_ID`（手順 5）。
4. `npm test` をローカルで実行し全テスト成功を確認。
5. commit / push（develop）→ Actions「Google カレンダー同期」を dry_run: true → false の順で疎通確認（手順 6）。

## 参考リンク

- `docs/calendar-ics-spec.md` §6（push 方式仕様・手順）
- Google Calendar API: Events insert/update/delete, サービスアカウント JWT Bearer フロー
