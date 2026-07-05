# dict_Triples.json クラス再編成（133エントリ → 30エントリ）

## 目的

`data/Works_NumberTales/Dictionaries/dict_Triples.json`（3桁番号キャラクターの `Class` 辞書）が100種類超に肥大化していたため、数秘術・エンジェルナンバーの観点（数字和/フェイディック・アディション、ゾロ目の有無、数字の組み合わせ）を尊重しつつ20〜30クラスに再編成した。

方針の詳細・判断根拠は Plan mode で作成した計画ファイルを参照:
`C:\Users\s-chi\.claude\plans\data-works-numbertales-dictionaries-dic-fuzzy-treasure.md`

---

## 変更点の要約

### 1. `dict_Triples.json` の全面書き換え（133エントリ → 30エントリ）

- Tri-Digit Singles（x00/xx0/x0x）: 3クラスのまま維持。タイポ重複（`サイドシングルス`/`サイドシングルズ`）を解消、`マスターテンズデュアルズ9`の不要な数字接尾辞を削除。
- Tri-Digit Duals（xy0テンズ + x0y サイド）: ゼロの位置区分を廃止し、数字和(mod9)基準の9クラスに統合（`トライデュアル{スリーズ〜エイツ,キャリーズ,イレブンズ}` + `ナインズトライデュアルズ`）。並び順違いの重複バグ（`ナインズサイドデュアルズ`/`サイドナインズデュアルズ`）も解消。
- デュオトリプル（2つ同じ数字）: 甲/乙/丙（はぐれ数字の位置）区分を廃止し、数字和(mod9)基準の9クラス（`デュオトリプル1型`〜`9型`）に統合。重複エントリ（3型甲組・9型甲組の二重登録）も解消。
- トリプル（3つとも異なる数字）: 84クラス（`トリプルX+Y+Z組`）を数字和(mod9)基準の9クラス（`トリプルキャリーズ`/`イレブンズ`/`スリーズ`〜`エイツ`/`ナインズ`）に統合。最大の肥大化要因だった箇所。

いずれも新語の創作ではなく、既存の命名パターン（`dict_Class.json` の2桁番号Dualsの「サム/キャリーズ/ナインズ」命名規則）をそのまま流用したドラフト名。

### 2. 実キャラクターデータ900件超の `Class` フィールド再割り当て

対象ファイル: `db_SemiPrimary.json`（22件）、`db_SelfSecondary.json`（71件）、`db_UnprocessedSecondary.json`（785件）。合計878件を新クラス名へ機械的に再割り当て。

- ゾロ目（111〜999、20件）は対象外（`dict_Class.json` の「マスタートリプル」のまま、変更なし）。
- `dict_Class.json` 由来の副次タグ（ナルシシスツ、フェイタルテールズ、ワノマチ、キャレ型ハイナンバーズ等）はそのまま保持し、`dict_Triples.json` 由来のタグのみ置換。
- 特殊な "HighNumbers" 系レコード（`125-cub`/`169-sq` 等、平方数・立方数バリアント）は元々 `dict_Triples.json` 由来のタグを持っていなかったため対象外（10件、想定通り）。

再割り当てに使用した判定ルール（決定的アルゴリズム、実データ900件全件で0件不一致まで検証済み）は計画ファイル §6 を参照。

---

## 影響範囲（編集ファイル）

- `data/Works_NumberTales/Dictionaries/dict_Triples.json`（全面書き換え）
- `data/Works_NumberTales/DataBases/db_SemiPrimary.json`（Class再割り当て、22件）
- `data/Works_NumberTales/DataBases/db_SelfSecondary.json`（Class再割り当て、71件）
- `data/Works_NumberTales/DataBases/db_UnprocessedSecondary.json`（Class再割り当て、785件）

---

## 検証結果

- `npm test`（Vitest）: 22ファイル・178テスト全て成功
- 3桁番号スコープの全947レコードについて、`Class` 配列の全要素が新 `dict_Triples.json` または既存 `dict_Class.json` に実在するクラス名と一致することを機械検証（不一致0件）
- 新クラスごとの所属数を集計し、概ね均等（9クラスあたり9〜28件程度）であることを確認
- 名前付きキャラクター96件（55件の想定より多く、開発版/量産版/派生バリアントを含む）を目視でスポットチェックし、旧「型」番号・数秘的な数字和との整合を確認（例: 121(エルフェルト)=1+2+1=4→デュオトリプル4型、369(ミロク)=3+6+9=18→root9→トリプルナインズ、153(ヒゴミ)=1+5+3=9→トリプルナインズ）

### 既知の事前不整合（今回のスコープ外・変更なし）

- `db_SemiPrimary.json` の `777.Jackpot` レコードは元々 `Class` フィールド自体が未設定（`undefined`）。今回の再編成が原因ではなく、既存のデータ欠落。Userにて別途対応済み。

---

## 未完了タスク

- 本再編成で導入した新クラス名（`トライデュアル*`、`デュオトリプルN型`、`トリプル*`）はドラフト案。最終的な日本語表現・英訳のUser確認・採否待ち。

## 補足

- 一時検証スクリプト（`.cache/reassign_triples_class.mjs`, `.cache/verify_class_values.mjs`, `.cache/spotcheck_named.mjs`, `.cache/old_dict_triples.json`）は `.gitignore` 対象の `.cache/` 配下に格納（Git管轄外）。
