# 2026-06-24 進捗: 英訳ルール突き合わせと追補

## 目的
`data/**` の実 `_EN` フィールドを走査し、`docs/localization-en-rules.md` の英訳ルールを実データに追従させる（ドキュメントのみ編集 / `data` 不変更）。

## 変更点の要約（`docs/localization-en-rules.md` のみ）
- §0-1「JP/EN キーの命名規約」を新設。実データは大多数が `field_JP`/`field_EN` ペア型、`Comments` のみ plain、`value`/`about` は移行中混在、という事実を明記。
- §3 にフィールド別ルールを追補: §3-10 FormalName/Name, §3-11 ModelName, §3-12 SPCodeName（標準英数詞・CodeName と別方式）, §3-13 Motif（Motif_JP/Motif_EN 入れ子）, §3-14 Mark系3種, §3-15 Strength/Weakness, §3-16 DayAbout, §3-17 AdditionalDesigned, §3-18 Unit。
- §3-3-9 表に UnibyteLive 行（ThirdPersonCalling なし）を追加。
- §4: 4-2 EffectText_EN を「辞書(db_meta $VarsDef) 由来の enum」と訂正、4-4 に ChronospecAbout_EN/Career_EN、4-6 UnauthedLogica(LogicspecAbout_EN) 新設、4-7 UnibyteLive 新設（配信系フィールド）。

## 影響範囲（編集ファイル）
- `docs/localization-en-rules.md`（561 → 708 行）

## 検証
- 見出し連番・重複なし（§0〜§8 各 1）、コードフェンス偶数、バッククォート均衡を確認。
- 追記内容はすべて実データの和英ペア実例に裏付け（推測ルールなし）。

## 第2セッション追記（2026-06-24 継続）

### 追加で実施した内容

#### A. CLAUDE.md / copilot-instructions.md への UnibyteLive 追加
- 作品シリーズ一覧に `ハンカクライブ (UnibyteLive)` を `db_meta.json` 並び順（4番目）で挿入
- `CLAUDE.md`・`.github/copilot-instructions.md` の両ファイルを更新

#### B. *Calling フィールド整合性チェック（全 DB 走査）

**`*いつ`/`*れ` 系の EN 展開誤り（確定修正 7 件）**

| ファイル | レコード | フィールド | 修正内容 |
|---|---|---|---|
| NT db_Primary | Num 64 | SecondPersonCalling_EN | `[*third-person form]` → `[*third-person calling]` |
| NT db_Primary | Num 93 | ThirdPersonCalling_EN | `*person` → `that/this one (*no hito)` |
| NT db_Primary | Num 93 | ForMasterCalling_EN | `[*same as second-person]` → `[*second-person calling]` |
| NT db_Primary | Num 96 | ThirdPersonCalling_EN | `[*changes by situation]` → `[*Varies depending on the situation]` |
| NT db_Primary | Num 96 | FirstPersonCalling_EN | 同上 |
| SA db_Primary | 子刻ハッカ | ThirdPersonCalling_EN | `(as personal or objective)` → `(as objective)` |
| SCG db_Primary | 九 叶 | ThirdPersonCalling_EN | `(as personal)` → `(as personal or objective)` |

**要手動確認（全件解消 2026-06-25）**

| レコード | フィールド | 対応 |
|---|---|---|
| NT Num 42 (ヨツグ) | ThirdPersonCalling_EN | ✅ User 修正済み（セグメント数を JP に合わせて修正） |
| NT Num 56 (イソロク) | ThirdPersonCalling_EN | ✅ User 修正済み（デリミタ統一） |
| NT Num 11 (トウイチ) | SecondPersonCalling_EN | ✅ User 修正済み（区切り記法を JP に統一） |
| SA 巳刻カミツ | ThirdPersonCalling_EN | ✅ 確定: `*やつ/*れ` は分離せず `(as personal or objective)` に統一する方針で意図的表記 |
| SA 辰刻リウロン | ThirdPersonCalling_EN | ✅ 同上（`*いつ/*れ` → `(as personal or objective)` 統一） |
| SA 午刻ハヤテ | ThirdPersonCalling_EN | ✅ 同上（`*イツ/*レ` → `(as personal or objective)` 統一） |

#### C. `lib/section-renders/calling.js` レンダラー新規実装

`*Calling_JP/EN` フィールドを人間可読形式に変換する standalone subField レンダラーを実装。

**仕組み**
- `$display.section: 'sub'` を Calling 系フィールドのスキーマ定義に追加 → 既存の bilingual merge 処理で `sectionBuckets.sub` に入り `renderStandaloneFieldSection` → `renderWithRegisteredSectionRenderer` に流れる
- `match`: `/[A-Za-z]Calling(?:_(?:JP|EN))?$/` で自動検出（`$display.sectionWrapper` 指定不要）
- デリミタ階層: `\n`（コンテキスト行）> `;`（カテゴリ）> `/`,`,`（代替形）
- `*いつ/*れ` 系こそあど記法 → ツールチップ付き展開バッジ（`.calling-tok--demo`）
- `[※xxx]`/`[*xxx]` 参照記法 → スタイル付き参照バッジ（`.calling-tok--ref`）
- `?lang=` 空（両言語）の場合は `preWrapText` フォールバック（bilingual UI は将来実装）

**変更ファイル**

| ファイル | 変更内容 |
|---|---|
| `lib/section-renders/calling.js` | 新規作成 |
| `pages/characters.js` | `import '../lib/section-renders/calling.js'` 追加（dblink.js の次） |
| `pages/characters.sass` | `.calling-value` / `.calling-ctx` / `.calling-tok` 等スタイル追加 |
| `data/db_type.json` | First/Second/ThirdPersonCalling JP/EN に `$display.section: 'sub'` 追加 |
| `data/Works_NumberTales/DataBases/db_type.json` | ForMasterCalling JP/EN に同上 |
| `data/Works_FLInvestigator78/DataBases/db_type.json` | For79th/80thDealerCalling JP/EN を `profile` → `sub` に変更 |
| `data/Works_UnauthedLogica/DataBases/db_type.json` | ForMasterCalling JP/EN に `$display.section: 'sub'` 追加 |

**テスト**
- `npm test`（Vitest）で既存 3 件の失敗は今回の変更と無関係の事前失敗（`零 零` の `_DBLink` 構造問題・FLI PrimaryDealer のカードデータ問題・`ref_Glossary.json` 欠損）
- 新規テストケースは未追加（callingSection のユニットテストは今後の課題）

## 未完了 / 申し送り
- `docs/readme.en.md` は別件で内容が旧い（Cloudflare Workers 実 API 未記載・`_DBLink` 旧形式）。英訳フィールドルールとは別レイヤーのため本作業では未対応。
- 上記「要手動確認」6 件は User による内容精査・修正が必要
- `calling.js` のユニットテスト・UI 動作確認は 2026-07-29 に完了（以下）。
	- `tests/section-renders.calling.test.js` を追加（登録・JP描画・フォールバック）
	- `tests/section-renders.calling.test.js` + `tests/calling-common.test.js` 実行結果: 16 件成功
	- ローカル UI 実測: `pages/characters.html?c=SinisterChangingGirls/Primary/Drc:SW&lang=jp` で Calling 描画確認
- 注: Windows マウントの書き込み遅延により編集が一時 495 行で切れたが、再結合・再書き込みで復旧済み。
