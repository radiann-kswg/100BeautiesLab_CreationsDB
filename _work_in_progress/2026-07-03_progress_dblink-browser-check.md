# 2026-07-03 進捗: `*_DBLink` ブラウザ動作確認

## 目的

`2026-06-18_progress_dblink-enrich.md` / `2026-06-18_progress_dblink-renderer.md` に残っていた
「ブラウザ動作確認」を実施し、`*_DBLink` の表示挙動を確認する。

## 実施内容

- ローカル静的サーバーを起動（`npx --yes http-server . -p 8080 -c-1`）
  - 補足: `python -m http.server` は実行環境に Python が無く起動不可だったため Node 系で代替。
- 検証 URL:
  - `http://127.0.0.1:8080/pages/characters.html?work=Works_SinisterChangingGirls&db=Primary&idx=E&idxKey=Drc`
- 参照解決 ON のまま、`異空岐路存在(アナザーレギオン)` / `ANOTHER-REGIONs` セクションを展開して確認。

### 追加スポット確認（同日追記）

- 検証 URL 1:
  - `http://127.0.0.1:8080/pages/characters.html?work=Works_FLInvestigator78&db=PrimaryDealer&idx=79&idxKey=Card.Num&lang=en`
- 検証 URL 2:
  - `http://127.0.0.1:8080/pages/characters.html?work=Works_DestinyFoxRecords&db=Primary&idx=rad&idxKey=Unit&lang=en`
- 確認観点:
  - 両ケースで `ANOTHER-REGIONs` セクションが表示されること。
  - 参照解決 ON のまま詳細表示まで遷移できること。

## 確認結果

### JP 表示

- `⇒ 六花 ルノ（パストダイヴァー）` の形式で表示されることを確認。
- クロスワーク参照時のみ作品名併記され、全角括弧 `（ ）` が使われることを確認。

### EN 表示

- 言語切替後、`⇒ Luno Hexacrys (PastDivers)` の形式で表示されることを確認。
- クロスワーク参照時のみ作品名併記され、半角括弧 `( )` が使われることを確認。

### 参照リンク

- 参照リンクが `Works_PastDivers` / `SemiPrimary` / `idxKey=Chronos` を含む URL へ解決されることを確認。

## 結論

- `*_DBLink` suffix のエンリッチ + セクションレンダラ + クロスワーク作品名併記は、
  主要確認ケース（SCG Primary Drc=E）および追加スポット確認 2 ケースで期待どおりに動作。
- 2026-06-18 の「ブラウザ確認残り」は、代表ケース + 追加スポット確認まで解消済み。

## 未完了タスク

- なし（代表ケース + 追加スポット確認として完了）。
