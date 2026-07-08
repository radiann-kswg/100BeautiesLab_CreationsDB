# `addon-ai-tag`: AIHints 耳タグ生成を develop 側の EarShapeType 再設計へ追従

## 目的

`develop` ブランチで「耳の形状」が `AppearanceDetail[].DesignElement:"#Element_Ear"` の `vdict_EarShapeType`（`$EnumDef_EarShapeType`、`TailShapeType` とは独立した軸として NumberTales work-local 整備）へ改名・整理された（`2026-07-08_progress_numbertales-earshapetype-restructure.md` 参照、`develop` → `addon-ai-tag` マージ済み）。この develop 側作業の実施時点で、`addon-ai-tag` 側 `tools/patch-aihints.mjs` の耳タグ生成は「尻尾形状（`TailShapeType`）から Fox/Cat/Nekomata/Dog 系統かを allow-list で判定して耳タグを推測する」暫定コード（`isEarBearingAnimalWord`）のままだった旨を明記していた。develop 側の内容が確定・マージされたため、本作業でその追従を行った。

## 作業ブランチ

`addon-ai-tag`（develop からのマージ後、本体ローカル）。

## 変更点の要約

### `tools/patch-aihints.mjs`

- `isEarBearingAnimalWord(animalWord)`（尻尾形状の allow-list から耳の有無を推測する暫定関数）を削除。
- 新関数 `resolveEarShapeLabel(record, varsDef)`（export 済み）を追加: `record.AppearanceDetail[]` から `DesignElement === "#Element_Ear"` のエントリを探し、`Attrs[].vdict_EarShapeType` を `$EnumDef_EarShapeType` で解決した英語ラベル（例: `"Fox"`）を返す。**尻尾形状からの推測は一切行わない**（develop 側の「尻尾形状と耳形状は完全に独立した軸」という設計方針に忠実に追従）。実データが無ければ素直に `null`。
- `buildSuggestedScaffold` 内で `earShapeLabel = resolveEarShapeLabel(record, varsDef)` を計算し、`buildSuggestedCorefolderForm`/`buildSuggestedHumanoidForm`/`buildNegativeVisuals` へ新パラメータとして引き渡すよう変更。各関数の耳タグ生成（`"${earAnimalWord} ears"`）と、耳除外ロジック（`negative_visuals` の `cat ears`/`rabbit ears` 判定）を、この実データ源に統一。
- 耳データが無い場合の TODO 文言を `'TODO: ear type from TailsUnit'`（誤解を招く旧文言）から `'TODO: ear type (no AppearanceDetail #Element_Ear entry found)'`（実際の探索先を正確に示す文言）へ修正。

## 発見された実害（修正の裏付け）

Num:11（Nekomata尻尾・11本、実際の耳データは Cat 耳）で検証。旧 allow-list 実装（`/^(fox|cat|nekomata|dog)/i`）は "nekomata" にマッチしてしまうため `"nekomata ears"` という**誤った**タグを生成していた。新実装は実データ通り `"cat ears"` を正しく生成することを確認した。これは develop 側の事前調査（「尻尾形状と耳形状は実データ上も既に独立していた」）が正しかったことの直接的な裏付けでもある。

## テスト

- `tests/patch-aihints.tailsunit.test.js` に `describe('resolveEarShapeLabel', ...)` を追加: 狐耳・猫耳の解決、`#Element_Ear` エントリが無い場合の `null`、複数エントリ（左右耳）がある場合に先頭の解決成功分を採用すること、をそれぞれ検証。

## 検証

1. `npm test`: 24ファイル・220件全成功。
2. `--suggest` モードを NumberTales Primary 全105件に dry-run 実行し、例外・エラーログなしを確認。
3. Num:11 に実際に `--suggest --force --apply` を実行し、`identity_tags`（`"nekomata-type android unit"`）と `silhouette_features`（`"cat ears"` + `"nekomata 11 tails"`）が正しく独立して生成されることを確認 → `git checkout --` で revert。

## 影響範囲（編集したファイル）

- `tools/patch-aihints.mjs`
- `tests/patch-aihints.tailsunit.test.js`
- `CHANGELOG.md`

## 未完了タスク

- User から「ビルドもお願いしていいか」との申し出があり、その具体的な範囲（実データへの `--apply` 実行による AIHints 再生成か、Cloudflare（`migrate.mjs`/`migrate-aihints.mjs`/`wrangler deploy`）へのデプロイか）を確認中。コード側の修正・検証は完了しているため、範囲が確定次第すぐに着手可能な状態。
