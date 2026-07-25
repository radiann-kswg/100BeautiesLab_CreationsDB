# GitHub 未解決問題トリアージ（2026-07-25）

自動実行（毎朝のGitHub未解決問題トリアージ）による生成物。実コードの修正・commit/push は行っていません。GitHub Actions の実行ログ自体には未接続のため、Gmail通知＋ローカルgit log（読み取り専用）＋GitHub読み取り専用APIの範囲での調査です。

## 1. AIHints 構造的再同期 workflow 失敗（addon-ai-tag, commit 7fb4d43, 2026-07-16 に Attempt #1/#2 とも "All jobs have failed"）

> **⚠️ 訂正（2026-07-25 棚卸しで追記）— 以下の推定原因は誤りです。対応も不要です。**
>
> 本節は自動トリアージが Actions 実行ログへ未接続の状態で立てた仮説であり、
> [2026-07-22_github-triage.md](./.completed/2026-07-22_github-triage.md) §3 と同じ誤りを繰り返しています。
>
> **実際の原因**: 落ちていたのは `テスト` ステップ（`npm test`）のみで、`構造的再同期の実行` ステップは
> ✓ で通過していました。`AI_Optout` ガード（exit 2）は**一度も発火していません**。
> 7/16 の赤は `tests/data.shape.test.js` の 2 件、7/25 の赤は
> `tests/patch-aihints.classdict.test.js` の 2 件（`develop` の辞書構造変更へのテスト追従漏れ）でした。
>
> **状態**: ✅ **解決済み**。`addon-ai-tag` の `dde4484` で修正し、本番 Actions（run `30141731380`）で
> 緑 → PR #14 作成 → マージ後の 2 周目が no-op で停止するところまで確認済み。
>
> **したがって、下記の「提案」は適用しないでください。** ワークフロー側のエラーハンドリング追加は不要です。
> 詳細は [2026-07-25_progress_aihints-resync-ci-failure.md](./2026-07-25_progress_aihints-resync-ci-failure.md) を参照。

状態: ~~**未解決の可能性あり（要人手確認）**~~ → **解決済み（原因は上記のとおり別物）**。

~~推定原因~~（**誤り**）: `.github/workflows/aihints-structural-resync.yml`（addon-ai-tag限定）の「対象DBの列挙」ステップは `data/Works_*/DataBases/db_*.json` を `"AIHints"` の有無だけで grep 列挙しており、DBレベルの `AI_Optout: true`（db_meta.json）を考慮していません。列挙対象に AI_Optout: true の DB が含まれると、続く「構造的再同期の実行」ステップの `node tools/patch-aihints.mjs ... --apply` が `process.exit(2)`（AI_Optoutガード、--force-ai-optout未指定時）で終了し、ループ全体が非ゼロ終了で失敗します。同一コミットで2回とも同じ結果になっている点と整合します。

~~提案（未適用・レビュー用）~~（**着手不要**）:
- 「対象DBの列挙」時に db_meta.json の AI_Optout を見て、true の DB は列挙から除外する。
- または実行ループで exit code 2 を「意図的スキップ」として許容する（例: `node ... || rc=$?; [ "${rc:-0}" = "2" ] || exit "${rc:-0}"`）。
- いずれも patch-aihints.mjs 側のAI_Optout判定ロジックは変更せず、ワークフロー側のハンドリングのみの変更で足りると考えられます。

次のアクション: ~~Actions ログでの確認~~ → **実施済み・クローズ**。

### 再発防止（本当に注意すべき点）

このワークフローの唯一の詰まりどころは `テスト` ステップで、そこは**リポジトリ全体の `npm test`** を実行します。
つまり **AIHints と無関係な赤テストが 1 件でもあると、AIHints の再同期 PR が静かに作られなくなります。**
`develop` 側で赤を放置したままマージしないことが実質的な予防策です（母艦 P4-8 として登録済み）。

## 2. Cloudflare API 自動更新 workflow 失敗（develop, commit 42c7140, 2026-07-13, "Some jobs were not successful"）

状態: ~~**対応不要の可能性が高い（未確定）**~~ → **✅ 対応不要で確定**。失敗コミット以降、develop には多数のDB更新コミットが積まれていますが、以降 Cloudflare 関連の失敗再通知は届いていません。単発の一時的失敗（APIレート制限等）だった可能性が高いですが、Actions実行履歴自体は読み取れないため確定はできません。

> **確定（2026-07-25 棚卸し）**: `gh run list` で直近 run を実測し、`develop`（run `30141699982`・success /
> 8m26s）・`addon-ai-tag`（run `30141803428`・success / 11m12s）とも**成功**を確認。
> ワークフロー側の `concurrency: cf-api-sync-d1-creationsdb` による直列化が効いており、既知の
> D1 import 競合も再発していません。**追跡終了。**

## 3. Deploy Jekyll with GitHub Pages workflow 失敗（develop, commit e1fb60c, 2026-07-16）

状態: **対応不要と判断**。根拠: ローカルgit logで該当コミット以降に多数の後続コミットがあり、以降の失敗再通知もありません。

> **確定（2026-07-25 棚卸し）**: 直近 run `30143189878`（2026-07-25 / develop）が **success**（1m2s）。
> 2026-07-22 のトリアージ §4 が指摘していた「複数リポジトリ横断の Pages 失敗」も、本リポジトリでは解消。
> 他リポジトリの account/repo 設定確認は本リポジトリの管轄外のため**追跡終了**。

## まとめ
- 実コード修正・commit/push は行っていません（読み取り専用の調査のみ）。
- ~~AIHintsワークフローの対応案は提案段階です。適用するかはご判断ください。~~
  → **§1 の対応案は誤った仮説に基づくため、適用しないでください**（2026-07-25 に訂正・上記参照）。

## 棚卸しでの確定結果（2026-07-25 追記）

| 節 | 当初の状態 | 実測後 |
| --- | --- | --- |
| §1 AIHints 構造的再同期 | 未解決の可能性あり・対応案あり | ✅ **解決済み**（原因は `テスト` ステップの赤）。**対応案は不要** |
| §2 Cloudflare API 自動更新 | 対応不要の可能性が高い（未確定） | ✅ **対応不要で確定**（直近 run 成功を実測） |
| §3 Pages デプロイ | 対応不要と判断 | ✅ **確定**（直近 run 成功を実測） |
| （新規）Issue #13 | — | 🟡 **OPEN 継続**（2026-07-21 起票）。母艦 P6 / 台帳 P7 で追跡 |

**現時点で未解決の CI 失敗はありません。** 残る GitHub 側の未解決事項は Issue #13 のみです。
