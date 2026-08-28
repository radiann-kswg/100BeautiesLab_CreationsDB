# フォーク構造 — 上流としての責務

本リポジトリは 3 リポジトリ構成の**最上流**です。ここでのフレームワーク変更は下流 2 本へ波及します。

```
100BeautiesLab_CreationsDB   (本リポジトリ / public / 一次創作 DB・フレームワークの実開発地)
            │
            │  フレームワーク部分だけを流す
            ▼
JsonCharacterDB-Framework    (public / CC BY-NC 4.0 / 創作データを持たない汎用フレームワーク)
            │
            │  フレームワーク部分だけを流す
            ▼
RadianNs_SecondaryWorksDB    (private / 二次創作 DB)
```

**一方向のみ**です。下流でフレームワークのバグが見つかった場合も、**修正は本リポジトリで行い**、
そこから流し直します。下流で直接直すと次回の同期でコンフリクトになります。

同期の仕組み（ベンダーブランチ方式・マニフェスト・点検ワークフロー）は**下流側**に実装されています。
本リポジトリには同期スクリプトはありません（流し込む先が無いため）。
詳しくは `JsonCharacterDB-Framework` の `docs/fork-sync.md` を参照してください。

---

## 上流として守ること

### 1. フレームワーク部分と創作データを同じコミットに混ぜない

下流は**パス単位**で取り込む対象を選びます（`lib/` `pages/` `tools/` `tests/` `pkg/` `svc/` `api/` `docs/`）。
1 コミットに `lib/data-common.js` の修正と `data/Works_NumberTales/**` の更新が同居していても
取り込み自体は動きますが、**下流の履歴とレビューが読みにくくなります**。
分けられるときは分けてください。

### 2. 下流へ波及する変更は `CHANGELOG.md` に明記する

下流の定期点検（毎週月曜）は「どのファイルが変わったか」までは自動で出せますが、
**「なぜ変わったか / 取り込むべきか」は出せません**。その判断材料は CHANGELOG が唯一の情報源です。

特に次の変更は、理由と影響範囲を書いてください。

- `db_type.json` / `db_meta.json` の仕様変更
- Service Worker のルーティング・`_enrichment` の出力形状の変更
- `lib/` の共通処理シグネチャの変更
- `pages/characters.js` の表示仕様の変更

### 3. 本リポジトリ固有の資産は下流から除外されている

下流のマニフェストで既に除外済みです。追加・改名したときは下流の除外リストの更新が要るかもしれません。

| 資産 | 例 |
| --- | --- |
| 創作データ | `data/**` |
| カレンダー同期 | `tools/build-calendar-ics.mjs` `tools/sync-calendar-gcal.mjs` `calendar/` |
| データ補正スクリプト | `tools/patch-*.mjs` `tools/normalize-callings.mjs` `tools/inject-conversation-patterns.mjs` |
| 独自ドメイン | `CNAME` |
| 用語集（創作固有語） | `docs/localization-glossary-quickref.md` |

**不変則**: 上記のツールを追加したら、そのテストも下流で除外される必要があります。
対になっていないと下流の `npm test` が壊れます。

## 依存関係の定期更新（Dependabot）

`.github/dependabot.yml` で **npm**（リポジトリ直下 / `pkg/mcp`）と **GitHub Actions** を
毎週月曜 09:00 JST に更新チェックします。3 リポジトリで同じ方針を採っています。

脆弱性由来の security updates は本ファイルが無くても GitHub 側で動きます。
ここで設定しているのは定期のバージョン追従のほうです。
