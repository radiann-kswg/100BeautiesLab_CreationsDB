# 進捗レポート: カレンダー機能拡張（作品色・2/29 平年対応・和文統一） (2026-07-04)

## 目的

push 同期の運用開始に合わせ、ライブアーティファクト（Birthday Anniversary Calendar）と同様の
「作品ごとの色分け」をカレンダー本体（ICS / Google 同期）へ導入する。あわせて 2/29 の平年 2/28 表示、
説明欄（DESCRIPTION）の和文統一を行う。

## 変更点の要約

| ファイル | 内容 |
| --- | --- |
| `data/db_type.json` | `$MetaType.$Def_CreationWorkCatalog` に `CalendarColorId`（`#String\|#Null`, internal）を宣言 |
| `data/db_meta.json` | 全9作品へ `CalendarColorId`（Google イベント色 1〜11）を設定（下表） |
| `tools/build-calendar-ics.mjs` | RFC 7986 `COLOR`（CSS 色名）出力 / `buildRrule()`（2/29 → `BYMONTH=2;BYMONTHDAY=-1` 毎年2月末日）/ `buildEventDescription()`（和文）を追加・export。未指定作品は既定パレットを表示順で自動割当 |
| `tools/sync-calendar-gcal.mjs` | 共通関数へ寄せ、Google へ `colorId` 反映。変更検知ハッシュへ色を追加（色変更でも update）。イベント ID は不変 → 既存イベントは削除されず全件 update で移行 |
| `tests/calendar.ics.test.js` | 2/29 ルール・COLOR/colorId・作品内同色・和文 DESCRIPTION のテスト追加 |
| `tests/calendar.gcal-sync.test.js` | 新仕様（色・2/29・和文・ハッシュの色反応）へ全面追従 |
| `docs/calendar-ics-spec.md` | §2 / §6 更新 |
| `CHANGELOG.md` | 本件を追記 |

## 作品色の割り当て（既定値・User 調整可）

| 作品 | CalendarColorId | Google 色名 |
| --- | --- | --- |
| NumberTales | 7 | Peacock（水色） |
| FLInvestigator78 | 3 | Grape（紫） |
| ShouArRiders | 6 | Tangerine（橙） |
| UnibyteLive | 4 | Flamingo（ピンク） |
| SinisterChangingGirls | 11 | Tomato（赤） |
| UnauthedLogica | 8 | Graphite（灰） |
| PastDivers | 10 | Basil（深緑） |
| DestinyFoxRecords | 5 | Banana（黄） |
| Proxies | 1 | Lavender（薄紫） |

- 変更したい場合は `data/db_meta.json` の該当作品の `CalendarColorId` を書き換えるだけ（コード変更不要）。

## 設計メモ

- **2/29**: `RRULE:FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=-1`（毎年2月末日）により、平年 2/28・うるう年 2/29 に表示。
  ICS / Google Calendar API の両対応で、データ側の追加処理は不要。
- **和文 DESCRIPTION**: 「作品 / DB / 英名 / 記念日(`DayAbout_JP`) / 出典」。英文定型（`Source:` / `Name:` /
  `DayAbout_EN` 本文）は廃止。ICS と Google 同期で `buildEventDescription()` を共用。
- **移行挙動**: イベント ID（ICS UID と同一の SHA-1）は不変のため、次回同期は**全件 update**（削除・再作成なし）。

## 検証

- `node --check`（両ツール・両テスト）OK / JSON パース（db_meta / db_type）OK。
- ICS 生成: 187 件全件に `COLOR` 行、2/29 の2件に `BYMONTHDAY=-1`、DESCRIPTION 和文化を確認。
- 素の Node による同等検証: 作品内同色・複数作品色分け・メタ指定色反映・色変更でのハッシュ変化・
  description 共通化・ID 不変 — 全て OK（vitest はサンドボックス制約により User 端末で実行）。
- 付記: `Works_Proxies/db_Proxy.json` は現状 3 レコードとも `BirthDay: null` のためイベント 0 件
  （データ入力は User 管理領域。入力されれば次回 push で自動反映・色は Lavender を予約済み）。

## 未完了タスク（User 操作）

1. `npm test` をローカルで実行し全テスト成功を確認。
2. commit / push（develop）→ Actions「Google カレンダー同期」で全件 update されることを確認
   （初回は 追加=0 更新=187 削除=0 が期待値）。
3. （任意）色の好みが合わなければ `data/db_meta.json` の `CalendarColorId` を調整。

## 参考リンク

- `docs/calendar-ics-spec.md` §2・§6
- ライブアーティファクト: Birthday Anniversary Calendar（配色・2/29 表示の参照元）
