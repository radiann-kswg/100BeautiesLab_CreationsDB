# 進捗レポート: 創作固有語彙辞書 DB の実装（`#Ref_Vocabulary`）

**日付**: 2026-06-13  
**担当**: Claude Code (扇一春セッション)

---

## 目的

翻訳スタイル統一作業が進む中、「加護 → Numerospec」のような創作固有の造語・固有名詞の英訳が
翻訳者の裁量に依存している問題を解消するため、全作品に JP/EN 対照の語彙辞書 DB を新設する。

---

## 変更点の要約

### 1. グローバル References スキーマ拡張

**`data/References/db_type.json`** に `TermType` フィールドを追加。

```json
{
  "hashTag": "TermType",
  "$type": "#String|#Null",
  "hashTag_JP": "語彙種別",
  "hashTag_EN": "Term Type",
  "$display": { "section": "basic" }
}
```

語彙種別の例: 造語 / 固有名詞 / 地名 / 組織名 / 称号 など（値はユーザー任意入力）

### 2. 全 9 作品 DataBases/db_meta.json に `#Ref_Vocabulary` 登録

各作品の `Databases` セクションに以下を追加（作品固有の `DB_Summary` を設定）:

| 作品 | DB_Summary（JP） |
|------|-----------------|
| Works_NumberTales | ナンバーテールズの創作固有語彙（造語・固有名詞）の日英対照表。 |
| Works_FLInvestigator78 | 運命線探偵78の創作固有語彙（造語・固有名詞）の日英対照表。 |
| Works_ShouArRiders | 獣爾騎兵の創作固有語彙（造語・固有名詞）の日英対照表。 |
| Works_SinisterChangingGirls | 豹変系女子の創作固有語彙（造語・固有名詞）の日英対照表。 |
| Works_UnauthedLogica | アンオースドロジカの創作固有語彙（造語・固有名詞）の日英対照表。 |
| Works_PastDivers | パストダイヴァーの創作固有語彙（造語・固有名詞）の日英対照表。 |
| Works_UnibyteLive | アルベッツの創作固有語彙（造語・固有名詞）の日英対照表。 |
| Works_DestinyFoxRecords | 運命線狐の記録の創作固有語彙（造語・固有名詞）の日英対照表。 |
| Works_Proxies | 代理の創作固有語彙（造語・固有名詞）の日英対照表。 |

### 3. 全 9 作品 References/db_meta.json を整備

- `Works_NumberTales/References/db_meta.json`: 既存ファイルに `#Ref_Vocabulary` を追記
- 残り 8 作品: `References/db_meta.json` を新規作成（`#Ref_Vocabulary` のみ収録）

### 4. 全 9 作品 References/ref_Vocabulary.json（空テンプレート）を作成

すべて `[]` を初期値とする空配列。**内容はユーザーが手動で入力する。**

想定エントリフォーマット（参考）:
```json
{
  "Term": "（日本語語彙名）",
  "Term_EN": "（英語語彙名）",
  "Term_JPReading": "（読み仮名）",
  "TermType": "造語",
  "Category": "（分類）",
  "Summary": "（日本語説明）",
  "Summary_EN": "（English description）",
  "Aliases": [],
  "Links": []
}
```

---

## 技術的な補足

### SW/API コード変更が不要な理由

既存の `resolveDbFilePrefix()` が `#Ref_` プレフィックスを検知して `ref_` を返し、
`resolveDbLayer()` が `DB_Layer: "References"` を検知して `Works_*/References/` パスを解決する。
UI の DB セレクタも `db_meta.json` から自動生成されるため、追加コードは一切不要。

### Works_UnibyteLive DB_Summary バグ修正

前セッションで生じたコピーペーストミス（「アンオースドロジカの...」）を修正:
- `Works_UnibyteLive/DataBases/db_meta.json` → 「アルベッツの...」に訂正
- `Works_UnibyteLive/References/db_meta.json` → 同様に訂正

---

## 影響範囲

- **スキーマ**: `data/References/db_type.json`（`TermType` フィールド追加）
- **DBメタ**: 全 9 作品 `DataBases/db_meta.json` + `References/db_meta.json`
- **データ**: 全 9 作品 `References/ref_Vocabulary.json`（空配列）
- **SW/API/UI コード**: 変更なし

---

## テスト結果

```
Test Files  3 failed | 16 passed (19)
      Tests  6 failed | 102 passed (108)
```

失敗 6 件はすべて今回の変更とは無関係な既存の不具合:
- `data.shape.test.js`: `BelongingArea.$type` / `Works_NumberTales/References/db_type.json` の構造検証（既存）
- `commons.secondaries.test.js`: NumberTales SelfSecondary commons（既存）
- `enrich.dblink.jump.merge.test.js`: `_DBLink._Search` / `_Jump` 解決（既存）

今回の実装による新規テスト失敗: **0件**

---

## 未完了タスク

- 各作品の `ref_Vocabulary.json` へのエントリ入力は **ユーザー手動**
- 既存テスト失敗 6 件の修正（別タスク）

---

## 参考リンク

- `_work_in_progress/2026-06-13_remaining-task.md` — タスク起票元
- `docs/api-sw-spec.md` — SW ルーティング仕様
- `data/References/db_type.json` — グローバル References スキーマ
