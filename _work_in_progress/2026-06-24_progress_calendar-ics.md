# 2026-06-24 進捗: 誕生日・記念日の Google カレンダー連携(ICS 自動生成・配信)

## 目的

創作 DB のキャラクターの**誕生日(`BirthDay`)・記念日(`AnivDay`)**を Google カレンダーに表示し、
**リモートリポジトリ(develop)が更新されるたびに自動追従**させる。

## 採用方式(User 合意済み)

- **ICS 購読方式**: GitHub Actions で `.ics` を自動生成 → GitHub Pages 配信 → Google カレンダーで URL 購読。
  Google 認証情報の設定が不要で、専用(読み取り専用)カレンダーが自動で作られる。
- **対象範囲**: 公開 DB 全部(日付を持つレコード)。`isPrivate`/非公開作品/非公開 DB は除外。
- **構成**: 誕生日・記念日を 1 カレンダー(1 ICS)に統合。タイトルは日本語、説明欄に英名・作品名を併記。

## 変更点の要約

- 新規 `tools/build-calendar-ics.mjs`(生成スクリプト, ESM)。
- `package.json` に `calendar:build` を追加。
- `.gitignore` に `/calendar/*.ics`(生成物)を追加。
- `.github/workflows/jekyll-gh-pages.yml` に Node セットアップ＋生成ステップを追加。
- 新規 `tests/calendar.ics.test.js`(Vitest)。
- 新規 `docs/calendar-ics-spec.md`(仕様・購読手順)。
- `CHANGELOG.md` に変更履歴を追記。

## 影響範囲(編集ファイル)

- `tools/build-calendar-ics.mjs`(新規)
- `tests/calendar.ics.test.js`(新規)
- `docs/calendar-ics-spec.md`(新規)
- `package.json` / `.gitignore` / `.github/workflows/jekyll-gh-pages.yml`(更新)
- `CHANGELOG.md`(更新)

## 検証(本セッションで実施)

- `node tools/build-calendar-ics.mjs`: 生成成功。作品=9 / DBファイル=14 / イベント=150(誕生日19・記念日131)。
- 除外確認: 非公開 DB(`UnprocessedDealer`/`UnprocessedSecondary`/`PrimaryPerformer`)はイベント 0 件で除外。
  `BirthDay` の `{hideText}` 3 件はスキップ(22→19)。
- ICS 構造: VEVENT begin/end 一致、UID 全 150 件一意、全行 ≤75 オクテット、CRLF、全 DTSTART が妥当日付。
- 決定性: 2 回生成で同一バイト列。
- ロジック検証: テスト相当の 16 アサーションを素の Node で実行し全合格。

## 追記（2026-06-24 続セッション）

- **`npm test` 実施済み**: 126 件中 125 pass / 1 fail（B-2: References basicFields 実装課題のみ、ICS テストとは無関係）。
- **配信確認済み**: develop push 後、CI で ICS 生成・Jekyll ビルドが成功。
  `Content-Type: text/calendar` で正常配信を PowerShell で確認（`Last-Modified: 2026-06-24 03:48 UTC`）。
- **Google カレンダー購読登録完了**: 設定 → 他のカレンダー → URL で追加 にて購読登録済み。
  カレンダーID `...@import.calendar.google.com` で登録確認。初回同期は数時間〜24時間かかる場合あり。

## 追記（2026-06-26 デバッグセッション）

- **根本原因確定**: `Name_JP` に改行文字を含むキャラクター名（15件）が ICS の `SUMMARY` に `\n` エスケープとして混入しており、Google Calendar のパーサーがファイル全体のインポートを拒否していた。
- **修正**: `tools/build-calendar-ics.mjs` に `summaryName = name.replace(/\r?\n/g, " / ")` を追加し、SUMMARY を1行タイトルに正規化。コミット `842f3de`。
- **配信確認**: `Last-Modified: 2026-06-26 00:55:22 GMT` で修正済み ICS が配信中。
- **次アクション**: Google カレンダーで購読カレンダーを削除 → URL で再登録して強制再同期。
- **補足**: Google Calendar のファイルインポート UI は 150 件全体では失敗するが、75 件ずつなら成功する（UI 側の内部制限の可能性）。購読カレンダー（URL 購読）はこの制限の影響を受けない。

## 未完了・申し送り

- **Google カレンダーの購読カレンダーを削除して再登録**（強制再同期）してイベント表示を確認する。

## 参考

- 仕様: `docs/calendar-ics-spec.md`
- CI: `.github/workflows/jekyll-gh-pages.yml`
