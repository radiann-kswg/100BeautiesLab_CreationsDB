# NumberTales「耳の形状」データ構造の整理（`develop`側）

## 目的

`TailsUnit`（尻尾）は先のセッションで `AppearanceDetail[].DesignElement:"#Element_TailsUnit"` から専用構造化型 `$Def_TailsUnit[]` へ移行済み（`2026-07-07_progress_tailsunit-dedicated-type.md`）。一方「耳」は今も `AppearanceDetail[].DesignElement:"#Element_Ear"` の `vdict_EarType` のままで、対応する `$EnumDef_EarType`（グローバル）は Fox/Cat の2値のみと、`TailShapeType`（14種）に比べて命名・宣言場所ともに不整合があった。User の指示を受け、develop 側のスキーマ設計・データ整理として本作業を実施した。

## 作業ブランチ

`develop`（本体ローカル）。`addon-ai-tag` 側の AIHints（`tools/patch-aihints.mjs` の耳タグ限定allow-list）への追従は、User の指示によりこの develop 側の内容が確定・マージされた後の別タスクとする。

## 事前調査で判明した事実（設計判断の根拠）

- `TailShapeType` と実際の耳形状は、実データ上も既に独立した軸だった（Num10=Bud尻尾+狐耳、Num22=Scorpion尻尾+狐耳、Num11=Nekomata尻尾+猫耳）。尻尾形状から耳を導出する設計は不適切と確認。
- 既存の全92件の `#Element_Ear` エントリは、現行の2値（Fox/Cat）で100%カバーされていた。語彙不足は実データ上は発生していないため、enum値の拡張は見送った（Scorpion/Bud/Octopus等「耳」概念が無い形状の代替語彙は User 自身の今後の創作判断）。
- CatAccessory尻尾の2レコードは `#Element_Ear` を使わず `#Element_CostumeItem`（アクセサリ扱い）でモデル化されており、この使い分けは尊重・維持した。
- `lib/section-renders/appearanceDetail.js` は `vdict_{DictName}` キーから動的に `$EnumDef_{DictName}` を解決する規約駆動実装（`resolveVdict`/`getMergedEnumDef`）であることをコードで確認済み。これにより改名・work-local化ともに renderer のコード変更は不要と判断。

## 変更点の要約

### 1. スキーマ変更（耳の改名・work-local化）

- **`data/db_meta.json`（グローバル）**: `#DesignAttr_Ear.$fields` を `vdict_EarShapeType` 参照に更新、`$EnumDef_EarType` を削除。`#Element_Ear`（`$EnumDef_DesignElement`）・`#DesignAttr_Ear` 自体は他作品も使う共有インフラのためグローバルのまま維持（UnibyteLiveが既に `$EnumDef_DesignElement` へwork-local値を追記している前例と同じパターン）。
- **`data/Works_NumberTales/DataBases/db_meta.json`**: `General.$VarsDef` に `$EnumDef_EarShapeType`（`#EarShapeType_Fox`/`#EarShapeType_Cat`）を新設。ラベル文言は旧 `EarType_JP`/`EarType_EN` から**変更なしで転記**（語彙拡張・文言調整はしない）。

### 2. 新機構: `SupersededDesignElements`

`AppearanceDetail` の `DesignElement` を専用フィールドへ移行した際に宣言できる汎用機構を新設。`TailsUnit` 移行時（`#Element_TailsUnit` → `TailsUnit`）はこの機構が無く、テスト・ドキュメント・`addon-ai-tag` 側のAIHintsツール（`tools/patch-aihints.mjs` の `ELEMENT_CATEGORY` 死んだエントリ等）で個別の手作業クリーンアップが必要になった反省を踏まえる。

- **`data/db_type.json`（グローバル）**: `$MetaType.$Def_SupersededDesignElement` を新設（`$Def_DatabaseCatalog` と同じ「型はグローバル、データは作品別」パターン）。
- **`data/Works_NumberTales/DataBases/db_meta.json`**: 新規トップレベル `SupersededDesignElements` に `#Element_TailsUnit → TailsUnit`（2026-07-07完了分）を**遡って文書化**（新規のデータ移行は無し）。
- **`#Element_Ear` はこの機構に登録していない**（廃止されるわけではなく、`AppearanceDetail` 内での運用を継続するため）。

### 3. 既存データの改名移行

- **`scripts/migrate-eartype-to-earshapetype.mjs`（新規）**: `TailsUnit` 移行時と同じ「レコード単位再構築＋Prettier標準入力整形＋文字列差し込み」方式を流用。`db_Primary.json`（`#Element_Ear` が存在する唯一のファイル）の `vdict_EarType` キー・値を `vdict_EarShapeType` へ機械的に改名。
- dry-run → **91レコード・92件のAttrs行**（想定通り、事前調査の全数と一致）→ `--write` で反映。
- 旧キー `vdict_EarType` の並走維持はしない（値の意味を保つ単純改名のため、TailsUnit移行時のような情報量差は無い。通常方針「既存フィールドは削除せず並走追加」の明示的な例外としてCHANGELOGに明記）。

### 4. テスト・ドキュメント

- **`tests/data.shape.test.js`**: 従来ハードコードされていた「`#Element_TailsUnit` を使うAppearanceDetailが無いこと」のテストを `SupersededDesignElements` を読む汎用テストに置き換え（将来の廃止対応で配列へ1行追加するだけでテストが自動追従するようにした）。新規 `EarShapeType schema` テスト群も追加。
- **`tests/pages.characters.ui-output.test.js`**: `vdict_EarType`/`$EnumDef_EarType` に言及していた既存コメント2箇所を `EarShapeType` 表記に修正。
- **`docs/schema-meta-processing.md`**: §2.4/§3.6に `SupersededDesignElements`/`$Def_SupersededDesignElement` を追記、新設§4.8で詳細説明、§7.6に更新先の索引を追加。
- **`CHANGELOG.md`**: 2エントリ追記（EarType改名・SupersededDesignElements新設）。

## 影響範囲（編集したファイル）

- `data/db_meta.json`
- `data/Works_NumberTales/DataBases/db_meta.json`
- `data/db_type.json`
- `data/Works_NumberTales/DataBases/db_Primary.json`（91レコード）
- `scripts/migrate-eartype-to-earshapetype.mjs`（新規）
- `tests/data.shape.test.js`
- `tests/pages.characters.ui-output.test.js`
- `docs/schema-meta-processing.md`
- `CHANGELOG.md`

## 検証

1. 移行スクリプトdry-run → 件数確認（91レコード・92行、想定と一致）→ `--write`。
2. `git diff --stat` で91レコードのみ変更・対象外レコード無変更を確認。
3. `npm test`: 22ファイル・199件全成功。
4. ローカルHTTPサーバーで `characters.html`/`data/**`/`lib/section-renders/appearanceDetail.js` の配信は確認したが、**このセッションではブラウザ自動操作ツールが利用できなかったため、手動目視によるブラウザ確認は未実施**。代わりに `tests/pages.characters.ui-output.test.js`（jsdom上で実際の `appearanceDetail.js` レンダリングコードを実行し、Num:9レコードの表示テキストに「耳」「狐」「先がアクセントカラー」が含まれることをアサートする既存テスト）が、実データ・実スキーマファイルを読み込んだ状態で成功していることを、実質的な代替検証として確認した。

## 未完了タスク

- **User に依頼**: 可能であればローカル環境で `pages/characters.html`（NumberTales Primary Num:9・Num:11）を目視確認し、耳セクションの表示が改名前と同一であることの最終確認をお願いしたい。
- `addon-ai-tag` 側 `tools/patch-aihints.mjs` の耳タグ allow-list（Fox/Cat/Nekomata/Dog限定の暫定コード）を、新しい正源データから読むよう追従する対応 — 本develop側の内容がマージされた後の別タスク。
- `$EnumDef_EarShapeType` の語彙拡張（Scorpion/Bud/Octopus等の代替特徴の命名）— User の創作判断待ち。
