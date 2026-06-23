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

## 未完了・申し送り

- **`npm test`(Vitest)は User 環境で実行が必要**。本セッションのサンドボックス(Linux)では
  `node_modules` が Windows 用インストールのため Vitest 4 の rolldown ネイティブバインディングが無く、
  Vitest 本体は起動できなかった(テストファイル自体は構文 OK・ロジックは Node 直接実行で全合格)。
- **Google カレンダーでの購読登録は User が初回 1 回手動**で実施(`docs/calendar-ics-spec.md` の手順)。
- develop へ push 後、`https://database.numbertales-radiann.net/calendar/100beautieslab-creations.ics`
  が 200 で配信されるかを実機確認するとよい(Jekyll が `calendar/` 配下の `.ics` を `_site` に同梱するか)。

## 参考

- 仕様: `docs/calendar-ics-spec.md`
- CI: `.github/workflows/jekyll-gh-pages.yml`
