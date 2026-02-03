# 2026-02-03 呼称フィールド整形（First/Second/ThirdPersonCalling）対応ログ

## 目的

- `data/**/DataBases/db_*.json` に存在する呼称フィールド（`FirstPersonCalling`, `SecondPersonCalling`, `ThirdPersonCalling`）を、参照例（特に `Works_NumberTales` の `ThirdPersonCalling`）に合わせた書式に寄せる。
- ただし **意味を変えない範囲** での表記ゆれ統一に留める。
- 仕様が曖昧な箇所は独断で拡張せず、ユーザー合意の範囲でのみ機械修正する。

## 背景・課題

- DB JSON は「文字列内改行」や（実質的に）JSONC相当の表記が混在しうるため、安易に JSON として parse→stringify すると表記やコメントが壊れるリスクがある。
- 呼称の区切り（`,` と `;`）やワイルドカード（全角/半角）などが作品・DBごとに揺れていた。

## 合意した整形ルール（今回の機械適用範囲）

- 未記載の区分は `;` で空埋めしない（例: `"彼/彼女;~さん"` のような省略は許容）。
- ワイルドカードを半角に統一: `＊` → `*`、`～`/`〜` → `~`。
- `"~君;パイセン"` は未対応書式として `"~君,パイセン"` に修正（ユーザー指示）。
- `"…;※名前呼び]"` のような欠落はタイポとして `"…;[※名前呼び]"` に修正（ユーザー指示）。
- 明確な区切りミス `"彼/彼女/[※名前呼び]"` は `"彼/彼女;[※名前呼び]"` に修正。

## 実装方針

- JSON をパースせず、対象キーの **文字列リテラル部分だけ** をスキャンして置換する。
- 対象は `data/**/DataBases/` 配下の `db_*.json`（ただし `db_meta.json` / `db_type.json` は除外）。

## 追加したツール

- `tools/normalize-callings.mjs`
  - 役割: 上記ルールに従い、`FirstPersonCalling` / `SecondPersonCalling` / `ThirdPersonCalling` の文字列値のみを安全に置換。
  - 実行方法:
    - `node tools/normalize-callings.mjs`

## 変更が入ったファイル（差分が発生したもの）

- `data/Works_DestinyFoxsRecords/DataBases/db_Primary.json`
- `data/Works_FLInvestigator78/DataBases/db_PrimaryDealer.json`
- `data/Works_NumberTales/DataBases/db_Primary.json`
- `data/Works_NumberTales/DataBases/db_Secondary.json`
- `data/Works_NumberTales/DataBases/db_SemiPrimary.json`
- `data/Works_Proxies/DataBases/db_Proxy.json`
- `data/Works_ShouArRiders/DataBases/db_Primary.json`
- `data/Works_SinisterChangingGirls/DataBases/db_Primary.json`

## 変更の要約（代表例）

- `ThirdPersonCalling` 内のワイルドカードを全角→半角に統一（例: `＊いつ/＊れ` → `*いつ/*れ`）。
- 敬称ワイルドカードを `~` に統一（例: `～君` → `~君`、`～さん` → `~さん`）。
- タイポ修正（例: `*奴(*いつ);※名前呼び]` → `*奴(*いつ);[※名前呼び]`）。
- 区切りの明確な誤りのみ修正（例: `彼/彼女/[※名前呼び]` → `彼/彼女;[※名前呼び]`）。

## 検証

- 変換後、取りこぼし・残骸（例: `;パイセン`、`※名前呼び]`、全角ワイルドカード）が残っていないかを検索で確認。
- `npm test`（Vitest）を実行し、整合性テストがパスすることを確認（passed=4 / failed=0）。

## 補足（今後の運用）

- 呼称表記は作品・キャラ設定の意味に直結するため、新たな曖昧ケースが見つかった場合は、機械的に一括変換せずユーザー合意のうえでルール化してから適用する。
