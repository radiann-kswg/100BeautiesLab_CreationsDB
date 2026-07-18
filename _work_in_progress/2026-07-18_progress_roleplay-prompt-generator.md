# 進捗: ロールプレイプロンプト自動生成 ＋ 符号化フィールドの lib 化 (2026-07-18)

## 目的

各創作タイトルの `RoleplayPrompts/` に手書きで蓄積してきた配布用ロールプレイプロンプトを、JSON DB の
`ConversationPattern` を中心としたキャラ設定フィールド＋機械可読テンプレートから半自動生成する。あわせて、
呼称 DSL / GenderType・RaceType / TailsUnit のデコードを `lib/` へ集約し、UI・SW・pkg・生成ツールで共用する。

## 変更点の要約（フェーズ0〜3、完了分）

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

### フェーズ2: 見出しアンカー方式のセクション単位マージ更新
- `tools/roleplay/sections.mjs`（新規・純関数）… `splitSections` / `mergeByHeadings` / `diffSections`。
  マーカー撤去済みのため見出し文字列をアンカーにセクション識別。テンプレ由来見出しは DB 最新で上書き、
  手書き独自見出しは直前の管理見出しをアンカーに位置保全（独自見出し無しは生成物そのまま＝完全冪等）。
- build 配線: 既存の再生成を「保護スキップ」からマージ更新へ。一時 → rename のアトミック書き込み＋
  `.cache/roleplay-backups/` 退避。`--force` は丸ごと再生成の脱出口。旧 `markers.mjs` は削除。
- **シバン除去（横断）**: `tools/build-roleplay-prompts.mjs` 先頭のシバンが vitest 4.1.0 で
  `tests/data.roleplay-prompts.test.js` を suite ごと SyntaxError にしていた（サブローカル `addon-ai-tag`
  で先行検出）。`develop` は source of truth のため develop 側にも 1 行削除を適用（`CHANGELOG.md` に `fix:` 追記）。

### フェーズ3: `.private/` 手書きプロンプトの差分・取り込み
- `--reconcile` … `.private/<id>` と DB 生成のドリフト差分のみ表示（読み取り専用・書き込み無し）。
- `--adopt` … 「DB 由来＝最新化／手書き独自＝保全」した管理版を生成場所へ書き出す（既定 dry-run、
  `--adopt --write` で書き込み）。原本 `.private/` は不変。パス移行（旧 `Num/57/…`）は対象消滅のため N/A。
- 非対称: テンプレは性格を概要へ畳み込むため、手書き `## 性格` 独立節は adopt 後に重複しうる（User 手動整理）。

## テスト・確認
- `npm test` — 41 ファイル / 546 件すべて成功（フェーズ0〜1 の 534 ＋ フェーズ2/3 の sections 10・実データ回帰 2）。
- 新規テスト: `tests/{calling-common,type-common,roleplay-render,roleplay-sections,data.roleplay-prompts}.test.js`。
- 開発環境（`http://127.0.0.1:5500/pages/characters.html`）で呼称系・GenderType・TailsUnit の表示回帰なしを
  User が目視確認。

## 合意事項（運用ルール）
- **複数キャラの描写が絡む記述は User の手動入力判断**とする。生成ツールは「そのキャラ単体で確実な情報」
  だけを組み立て、関係性・他キャラ言及は自動生成しない（`docs/roleplay-prompt-generation.md` に明記）。
- 生成物は叩き台、既存の実運用プロンプト（手書き・DB由来）が正。既存は生成場所で保護（`--force`
  以外では上書きしない）。

## 未完了タスク（後続フェーズ）
- **フェーズ4**: EN 版（`roleplay-prompt.tpl.en.md`・`RoleplayPrompts_EN/`・`--lang=en`）。

## 参考
- 仕様: `docs/roleplay-prompt-generation.md`
- CHANGELOG: 2026-07-18 エントリ
