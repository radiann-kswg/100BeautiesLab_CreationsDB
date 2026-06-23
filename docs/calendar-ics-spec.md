# カレンダー(.ics)生成・Google カレンダー購読 仕様

創作キャラクターの**誕生日(`BirthDay`)・記念日(`AnivDay`)**を iCalendar(.ics)として自動生成し、
GitHub Pages で配信して Google カレンダー等から**購読(subscribe)**できるようにする仕組みです。

- 生成スクリプト: `tools/build-calendar-ics.mjs`
- 生成コマンド: `npm run calendar:build`
- 既定の出力先: `calendar/100beautieslab-creations.ics`(リポジトリ管轄外・ビルド成果物)
- 配信 URL: `https://database.numbertales-radiann.net/calendar/100beautieslab-creations.ics`

---

## 1. データソースと抽出ルール

各レコードの以下フィールドから終日イベントを生成します(年情報は持たないため**毎年繰り返し**)。

| フィールド | 形 | 生成イベント |
| --- | --- | --- |
| `BirthDay` | 単一 `{ Day: { Month, DayOfMonth } }` | 🎂 誕生日(1件) |
| `AnivDay` | 配列 `[{ Day: { Month, DayOfMonth }, DayAbout_JP, DayAbout_EN }]` | 🎉 記念日(要素ごと) |

### 除外ルール(公開ガイドライン準拠)

- `isPrivate: true` のレコードは除外。
- グローバル `data/db_meta.json` の `CreationWorks.#Works_*.Works_Hidden = true` の作品は除外。
- 作品別 `db_meta.json` の `Databases` 配下(**ネスト含む**)の `#DB_*` に付く
  `DB_Hidden`/`Works_Hidden = true` の DB は除外。
- `{ hideText: ... }` のマスク値、`Day` 欠損、`Month`/`DayOfMonth` 非数値・範囲外はスキップ。

---

## 2. 出力フォーマット

- **終日 + 毎年繰り返し**: `DTSTART;VALUE=DATE` + `DTEND;VALUE=DATE`(翌日) + `RRULE:FREQ=YEARLY`。
  基準年はうるう年の `2024`(2/29 を保持できるため)。
- **タイトル**: `🎂 {名前}（誕生日）` / `🎉 {名前}（{記念日の説明}）`。名前は `Name_JP` 系を優先解決。
- **説明欄(`DESCRIPTION`)**: 作品名(JP/EN)・DB ラベル・英名・`DayAbout_EN`・出典を併記。
- **`UID`**: `作品 | DB | 索引 | 種別 | 識別子` の SHA-1。レコードを一意・安定に識別するため、
  再生成時も同じイベントは同じ UID となり、購読側で**冪等に更新**される。
- **決定的出力**: イベントを月日順にソートし `DTSTAMP` を固定値にしているため、
  入力(data)が同じなら出力は同一バイト列。差分が出るのは実データが変わったときだけ。
- RFC 5545 準拠: テキストエスケープ、行は UTF-8 75 オクテットで折返し、改行は CRLF。

---

## 3. 自動更新フロー(リポジトリ更新への追従)

```
data/ を更新して develop へ push
        │
        ▼
GitHub Actions: jekyll-gh-pages.yml
  1) Node セットアップ
  2) node tools/build-calendar-ics.mjs  ← .ics を生成(コミットバック不要)
  3) Jekyll ビルド(_site に .ics を同梱)
  4) GitHub Pages へデプロイ
        │
        ▼
配信 URL の .ics が最新化
        │
        ▼
Google カレンダーが購読 URL を定期ポーリングして反映
```

> .ics はコミットせず、ビルド時に毎回生成します(`.gitignore` で `/calendar/*.ics` を除外)。

---

## 4. Google カレンダーでの購読手順(初回 1 回のみ)

1. PC ブラウザで Google カレンダーを開く。
2. 左側「他のカレンダー」の **＋** → **URL で追加**。
3. 次の URL を貼り付けて「カレンダーを追加」:
   `https://database.numbertales-radiann.net/calendar/100beautieslab-creations.ics`
4. 読み取り専用の購読カレンダーとして追加され、以後は自動で同期される。

### 注意

- Google 側の購読カレンダーは**再読込の間隔を選べない**(数時間〜最大 1 日程度)。即時反映ではない。
- 購読カレンダーは**読み取り専用**(Google 上で個別イベントを編集しても次回同期で上書き)。
- 即時反映・編集可能なカレンダーが必要な場合は、Calendar API 直書き方式(サービスアカウント認証情報を
  GitHub Secrets に設定)への切り替えを別途検討する。

---

## 5. 関連ファイル

| 対象 | パス |
| --- | --- |
| 生成スクリプト | `tools/build-calendar-ics.mjs` |
| npm スクリプト | `package.json`(`calendar:build`) |
| CI 生成・配信 | `.github/workflows/jekyll-gh-pages.yml` |
| テスト | `tests/calendar.ics.test.js` |
