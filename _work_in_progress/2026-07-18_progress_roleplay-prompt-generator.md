# 進捗: ロールプレイプロンプト自動生成 ＋ 符号化フィールドの lib 化 (2026-07-18)

## 目的

各創作タイトルの `RoleplayPrompts/` に手書きで蓄積してきた配布用ロールプレイプロンプトを、JSON DB の
`ConversationPattern` を中心としたキャラ設定フィールド＋機械可読テンプレートから半自動生成する。あわせて、
呼称 DSL / GenderType・RaceType / TailsUnit のデコードを `lib/` へ集約し、UI・SW・pkg・生成ツールで共用する。

## 変更点の要約（フェーズ0＋1、完了分）

### フェーズ0: 符号化フィールドのデコードを `lib/basic-renders/` へ集約
- `lib/basic-renders/calling-common.js`（新）… 呼称 DSL の純パーサ `parseCalling` / 整形 `formatCallingText`。
- `lib/basic-renders/type-common.js`（新）… enum/辞書ラベル解決を `pages/characters.js` から移設。
- `lib/section-renders/calling.js` は DOM 描画のみに縮小。`characters.js` の 5 関数は `globalThis.TypeResolver`
  への薄いラッパへ（呼び出し箇所不変）。
- `pages/characters.js` の `resolveBasicField` に呼称系デコードのフックを追加（基本情報テーブルの三人称
  生 DSL 表示を解消）。
- SW/pkg 側の配線: 呼称系・型解決は sw-common/data-common で未使用のため SW 配線は不要。生成ツールは
  lib を side-effect import。

### フェーズ1: 生成ツール本体＋3作品テンプレ
- `tools/build-roleplay-prompts.mjs`（CLI）/ `tools/roleplay/render.mjs`（テンプレエンジン）/
  `tools/roleplay/markers.mjs`（マーカーユーティリティ・フェーズ2 用の下地）。
- `CreationsDBClient.resolveIndexPathRoles()` を `pkg/nodejs/index.mjs` に追加（出力パスの宣言的判定）。
- 3 作品テンプレ（NumberTales / FLInvestigator78 / DestinyFoxRecords）。全 50 レコード生成・エラー 0。
- 生成品質（User フィードバック反映済み）: 統一書式の命令文・役割／自然文の概要（キャラ単体・他キャラ
  言及なし）／呼称系の展開／複数名「または」連結／object・hideText 対処／型番インラインコード／口調の
  文分割＋観点追加／マーカー無しのクリーン Markdown。

## テスト・確認
- `npm test` — 40 ファイル / 534 件すべて成功（フェーズ0 の 504 ＋ 新規 30）。
- 新規テスト: `tests/{calling-common,type-common,roleplay-render,data.roleplay-prompts}.test.js`。
- 開発環境（`http://127.0.0.1:5500/pages/characters.html`）で呼称系・GenderType・TailsUnit の表示回帰なしを
  User が目視確認。

## 合意事項（運用ルール）
- **複数キャラの描写が絡む記述は User の手動入力判断**とする。生成ツールは「そのキャラ単体で確実な情報」
  だけを組み立て、関係性・他キャラ言及は自動生成しない（`docs/roleplay-prompt-generation.md` に明記）。
- 生成物は叩き台、既存の実運用プロンプト（手書き・DB由来）が正。既存は生成場所で保護（`--force`
  以外では上書きしない）。

## 未完了タスク（後続フェーズ）
- **フェーズ2**: セクション単位マージ更新（見出しアンカー方式）。DB 由来セクションのみ更新し、手書き追記を保持。
- **フェーズ3**: 既存の実運用プロンプト（`.private/` 退避分・旧配置分）の adopt / 新配置パスへの移行。
- **フェーズ4**: EN 版（`roleplay-prompt.tpl.en.md`・`RoleplayPrompts_EN/`・`--lang=en`）。

## 参考
- 仕様: `docs/roleplay-prompt-generation.md`
- CHANGELOG: 2026-07-18 エントリ
