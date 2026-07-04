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

1. ~~サービスアカウント作成 + Calendar API 有効化 + 鍵 JSON 発行~~ ✅ 完了（2026-07-04）
2. ~~対象カレンダーへサービスアカウントを「予定の変更権限」で共有~~ ✅ 完了
3. ~~GitHub Secrets 登録: `GCAL_SERVICE_ACCOUNT_KEY` / `GCAL_CALENDAR_ID`~~ ✅ 完了
4. ~~`npm test` をローカルで実行し全テスト成功を確認~~ ✅ 完了
5. ~~commit / push → Actions 疎通確認~~ ✅ 完了（初回同期成功・下記検証結果参照）

→ **本件タスクは全て完了。** 残作業なし（運用フェーズへ移行）。

## 初回同期の検証結果（2026-07-04 追記）

- User により初期設定（サービスアカウント・カレンダー共有・Secrets 登録）完了。
  Actions「Google カレンダー同期」が正常終了（run 28693874618）。
- カレンダー側実測: 全マスターイベントが決定的 ID（40桁hex）、旧コネクタ形式（非決定 ID・` | `区切り説明文）の残骸ゼロ。
- **DB 側 187 件（誕生日35・記念日152）とカレンダー側 187 件が完全一致**（余剰 0）。
  1年窓のインスタンス列挙で 2 件見えないのは 2/29 イベント（うるう日が窓に無いだけで、マスターは同期済み。Google の仕様上 2/29 の毎年繰り返しはうるう年のみ表示 — ICS と同挙動）。

### 付随して発見・対処した問題（ローカル作業ツリーの JSON 破損）

- 本体ローカルの未コミット `data/Works_NumberTales/DataBases/db_Primary.json` が
  **末尾44行欠落（文字列途中で切断・EOF改行なし）**で JSON パース不能だった。
  過去セッションのエディタ書き込みの末尾切断（既知事象）が原因とみられる。
  このため実装時のローカル dry-run が 74 件と過少計上されていた（読取失敗ファイルは欠損耐性でスキップされるため）。
- `data/db_type.json` にも末尾に空白のみの行が付着していた。
- 両ファイルとも差分に意図的な追記は無く、`git show HEAD:<path>` の内容で作業ツリーへ復元
  （git 履歴への書き込みなし）。復元後の JSON パース・dry-run（187件）で正常確認。
- 教訓: data/ の大型 JSON を編集した後は `python -m json.tool` 等でパース検証を通すこと。

## 参考リンク

- `docs/calendar-ics-spec.md` §6（push 方式仕様・手順）
- Google Calendar API: Events insert/update/delete, サービスアカウント JWT Bearer フロー
