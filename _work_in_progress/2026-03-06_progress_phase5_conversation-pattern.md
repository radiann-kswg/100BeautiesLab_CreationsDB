# 2026-03-06 進捗ログ: 希望タスク フェーズ5（追加コンテンツ）- 大規模-3 会話パターン情報追加（要件定義・手順整理）

## このログの目的（このセッションの最初にやること）

- 2026-02-21 / 2026-03-04 の資料に基づき、「会話パターン情報追加（大規模-3）」の要件を明文化する。
- 実装に入る前に、**Copilot がやる範囲 / User がやる範囲**、および安全策（誤生成・ライセンス等）を整理する。
- 次工程（スキーマ追加 → API/SW 反映 → テスト → 運用）を、戻しやすい順序で手順化する。

## 参照資料（根拠）

- `_work_in_progress/2026-03-04_progress_phase5-prompt.md`
- `_work_in_progress/2026-03-04_remaining-task.md`
- `_work_in_progress/2026-02-21_remaining-task.md`

## 指示の要点（資料から「すべての指示」を抽出して整理）

### A. フェーズ5共通の注意事項（必須）

- Copilot の自動生成は **補助**に留め、**User 手動入力が主体**（創作者の意図しない設定生成リスクの回避）。
- DB 収録物は「CC BY-NC 4.0」を前提とし、**ライセンス違反や第三者利用ガイドラインに抵触する機能実装は避ける**。

### B. 大規模-3（会話パターン情報追加）の目的

- キャラDB項目として、会話パターン（例: 口調、話す内容の傾向、会話の趣向や頻度）を追加する。
- アプリ（API/SW）側で活用可能にし、二次創作や「LLMへの指示プロンプト生成」等の運用を容易にする。

### C. Copilot が対応すべき範囲（会話パターン関連）

- DB 構造（フィールド/オブジェクト構造）を設計・提案し、命名規則に沿ってスキーマへ反映できるようにする。
- API/SW 側で会話情報を扱えるようにする（ただし複雑化させない、かつガイドライン違反につながる機能は避ける）。
- Copilot 指示書の推敲（会話パターン追加により「意図しない生成を避ける」注意を明文化）。

### D. User が対応すべき範囲（会話パターン関連）

- DB 本体（`db_**.json`）の「値」（口調や台詞、設定本文等）の入力は **User 主体**。
- 提供精度の監修（DB値だけでなく、将来の prompt 提供・機能提供の精度も含む）。
- ライセンス/ガイドラインの最終決定（必要に応じて文書整備の判断）。

## 今回のセッションの要件定義（会話パターン情報追加）

### 1) 目的（What）

- キャラクターに「会話の傾向/口調/頻度/話題嗜好」等の情報を格納できるようにし、API/SW がそれを **構造化データとして取得可能**にする。

### 2) 非機能要件（How / Safety）

- **創作内容の生成（会話文・設定文・ストーリー等）は行わない**（Copilot も提案/自動生成を極力しない）。
- DB の値は User が手動で投入する前提のため、実装は「入力しやすいスキーマ」「壊れにくい取り回し」「欠損耐性」を重視。
- 追加処理は API/SW を過度に複雑化させない（まずは “保存→配信→表示/検索” の最小ループ）。

### 3) スコープ（このセッションで扱う範囲）

- 対象: 「フェーズ5 大規模-3 会話パターン情報追加」
- 具体:
  - スキーマ（`db_type.json`）への定義追加（どの作品/どのDBにどう追加するかの方針確定）
  - API/SW が新フィールドを **壊さず**返すこと（既存 enrich/search に悪影響を出さない）
  - 可能なら: 表示（`pages/characters.html`）で既存の仕組みに乗せて見える状態

### 4) スコープ外（明示的にやらない）

- `db_**.json` の各キャラの「会話パターンの中身（本文）」の自動生成・自動補完。
- 会話文の自動生成、または第三者が無制限にキャラ再現を行えるような “生成” API。
- 作品未着工タイトル（`Works_PastDivers` 等）の本体入力（フェーズ5中小-4）。

## データ設計（スキーマ）方針案（暫定）

> 目的は「User が手入力しやすく」「UI/API が壊れずに扱える」こと。
> まずは自由記述中心（`#Summary`/`#String`）で開始し、必要なら後から enum 化する。

### 方式: 既存の `$DefType` に「会話パターン」フィールドを追加

- トップレベルに `ConversationPattern`（仮）を 1 フィールド追加し、内部にサブ項目を持たせる（`AbilityStats` の定義方式と同様）。
- UI 側の自動分類（`$display.section`）に合わせ、`profile` など既存セクションへ割り当てる（新セクション追加は避ける）。

### `ConversationPattern` 配下の最小サブ項目案（例）

- `TalkingTone`（口調）: `#Summary|#Null`
- `TopicPreference`（話題嗜好）: `#Summary|#Null`
- `TalkFrequency`（会話頻度）: `#Summary|#Null`
- `PreferredTopics`（やりがちな話題）: `#Summary|#Null`
- `AvoidedTopics`（避けがちな話題）: `#Summary|#Null`
- `ConversationNotes`（会話における補足）: `#Summary|#Null`
- `DialogueExamples`（台詞の例）: `#Summary[]|#Summary_withAbout[]|#Null`

※ `DialogueExamples` は User 提案に基づき追加した。値は User 手動入力を前提とし、Copilot は本文自動生成を行わない。

#### フィールド名の整合メモ（2026-03-07）

- 実装と進捗ログは、User 提案ベースの名称へ統一した。
- 採用した修正
  - `DoTalk` → `PreferredTopics`
  - `DontTalk` → `AvoidedTopics`
  - `TopicPreference` の日本語表示: 「話題提供の傾向」→「話題嗜好」
- 補足
  - `PreferredTopics` / `AvoidedTopics` は、旧名称より意味が明確で、将来的な API/UI の読解性にも有利。

### 命名に関する注意

- データ側のキー（レコードフィールド）は、既存の慣例に合わせて **プレフィックスなし**（例: `ConversationPattern`）を推奨。
- `$` / `#` / `_` は予約語・宣言に関わるため、会話本文のような「コンテンツ値」に近いものへ乱用しない。

## API/SW 実装方針（暫定）

### 最小要件

- 既存の取得・enrich・search の流れを壊さずに、新フィールドをそのまま返せること。
- 追加処理が必要な場合も、typedef-driven の仕組み（`db_type.json`）に寄せ、ハードコードを避ける。

### “プロンプト生成” についての扱い（当面の安全策）

- 「LLM への指示プロンプト生成」は、資料上は“運用例”であり、実装はリスクがある。
- 当面は「自然言語の prompt を生成する API」を作らず、代わりに以下のいずれかに留める案を優先:
  - (案1) 会話パターン情報を **構造化 JSON として返す**（利用者が自己責任で prompt 化）
  - (案2) prompt テンプレートの “枠” だけ返す（固定文 + DB の抜粋）※新規文の創作はしない

## 取り掛かるべき手順（着手順の整理）

### Step 0: 既存仕様の確認（短時間で済ませる）

- work 別 `db_type.json` とルート `data/db_type.json` の優先順位（どちらを UI/API が参照しているか）を確認。
- `pages/characters.js` の `$display.section` の分類仕様（`basic/profile/spec/other`）に合わせ、会話項目の割当を決める。

#### Step 0 確認結果（2026-03-06）

- typedef の取得経路（UI）
  - `pages/characters.js` は `api('v1/typedef/global')` と `api('v1/works/{work}/typedef')` を呼び出す。
  - `api()` は `API_BASE_REL`（既定は `../pages/`）を基準に URL を作るため、通常は `/pages/v1/...` 系の SW ルート経由で取得する。
  - SW 登録のフォールバックにより、状況によっては `../svc/` → `../api/` を基準にする可能性がある（広告ブロッカー回避）。

- typedef の参照優先順位（UI）
  - フィールド型マップ: `buildFieldTypeMap(work, global)` は **work → global の順に取り込み**、同一キーは後勝ちしない（= work が優先、global はフォールバック）。
  - フィールド表示ヒント（$display）: `buildFieldDisplayMap(work, global)` も同様に **work が優先**。
  - トップレベル表示順: `extractTopLevelSchemaFields(work, global)` は **work を先に列挙**し、同名キーは global 側を追加しない（= work が優先）。
  - 備考: UI は `Images` キーをトップレベル自動表示の対象から除外（ギャラリー処理が担当）。

- typedef の参照優先順位（SW/共通ライブラリ）
  - `lib/sw-common.js` では、グローバルを `/data/db_type.json`、作品別を `/data/Works_*/DataBases/db_type.json` として読み込む実装がある。
  - `lib/data-common.js` の `TypeDefUtils.mergeDefTypes(global, work)` は、**順序は global を優先しつつ、同名エントリは work 側で上書き**する（= work 優先・global 順序維持）。

- `$display.section` の分類仕様（UI）
  - UI の正規化関数は `basic | profile | spec | other` のみを許容し、それ以外は未指定扱い。
  - 未指定時のフォールバックは、概ね「Summary 系は profile、それ以外は other」。
  - `Images` は左カラムのギャラリー担当のため、この自動分類には出さない。

- `$display.section` の分類仕様（SW/共通ライブラリ）
  - `TypeDefUtils.pickDisplaySection(entry)` は `basic | profile | spec | images | other` を扱い、
    明示指定（`displaySection` または `$display.section`）がなければ `hashTag` や型から推定する。

### Step 1: スキーマ追加（typedef）

- `ConversationPattern`（仮）を `db_type.json` に追加し、最小サブ項目を定義。
- `hashTag_JP`（表示名）を付与し、表示/検索の挙動は typedef-driven に寄せる。

#### Step 1 実施内容（2026-03-06）

- 追加先: `data/db_type.json`（全作品共通の `$DefType`）
- 追加キー: `ConversationPattern`
- 表示分類: `$display.section = 'profile'`
  - 理由: UI（`pages/characters.js`）の自動分類が `basic/profile/spec/other` のみ許容するため。
- サブ項目（最小）
  - `TalkingTone`（口調）: `#Summary|#Null`
  - `TopicPreference`（話題嗜好）: `#Summary|#Null`
  - `TalkFrequency`（会話頻度）: `#Summary|#Null`
  - `PreferredTopics`（やりがちな話題）: `#Summary|#Null`
  - `AvoidedTopics`（避けがちな話題）: `#Summary|#Null`
  - `ConversationNotes`（会話における補足）: `#Summary|#Null`
  - `DialogueExamples`（台詞の例）: `#Summary[]|#Summary_withAbout[]|#Null`

※本セッションでは「会話本文の自動生成」は避ける方針を維持し、`DialogueExamples` の値は User 手動入力を前提とする。

### Step 2: API/SW での取り回し確認

- 新フィールドが欠損でも落ちない（`null`/未定義耐性）。
- enrich/search の対象に含める/含めないの方針を決める（まずは “表示はするが検索には入れない” などの段階導入も可）。

#### Step 2 実施内容（2026-03-07）

- 確認結果
  - API/SW 側の enrich では、typedef に存在していてもレコード値が `undefined` のフィールドは安全にスキップされる。
  - UI 側の詳細表示では、typedef 上に子フィールド定義がある object 値は子項目ごとに展開表示されるため、`ConversationPattern` は存在時も `[object Object]` になりにくい。
  - `/search` API は `hashTag` / `key` による構造検索であり、一覧 UI の自由検索も名前系フィールド中心のため、現状の検索導線へ直接は影響しない。

- 方針決定
  - `ConversationPattern` は **表示対象には含めるが、検索インデックス（`searchableText`）には含めない**。
  - 理由: 会話パターン情報は自由記述が中心であり、初期段階から全文検索対象にするとノイズや意図しない露出が増えやすいため。

- 実装反映
  - `data/db_type.json` の `ConversationPattern` に `"searchable": false` を追加した。
  - これにより enrich 時の `searchableFields` から `ConversationPattern` が除外され、ネスト下の会話情報は `searchableText` に投入されない。

- テスト方針
  - 欠損時に enrich が失敗しないこと。
  - 値が存在する場合は `displaySections.profile` に分類されること。
  - 値が存在しても `searchable:false` により `searchableText` へ混入しないこと。

- 検証結果
  - `tests/conversation-pattern.test.js` を追加し、欠損耐性・表示分類・検索除外を確認した。
  - 併せて `tests/data.shape.test.js` / `tests/data.sanity.test.js` / `tests/sw.enrich.basic.test.js` / `tests/enrich.dblink.jump.merge.test.js` を再実行し、回帰がないことを確認した。

#### `#Summary[]|#Summary_withAbout[]|#Null` 対応確認（2026-03-07）

- 確認した点
  - API/SW 側では、`searchable:false` により `DialogueExamples` を検索インデックスから除外できる。
  - `#Summary_withAbout` の値形式としては、既存の `{ value, about_JP/about_EN/about }` パターンが利用可能。
  - ただし、現行実装のままでは `ConversationPattern.DialogueExamples` のような **ネストした array union 型**は enrich 正規化で自動配列化されなかった。
  - また、UI 側の Summary 配列表示は既定でカンマ連結のため、台詞例のような複数本文では見づらい。

- 追加対応
  - `lib/data-common.js`: typedef にネストされた子フィールドまで再帰的に正規化するよう補強した。
  - `pages/characters.js`: `#Summary` 系の配列は改行区切りで表示するよう補強した。
  - `docs/db-update-guidelines.md`: `#Summary_withAbout[]` の想定値形式と union 例を追記した。
  - `tests/conversation-pattern.test.js`: 単体オブジェクト入力が `DialogueExamples` 配列へ正規化されることを追加検証した。

### Step 3: テスト（最低限）

- `npm test` を通し、既存テストの回帰がないことを確認。
- 必要なら、typedef の追加に伴う shape テスト更新、または会話パターン用の小テストを追加（仕様が固まった範囲で）。

### Step 4: 運用（User 手動入力フロー）

- User が `db_**.json` に会話情報を追記するための「入力ルール」（最小例、null の扱い、箇条書き推奨など）を短く文章化。
- 値の内容は User が監修し、意図しない公開にならないよう注意。

### Step 5: ドキュメント/指示書の追記

- `.github/copilot-instructions.md` に、会話パターン追加に伴う「生成禁止/補助限定/値は User 手動」方針を追記。
- 重要な仕様変更として扱う場合は `CHANGELOG.md` への追記も検討（実装を行ったタイミングで）。

#### Step 5 実施内容（2026-03-07）

- `.github/copilot-instructions.md` に「会話パターン情報追加時の運用制約（重要）」を追記した。
- 追記した要点
  - 会話パターン情報の値は User 手動入力・監修を原則とする。
  - 会話例、台詞本文、未公開設定、創作世界の固有用語、ストーリー断片などの創作本文は Copilot が自動生成・補完しない。
  - Copilot はスキーマ整備、欠損耐性、テスト、入力補助などの構造面を優先して支援する。
  - 将来の LLM 補助は、自然言語本文の生成ではなく、構造化 JSON または固定テンプレートの枠組みに留める。
  - 最終的な公開判断とライセンス/ガイドライン適合判断は User が行う。

※ `CHANGELOG.md` については、Step 1 実施時点で typedef 追加の履歴を追記済み。

## 未決定事項（このログ時点での確認ポイント）

- 会話パターンを「全作品共通のルート typedef（`data/db_type.json`）」へ入れるか、作品別 typedef へ入れるか。
- UI の表示セクション割当（`profile` が妥当か、`spec` が妥当か）。
- 検索対象に含めるか（含める場合、ノイズ/誤用のリスクと折り合い）。
- 「台詞例」相当のフィールドを許容するか（誤生成誘発の観点で慎重に判断）。

## 次アクション（このログ作成後）

- Step 0 の仕様確認を行い、`ConversationPattern` の確定スキーマ案（フィールド名/型/表示名/section）を固める。
- スキーマ確定後、実装（typedef 追加 → テスト → UI/API 影響確認）へ進む。
