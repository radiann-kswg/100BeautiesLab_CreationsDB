# 2026-04-23 UI Output Tests

## 目的

- API/SW だけでなく、キャラシート生成 UI の出力結果も自動検証できるようにする。

## 変更点の要約

- `pages/characters.js` にテスト時の自動初期化抑止と test hook を追加。
- `tests/pages.characters.ui-output.test.js` を追加し、`renderDetail()` の基本情報テーブルを jsdom 上で検証。
- `fetchGlobalDefType()` のマージ結果に schema 側コンテナ (`$DefType` など) を保持し、`Belonging -> Faction` の辞書解決が UI でも通るよう修正。
- `README.test.md` に UI 回帰テストの説明を追記。

## 影響範囲

- `pages/characters.js`
- `tests/pages.characters.ui-output.test.js`
- `package.json`
- `package-lock.json`
- `README.test.md`

## 検証

- `npm install` により `jsdom` を導入済み。
- `tests/pages.characters.syntax.test.js` を実行し成功。
- `tests/sw.deftype.merge.test.js` を実行し成功。
- `tests/pages.characters.ui-output.test.js` を実行し成功。

## 未完了タスク

- 必要なら一覧 UI (`renderList`) 側の出力回帰も同系統で追加する。

## 参考リンク

- `tests/pages.characters.syntax.test.js`
- `tests/sw.deftype.merge.test.js`
- `pages/characters.js`
