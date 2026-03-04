# 2026-03-04 進捗ログ: 希望タスク フェーズ3（予約語/機械処理キーの整理）

## 目的

- フェーズ3「予約語/機械処理の整理（仕様の“言語化”）」のうち、API/SW 側で **予約語キーを機械的に扱える**ようにし、ハードコード散在を減らしつつ後方互換を維持する。
- 予約語（`_` / `$` / `#`）および既知キー（`_DBLink` / `_Jump` / `_Search` / `_Commons` / `_Secondaries` / `_enrichment` など）を、実装とドキュメントの両面で一貫化する。

## 変更点の要約

- `SchemaNaming`（予約語キーの定数・判定・互換警告）を導入し、SW 共通処理で利用するようにした。
- legacy キー（`Secondaries`）を読み取った場合に、開発者が新仕様へ寄せられるよう「一度だけ」警告を出す。
- DB 更新ガイドラインに、予約語プレフィックスと命名運用の目安を追記した。

## 影響範囲（編集したファイル）

- lib/sw-common.js
- lib/data-common.js
- docs/db-update-guidelines.md
- CHANGELOG.md

## 実装方針（要点）

- **SW 実行（classic script）と Node/Vitest（ESM import）の両方**で参照できるように、`SchemaNaming` は `lib/sw-common.js` で定義しつつ、`lib/data-common.js` 側でも「未定義なら生成」するフォールバックを持たせた。
- `startsWith('_')` などの“散在する判定”を、`SchemaNaming.isReservedKey()` 等へ寄せ、振る舞いの一貫性を確保した。

## 検証

- `npm test`（Vitest）で全テスト通過を確認。

## 補足

- 本フェーズは「内部処理の改善（命名/予約語の整理）」が目的のため、UI/HTML の直接変更は行っていない。
