# 三人称 UI レンダラー表示バグ修正 — 2026-07-04

## 問題概要

**症状**: NumberTales Primary キャラクター #4 の三人称セクションで、JP と EN のテキストが言語パラメータ（`lang=jp` / `lang=en`）に関わらず**同時に表示される**バグ

**原因**: `data/db_type.json` に `ThirdPersonCalling_JP` / `ThirdPersonCalling_EN` が**別々のスキーマエントリ**として登録されていたため、ページレンダリング処理で両方が独立して検出され、両方とも `sectionBuckets.sub` に追加される

## 修正内容

### ファイル変更: `data/db_type.json`

**修正対象エントリ**: lines 195-235（6 個の suffixed 版エントリを削除し、3 個の base キーに統一）

#### 削除エントリ（suffix 付き）
- `FirstPersonCalling_JP` (line 198)
- `FirstPersonCalling_EN` (line 204)
- `SecondPersonCalling_JP` (line 210)
- `SecondPersonCalling_EN` (line 216)
- `ThirdPersonCalling_JP` (line 222)
- `ThirdPersonCalling_EN` (line 228)

#### 追加エントリ（base キーのみ）
```json
{
  "hashTag": "FirstPersonCalling",
  "$type": "#String|#String_EN|#Summary|#Null",
  "hashTag_JP": "一人称",
  "hashTag_EN": "First Person Calling",
  "$display": { "section": "sub" }
},
{
  "hashTag": "SecondPersonCalling",
  "$type": "#String|#String_EN|#Summary|#Null",
  "hashTag_JP": "二人称",
  "hashTag_EN": "Second Person Calling",
  "$display": { "section": "sub" }
},
{
  "hashTag": "ThirdPersonCalling",
  "$type": "#String|#String_EN|#Summary|#Null",
  "hashTag_JP": "三人称",
  "hashTag_EN": "Third Person Calling",
  "$display": { "section": "sub" }
}
```

## 修正による影響

### ✅ 確認済み修正効果

1. **英語モード** (`lang=en`)
   - 英語テキストのみ表示
   - 例: "that kid, that person · [*by name]"
   
2. **日本語モード** (`lang=jp`)
   - 日本語テキストのみ表示
   - 例: "*の子, *の人 · [※名前呼び]"

3. **双言語統合ロジック**
   - ページレンダラーの既存 `formatBilingualGroup()` 関数が正しく動作
   - JP/EN ペア検出・言語別フィルタリングが自動実行

### 📝 その他の Calling フィールド

今回は `FirstPersonCalling`, `SecondPersonCalling`, `ThirdPersonCalling` の 3 フィールドを修正。将来的に `ForMasterCalling` など別の Calling 型フィールドが追加される場合も、**同じ base キーのみ登録パターンを遵守**してください。

## 検証方法

1. **ページ表示**: `http://127.0.0.1:8000/pages/characters.html?work=NumberTales&db=Primary&num=4&idx=4&idxKey=Num&lang=en`
2. **言語切り替え**: 画面の「言語/Language」ボタンで JP ↔ EN を切り替え
3. **Calling フィールド確認**:
   - 英語モード: First Person / Second Person / Third Person Calling が全て英語表示
   - 日本語モード: 一人称 / 二人称 / 三人称が全て日本語表示

## 技術背景

### 設計意図

- ページ処理 (`pages/characters.js`) の `formatBilingualGroup()` 関数は、スキーマに登録された各エントリをループ処理し、JP/EN ペアを**自動的に検出・統合**する仕様
- 統合後、言語パラメータに基づいて片言語を選択表示

### 前の設計ミス

- 旧スキーマでは Calling フィールドを suffix 付きで個別登録（`*_JP` / `*_EN`）
- これにより、ページループで両方が別エントリとして検出される
- 双言語統合ロジックが発動せず、両方が `sub` bucket に追加されて重複表示

### 修正後の設計

- Calling フィールドを **base キーのみ** スキーマに登録
- `$type` に `#String_EN` を含めて「この field は EN variant を持つ」ことを明示
- ページレンダラーが base キーを見つけ、実データ側の `*_JP` / `*_EN` と照合
- `formatBilingualGroup()` が pair を検出・統合し、言語別に表示

## 関連コード

- `lib/section-renders/calling.js`: Calling 型フィールドの specialized renderer（変更不要、既に JP/EN 対応済み）
- `pages/characters.js` (lines 5977-6050): `formatBilingualGroup()` — 双言語ペア検出・統合ロジック
- `pages/characters.js` (lines 7035-7070): `sectionBuckets.sub` 追加処理
- `data/Works_NumberTales/DataBases/db_Primary.json`: 実データの `ThirdPersonCalling_JP` / `ThirdPersonCalling_EN` フィールド分離（変更不要）

## チェックリスト

- [x] schema 修正（suffix 削除 + base キー作成）
- [x] ページ再読み込み確認
- [x] 英語モード表示確認
- [x] 日本語モード表示確認
- [x] 言語切り替え動作確認
- [ ] 他作品への影響確認（将来: 全 Primary / Secondary DB をスポット確認）
- [ ] テスト case 追加検討（data.shape / sw.enrich テストに Calling 型統合テスト case の追加）

---

**修正者**: 扇一春（Copilot Agent）  
**修正日**: 2026-07-04 JST  
**関連セッション**: calling-renderer-display-fix
