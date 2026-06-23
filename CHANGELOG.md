# 最新のリファクタリング・仕様変更履歴

### Google カレンダー連携: 誕生日・記念日 ICS 自動生成・配信 (2026-06-24)

- **`tools/build-calendar-ics.mjs` 新規追加**: `data/Works_*/DataBases/db_*.json` の全公開レコードから `BirthDay`(単一) / `AnivDay`(配列) を収集し、終日・毎年繰り返し(`RRULE:FREQ=YEARLY`)の iCalendar(.ics) を生成する。
- **公開ルール順守**: `isPrivate` レコード、グローバル `CreationWorks.#Works_*.Works_Hidden`、作品別 `Databases` 配下(ネスト含む)の `#DB_*` に付く `DB_Hidden`/`Works_Hidden`、`{hideText}`・日付欠損を除外する。
- **決定的出力**: UID 安定化(作品+DB+索引+種別の SHA-1)・月日順ソート・固定 DTSTAMP により、購読側の再読込時に冪等反映される。
- **`package.json`** に `calendar:build` スクリプト、**`.gitignore`** に生成物 `/calendar/*.ics`(ビルド成果物・コミット対象外)を追加。
- **`.github/workflows/jekyll-gh-pages.yml`** に Node セットアップ＋生成ステップを追加し、`develop` への push 毎に `.ics` を生成して GitHub Pages へ配信する(`https://database.numbertales-radiann.net/calendar/100beautieslab-creations.ics`)。コミットバック不要。
- **テスト `tests/calendar.ics.test.js` 追加**: 除外ルール・UID 一意・終日繰り返し・行折返し(≤75 オクテット)・決定性を検証。
- **ドキュメント**: 利用方法・Google カレンダー購読手順は `docs/calendar-ics-spec.md` を参照。
- **初回イベント数**: 誕生日 19・記念日 131(計 150)。


### JP/EN 命名規則の標準化（Phase 2〜5 完了）(2026-06-22)

- **Phase 2 — typedef リネーム**: `data/db_type.json` および `data/Works_*/DataBases/db_type.json` の全 `$DefType` エントリで、`Name → Name_JP`、`FormalName → FormalName_JP`、`ModelName → ModelName_JP`、`Title → Title_JP`、`Term → Term_JP`、`DayAbout → DayAbout_JP`、`DB_Label → DB_Label_JP` 等の言語サフィックス付与を適用した。
- **Phase 3 — コードフォールバック追加**: Phase 4 のデータ移行完了まで旧フィールド名を許容する一時フォールバックを `lib/` / `pages/` / `pkg/` に追加した（`Name_JP || Name` 等のチェーン）。
- **Phase 4 — データ一括リネーム**: `data/Works_*/DataBases/*.json` 等の全レコードデータと `db_meta.json`（全 works）の `DB_Label → DB_Label_JP` を一括移行した。
- **Phase 4.5 — テスト修正 & `basicFields`/`subFields` ベース名化**: Phase 4 で生じたテスト失敗（`DB_Label`/`FormalName`/`Character` 参照）を修正し、`db_meta.json`（全 works）の `$DetailLayout.basicFields`/`.subFields` から `_JP`/`_EN` サフィックスを除去するベース名書式へ統一した。コードサイドでは `detailSubFieldKeySet`（`pages/characters.js`）と `detailSubFieldSet`（`lib/data-common.js`）がベース名・`_JP`・`_EN` の 3 バリアントを自動展開するよう拡張した。
- **Phase 5 — フォールバック除去（本 PR）**: Phase 3 で追加した旧フィールド名フォールバックを全箇所から削除した。
  - `lib/wrapper-common.js`: `?? value.DayAbout` 削除
  - `lib/section-renders/dblink.js`、`relation.js`: `|| found?.Name`、`|| found?.FormalName`、`|| found?.ModelName` 削除
  - `pages/characters.js`: `getRecordPrimaryTitle`、`getRecordSecondaryTitle`、画像ログ、`shownKeys` 分岐から旧裸フォームを除去
  - `pkg/cloudflare/scripts/migrate.mjs`: `?? info?.Title`、`?? info?.Works_Summary` 削除
  - `pkg/nodejs/index.mjs`: `listWorks()` 戻り値から廃止フィールド `Title`、`Works_Summary` を除去し JSDoc 更新
- **テストデータ更新**: `tests/wrapper-common.test.js` のテストデータを `DayAbout → DayAbout_JP` に更新。
- **注意**: Cloudflare D1/R2 の再同期（`scripts/migrate.mjs` 再実行 → `wrangler deploy`）は別途実施が必要。

### Cloudflare Workers 実 API 初回デプロイ完了・疎通確認 (2026-06-21)

- **`pkg/cloudflare/wrangler.toml` TOML パース修正**: `routes = [...]` が `[vars]` / `[[d1_databases]]` スコープ内に誤配置されており、wrangler が `vars.routes` または `d1_databases[0].routes` として解釈する問題を修正。TOML の root-level キーはすべての `[section]` / `[[array]]` ヘッダーより前に配置しなければならない仕様に従い、`routes = [...]` を先頭スカラー群の直後に移動した。合わせて `[env.production]` セクション（冗長な重複定義）を削除。
- **`pkg/cloudflare/scripts/migrate.mjs` SQLITE_TOOBIG 修正**: `records` テーブルへの D1 INSERT で D1 の 1 文あたり約 100KB 上限を超えて `SQLITE_TOOBIG` が発生する問題を修正。`d1BatchInsert()` を複数 VALUES の一括 INSERT から 1 レコード 1 INSERT 文（`D1_BATCH_SIZE = 10` ファイルあたり 10 文）に変更した（`migrate-aihints.mjs` と同方式）。
- **初回デプロイ・疎通確認完了**: `database.numbertales-radiann.net/api/v1/*` への Worker デプロイが完了し、全エンドポイントの動作を確認した（`/works` 7件・`/Primary/records` 376件・単一レコード取得・FTS5 全文検索）。

### ADR-0001 採択: API 配信基盤を Cloudflare Workers + R2 + D1 へ移行 (2026-06-21)

- **ADR-0001** を採択。API 配信基盤を GitHub Pages + Service Worker の疑似 API から、Cloudflare Workers + R2 + D1 による実 API へ移行する設計を確定した。
- **インフラ作成**: R2 バケット `creationsdb-data`（JSON 静的ミラー）、D1 データベース `creationsdb-d1`（FTS5 検索インデックス）を Cloudflare アカウントに作成した。
- **D1 スキーマ適用**: `pkg/cloudflare/schema/d1-init.sql` を新規作成し、`works` / `dbs` / `records` テーブルと FTS5 仮想テーブル (`records_fts`)・同期トリガーを D1 に適用した。
- **マイグレーションスクリプト**: `pkg/cloudflare/scripts/migrate.mjs` を新規作成。`data/**/*.json` の全 JSON を R2 へアップロードし、作品メタ・DB メタ・レコードを D1 へ投入する。`$IndexDef`（フラット型・ネスト型両対応）から主インデックスキーを自動解決する。
- **Worker 全面改修** (`pkg/cloudflare/worker.js` v2.0.0):
  - データアクセス層を GitHub Pages HTTP fetch → R2 `env.BUCKET.get()` / D1 `env.DB.prepare()` に差し替えた。
  - 検索エンドポイント (`/search`) を D1 FTS5 クエリに変更した。
  - `Works_Hidden` / `DB_Hidden` を D1 クエリレベルで判定するよう改修した。
  - 単一レコード取得を D1 `records` テーブルのインデックスクエリに変更した。
- **wrangler.toml 更新**: R2 バインディング・D1 バインディング・カスタムドメインルーティング (`database.numbertales-radiann.net/api/v1/*`) を追加した。
- **ドキュメント更新**: `CLAUDE.md` / `.github/copilot-instructions.md` / `docs/api-sw-spec.md` / `pkg/cloudflare/README.md` を新アーキテクチャに合わせて更新した。
- **ADR-0002 ドラフト**: Google Cloud (Cloud Run / GCE) を画像生成・バッチ処理専用バックエンドとして設計するドラフトを `_work_in_progress/2026-06-21_progress_cloudflare-api-adr2-gcloud.md` に作成した。GCP プロジェクト ID 確認後に正式着手予定。
- **Service Worker 疑似 API は継続稼働**: `/pages/v1/`, `/svc/v1/` は `_DBLink`/`_Jump` 解決を含む完全 enrich 付き疑似 API として GitHub Pages 上で引き続き稼働する。

### `*_DBLink` suffix セクションレンダラー実装・`ThisMasters` リンク対応

- `lib/section-renders/dblink.js` を新規実装し、`*_DBLink` suffix フィールドを「キャラクターリンク参照」セクションとして描画する `dbLinkSection` renderer を追加した。
  - `$display.sectionWrapper` の指定は不要。`*_DBLink` suffix を自動検出して `CharacterSectionRendererRegistry` に登録する suffix-based dispatch。
  - `$Def_DBLinkRef` 形式（`{ _Work, _DB, {IndexKey: Value} }`）に基づき非同期でキャラクター名をハイドレーション。同DB・クロスDB・クロスワーク参照に対応。ネストインデックス（例: FLInvestigator78 の `Card: { Stoat, StoatNum }`）は subset match で解決。
  - `isPrivate: true` への参照はクライアント側フィルタで非表示にし、全タグ非表示の場合はセクションごと隠す。
- `lib/section-wrapper-common.js` の `structuredObjectSection.match` に `*_DBLink` suffix 除外を追加した。単一オブジェクト形式（`$Def_DBLinkRef|#Null`）の `*_DBLink` フィールドが `structuredObjectSection` に横取りされる問題を修正。
- `lib/section-renders/thisMasters.js` の `hydrateThisMastersLink` を `$Def_DBLinkRef` 形式へ刷新した。
  - 旧フォーマット: `{worksTitle, dbName, _Search: [{hashTag, key}]}` → 新フォーマット: `{_Work, _DB, {IndexKey: Value}}`
  - スカラーインデックス（`Drc: "E"` など）・ネストオブジェクト（`Card: {Stoat, StoatNum}` など）どちらも解決。
  - `about` テキストが空のエントリでリンクが付与されないバグを修正した（`!aboutText` 早期 return がリンク処理を飛ばす問題）。
- `data/Works_NumberTales/DataBases/db_Primary.json`（18件）と `db_SemiPrimary.json`（3件）の `ThisMasters._DBLink` を新フォーマットへ一括移行した。
  - `EnrichmentProcessor` が使うレコードルートの `_DBLink`（マージ用、`db_SelfSecondary.json` 等）は旧フォーマットのまま維持。

### `pkg/` クライアントライブラリ群を新規追加

- サブモジュールとして別リポジトリに導入するための独立クライアントパッケージ群 `pkg/` を新規実装した。
- 含まれるパッケージ: Node.js ESM ライブラリ / Python モジュール / C# クライアント / Cloudflare Workers API / MCP サーバー。
- **コンストラクタ引数の省略対応**: `repoRoot`（リポジトリルートパス）の引数を省略可能にし、サブモジュール配置時は `new CreationsDBClient()` のみで動作するようにした。
  - Node.js: `import.meta.url` から 2 階層上を自動解決
  - Python: `__file__` から 4 階層上を自動解決
  - C#: `FindRepoRoot()` がアセンブリ位置から `data/db_meta.json` を目印に上方探索
- 既存の `lib/` / `pages/` / `api/` / `svc/` への変更はなし（非破壊）。
- 詳細設計: `docs/pkg-client-libraries.md`

### `Works_Hidden` による作品単位の完全非公開フラグを追加

- `data/db_meta.json` の `CreationWorks.#Works_<WorkName>` に `"Works_Hidden": true` を置くことで、その作品全体をAPIから完全に非公開にできる仕様を追加した。
- 適用エンドポイント: `GET .../works` 一覧、`GET .../index`、`GET .../bootstrap` から該当作品を除外。`GET .../works/{work}` / `.../works/{work}/db` / `.../works/{work}/db/{dbName}` / `search?works=...` は 404 `"Work not found"` を返す。
- グローバルメタ (`data/db_meta.json`) 欠損時はチェックをスキップし、既存の耐性設計を維持する。
- `DB_Hidden`（DB単位）と同様の設計で、`isPrivate`（レコード単位）との段階的非公開を構成する。

### `DB_Hidden` による DB 単位の完全非公開フラグを追加

- `db_meta.json` の `Databases.#DB_<DbName>` に `"DB_Hidden": true` を置くことで、そのDBをAPIから完全に非公開にできる仕様を追加した。
- `lib/sw-common.js` の `listWorkDBs()` を修正し、`DB_Hidden: true` のエントリをDBリスト (`works/{work}/db`) から除外するようにした。
- `lib/sw-common.js` の `handleDbEndpoint()` を修正し、直接URL (`works/{work}/db/{dbName}`) へのアクセスも `DB_Hidden: true` の場合は 404 を返すようにした。メタ欠損時はチェックをスキップし、既存の耐性設計を維持する。
- 初期適用として `Works_NumberTales/DataBases/db_meta.json` の `#DB_UnprocessedSecondary` に `"DB_Hidden": true` を設定した。

### 創作作品ガイドラインを言語別ファイルへ集約

- 一次/二次創作ガイドラインの本文と「二次創作 OK/NG リスト」を、リポジトリ直下の `guideline.md`（日本語版・正本）および `guideline.en.md`（英語版）の 2 ファイルへ集約した。
- 既存の文面は一言一句変更せずに移植し、OK/NG リストはこれまで PNG 画像で配布していた表を Markdown 表として書き起こした（既存の `SecondaryWorksPermissionList_*.png` ファイル自体はリポジトリに残置）。
- `README.md` の冒頭ガイドライン章はリンクのみに簡略化し、`docs/guidelines.en.md`（paraphrased な英訳メモ）は重複回避のため削除した。
- 併せて `CONTRIBUTING.md` / `.github/copilot-instructions.md` / `docs/README.md` を、ガイドラインの正本が `guideline.md` / `guideline.en.md` であることを示す表記に更新した。

### `subFields` の非文字列型 standalone section を折りたたみ UI 化

- `pages/characters.js` は `data/db_meta.json` の `CreationWorks.*.$DetailLayout.subFields` により standalone 描画された top-level subField のうち、文字列表示型ではない section を `details/summary` ベースの折りたたみ UI で包むようにした。
- 折りたたみ対象の standalone section は初期状態を展開済みではなく閉じた状態とし、必要なときだけユーザーが開く挙動へ調整した。
- 判定は field 名ハードコードではなく、primitive / `#String` / `#Summary` / `#Dialogue` を text-like と見なし、それ以外の object / list / relation / stats 系を折りたたみ対象にする方針へ寄せた。
- `Relation` / `RelationToPrimary` は `renderRelations()` に `wrapInSection: false` オプションを追加し、既存の relation tag-grid 本体を保ったまま standalone subField 側の共通シェルへ包めるようにした。
- `pages/characters.sass` には `.section--collapsible` と `summary` の最小スタイルを追加し、見出しのトグル affordance を明示した。あわせて `pages/characters.html` の asset version を更新した。
- 回帰確認として `tests/pages.characters.ui-output.test.js` に `data-subfield-key` ベースの assertion を追加し、ConversationPattern / AbilityStats / NumerospecStats / Relation は折りたたみ UI、NumerospecAbout は通常 section のまま描画されることを確認した。

### `Relation` の特殊描画を `section-wrapper-common.js` へ移設

- `pages/characters.js` 末尾に残っていた `renderRelations()` の個別組み立て本体を `lib/section-wrapper-common.js` の built-in `relationSection` renderer へ移し、relation label 解決・comment 整形・index link 組み立て・standalone wrapper 連携を subscript 側で扱うようにした。
- `pages/characters.js` の `renderRelations()` は、DOM/format/navigation の共通 helper をまとめて renderer へ渡す bridge に縮小した。
- `CharacterSectionRendererRegistry` には `renderNamedSectionRenderer()` を追加し、non-subField からも built-in section renderer を明示的に再利用できるようにした。
- 回帰確認として `tests/section-wrapper-common.test.js` に built-in relation renderer の最小ケースを追加し、`tests/pages.characters.ui-output.test.js` の Relation / RelationToPrimary 系ケースで表示互換を確認した。

### `subFields` 用 section renderer registry を `lib/section-wrapper-common.js` へ分離

- `lib/wrapper-common.js` は値 summary の wrapper registry に責務を限定し、`subFields` の standalone section 描画ディスパッチは新設した `lib/section-wrapper-common.js` へ分離した。
- `pages/characters.js` は `CharacterSectionRendererRegistry` を先に試し、`$display.sectionWrapper` で宣言された `structuredObjectSection` / `relationSection` / `statsSection` を通して `subFields` を描画するようにした。
- global / work typedef には `ConversationPattern`、`AbilityStats`、各作品の `*specStats`、`Relation` / `RelationToPrimary` へ `$display.sectionWrapper` を追加し、renderer 選択を meta/schema 駆動へ寄せた。
- 回帰確認として `tests/section-wrapper-common.test.js` を追加し、built-in section renderer 登録と helper dispatch の最小ケースを検証できるようにした。
- 続けて `pages/characters.js` は `subFields` に列挙された top-level key を basic/profile/relation の既定ルートより優先して扱うようにし、JSON 側で宣言した順序どおりに standalone section を並べるようにした。
- 続けて `pages/characters.js` は spec 系の leaf 値に `hideText` が指定された場合も raw 文字列で短絡せず、元の typedef が持つ表示書式に従って整形するようにした。`#String_JP` / `#ListLink` / `$EnumDef` などの書式を持つ項目では `data/db_type.json` の `#List_hideText` を参照して `hideText_JP` / `hideText_EN` も解決できるようにした。
- 追加で `hideText` だけを持つ wrapper object でも親 schema 配下の leaf typedef を推定できるようにし、`SafetyLevel` のような spec 項目も `hideText` 時に別ブロックへ崩さず通常の tag/grid 書式のまま表示するようにした。
- 追加で `alphaLabel` / `codeLabel` は `EnumLink` / `ListLink` の説明文を JP 単独ではなく JP/EN pack から組み立てるようにし、`A（強力 / Powerful）` のような和英併記表示へ統一した。

### NumberTales の `ConversationPattern` を subField 独立セクション化

- `data/db_meta.json` の `CreationWorks.#Works_NumberTales.$DetailLayout.subFields` に従い、`pages/characters.js` が top-level 項目を standalone subField section として描画できるようにした。
- これにより `ConversationPattern` は従来の「プロフィール/テキスト」内の専用ブロックではなく、`Relation` と同様に独立したセクション見出し付きで表示されるようになった。
- 既存の `Relation` / `RelationToPrimary` の個別描画は維持しつつ、meta に列挙された subField の順序を優先してレンダリングするよう整理した。
- 回帰確認として `tests/pages.characters.ui-output.test.js` に NumberTales の `ConversationPattern` が standalone section として描画されることを確認するケースを追加した。

### `subFields` による `Stats` 系 standalone 描画を他作品へ拡張

- `pages/characters.js` は `data/db_meta.json` の `CreationWorks.*.$DetailLayout.subFields` に列挙された `AbilityStats` と各作品の `*specStats` を、従来の共通 `スペック/能力` セクションに固定せず standalone section として描画できるようにした。
- promoted された `*specStats` 配下の子項目は、typedef 上の `$display.section` が `profile` / `spec` に分かれていても親 subField section 内へまとめて表示し、別セクションへの重複表示を防ぐようにした。
- これにより NumberTales / FLInvestigator78 / ShouArRiders / PastDivers など、meta 側で `subFields` に stats を宣言した作品が同じ描画ルートで表示されるようになった。
- 回帰確認として `tests/pages.characters.ui-output.test.js` に NumberTales の `能力値` と `“カバラの加護”(数秘的加護)の特性`、PastDivers の `時空遷移能力の特性` が standalone section として描画されるケースを追加した。

### Day / StoryEra の特殊整形を shared wrapper registry の受け口へ分離開始

- `lib/wrapper-common.js` を追加し、UI / Service Worker 共有で使える value wrapper registry を新設した。
- 最初の built-in wrapper として `daySummary` と `storyEraSummary` を登録し、`$display.role` を使った Day / StoryEra の summary 整形を shared 層へ切り出せる土台を用意した。
- `pages/characters.js` は object 値の整形時に registry を先に試し、未一致または空文字時のみ従来の Day / StoryEra fallback を使うようにしたため、初回導入時点では既存挙動を維持する。
- `api/sw.js` / `pages/sw.js` / `svc/sw.js` も `lib/wrapper-common.js` を読み込むようにし、今後 SW / enrich 側から同じ wrapper registry を利用できる shared 層を揃えた。
- 回帰確認として `tests/wrapper-common.test.js` を追加し、built-in wrapper 登録と Day / StoryEra summary の最小整形を単体で検証できるようにした。
- 続けて `StoryEra` は `$MetaType.$Def_StoryEraCatalog.$display.wrapper = storyEraSummary` を宣言し、characters 側の local formatter 実装を削除して shared registry 経由へ本格移行した。
- 続けて `Day` と `Era` も `$display.wrapper` 主体へ寄せ、`$Def_Day -> daySummary`, `$Def_StoryEra -> eraSummary`, `$Def_StoryEraCatalog -> storyEraSummary` という shared な割り当てを明示した。
- `lib/data-common.js` は enrich 結果に `_enrichment.wrapperSummaries` を追加し、top-level の wrapper 対象項目の summary を SW/UI から再利用できるようにした。
- `lib/sw-common.js` の DB カタログ応答は `StoryEraSummary` も返すようになり、works/{work}/db 系 API でも shared wrapper による summary を利用できるようになった。さらにこの summary 生成は `StoryEra` の個別ハードコードではなく、`$Def_DatabaseCatalog` の wrapper 対象項目から自動導出する方式へ寄せた。

### `StoryEra` 用の最小 meta schema を追加

- `data/db_type.json` のトップレベル `$MetaType` に `$Def_StoryEra` を追加し、`EraGen` / `YearInEra` / `byRealYear` / `about_JP` / `about_EN` を持つ単点年代の宣言を導入した。
- あわせて `$Def_StoryEraCatalog` を `FromEra[]` / `ToEra[]` / `InEra[]` + `about_JP` / `about_EN` を持つ構造へ拡張し、既存の作品別 `db_meta.json` で使っている StoryEra 実データ形状を global schema に追従させた。
- `tests/meta.catalog.schema.test.js` を更新し、新しい schema 宣言の存在と `Works_NumberTales` の StoryEra 実データが `FromEra` / `ToEra` / `InEra` を持つことを確認するケースを追加した。
- `docs/schema-meta-processing.md` と `docs/api-sw-spec.md` も、新設した `$Def_StoryEra` と拡張後の `$Def_StoryEraCatalog` の説明へ同期した。
- 追加で `pages/characters.js` の `StoryEra` summary 表示は `about_JP` / `about_EN` を優先しつつ、未指定時は `InEra` または `FromEra` / `ToEra` から自動整形できるようにし、`tests/pages.characters.ui-output.test.js` に回帰テストを追加して 14 件成功を確認した。
- 続けて `$display.role` を `$Def_StoryEraCatalog` / `$Def_StoryEra` / `$Def_Day` へ導入し、`pages/characters.js` 側も role 優先で summary を組み立てるようにした。Day は実データの `Day` ラッパーが残るため、現段階では role 解釈と既存 shape 互換の併用としている。

### `RelationToPrimary` を Primary DB 詳細へ遷移できるリンク表示へ調整

- `pages/characters.js` の関係表示で、`RelationToPrimary` は現在選択中 DB ではなく `Primary` DB の index 直リンクを生成するようにした。
- 同一 DB 内の `Relation` は従来どおり現在のレコード群から即時詳細表示しつつ、`RelationToPrimary` は現在 state に一次創作レコードが載っていない場合でも `work/db/idx/idxKey` を保ったまま `Primary` 側へ遷移できるようにした。
- 回帰確認として `tests/pages.characters.ui-output.test.js` に `RelationToPrimary` のリンク先が `db=Primary` になることを確認するケースを追加し、13 件成功を確認した。

### 画像ディレクトリ命名を `Images/DB_*` / `Images/Ref_*` へ移行

- `pages/characters.js` と `lib/data-common.js` の画像パス解決を更新し、通常 DB は `Images/DB_<DbName>/...`、References 系 DB は `Images/Ref_<RefName>/...`、作品共通画像は `Images/General/` を既定で解決するようにした。
- これに合わせて、各作品の `data/Works_*/Images/` 配下に残っていた `Primary` / `Secondary` / `Proxy` などの旧サブフォルダ名を `DB_Primary` / `DB_Secondary` / `DB_Proxy` などへ移行し、`Works_NumberTales` には `Ref_Glossary` / `Ref_Reference` を追加した。
- 回帰確認として `tests/pages.characters.ui-output.test.js` に References 画像パスの検証を追加し、`tests/data.sanity.test.js` に `Images` 直下の命名規則チェックを追加した。
- 追加で、References 画像は shared `data/References/db_type.json` だけでなく作品別 `References/db_type.json` も UI 側で合流して解釈し、`Images.*` 配下の field 名から folder hint を導出して `concept-figure` のようなサブフォルダを hardcode なしで解決できるようにした。
- あわせて `README.md`、`pages/README.md`、`docs/db-update-guidelines.md`、`docs/api-sw-spec.md`、`docs/schema-meta-processing.md`、`docs/readme.en.md`、`docs/viewer-guide.md`、`.github/copilot-instructions.md` を新規則へ同期した。

### References レイヤーの DB をキャラシート UI で表示可能にした

- `pages/characters.js` で、現在選択中 DB の catalog entry を参照し、`DB_Layer: References` の場合は shared `data/References/db_type.json` を追加で読み込んで work typedef へマージするようにした。
- これにより、`Title` / `Term` / `BodyBlocks` / `RelatedCreations` など、通常キャラクター DB とは異なる資料系フィールドでも、キャラシート詳細で label / section / 表示整形を shared references typedef に従って解釈できるようにした。
- 一覧・詳細の見出し fallback も `Name` / `FormalName` だけでなく `Title` / `Term` を使えるようにし、References レコードでもタイトル未設定扱いにならないようにした。
- 追加で、一覧検索を `Title` / `Term` 系も対象に広げ、`RelatedTerms` を Glossary DB の絞り込みリンク、`RelatedCreations` を対象 work/db への遷移リンクとして「関連情報」セクションに表示するようにした。
- 回帰確認として `tests/pages.characters.ui-output.test.js` に References 表示・一覧 fallback・関連リンクのケースを追加し、8 件成功、および `tests/pages.characters.syntax.test.js` の成功を確認した。

### References typedef を shared `data/References/db_type.json` へ集約

- References 用の共通 typedef は global `data/db_type.json` ではなく、shared layer の `data/References/db_type.json` を正本として扱う構成へ揃えた。
- `data/Works_NumberTales/References/db_type.json` は作品固有 typedef を持たない空オブジェクトへ縮退し、資料系フィールド宣言は shared references layer から供給する前提へ整理した。
- `tests/data.shape.test.js` を `data/References/db_type.json` 前提へ更新し、`tests/data.shape.test.js` の 3 件成功を確認した。

### References typedef の `RelatedWorks` を object 配列化

- `data/Works_NumberTales/References/db_type.json` では、資料系の関連先フィールドを `RelatedWorks` から `RelatedCreations` へ改名し、object 配列 typedef として各要素が `RelatedWorks` と `RelatedDB` を持てるようにした。
- これにより、資料系 DB でも `_DBLink` に近い粒度で「どの作品に紐づく関連か」「その作品内のどの DB まで紐づくか」を 1 要素ごとに表現できるようにした。
- 新構造の代表キーは `RelatedCreations[]` とし、その子要素に `RelatedWorks` / `RelatedDB` を持たせる形へ整理した。
- 回帰確認として `tests/data.shape.test.js` を更新し、`tests/data.shape.test.js` の 3 件成功を確認した。

### NumberTales の資料系 DB を `References/ref_*.json` へ統合

- `data/Works_NumberTales/DataBases/db_meta.json` と `data/Works_NumberTales/References/db_meta.json` の資料系 catalog key を `#DB_Glossary` / `#DB_Reference` から `#Ref_Glossary` / `#Ref_Reference` へ変更した。
- `data/Works_NumberTales/References/` へ glossary / reference の実データを統合し、`ref_Glossary.json` と `ref_Reference.json` に改名した。
- `lib/sw-common.js` は `#Ref_` prefix を資料系 catalog key として扱い、`References/ref_*.json` を `DB_File` なしで既定解決できるようにした。
- 回帰確認として `tests/sw.db-layer-routing.test.js`、`tests/data.sanity.test.js`、`tests/sw.work-meta-info.test.js` を実行し、通過を確認した。

### NumberTales に Glossaries / References の空テンプレートを追加

- `data/Works_NumberTales/DataBases/db_meta.json` に `#DB_Glossary` と `#DB_Reference` を追加し、それぞれ `DB_Layer: Glossaries` / `References` を宣言した。
- `data/Works_NumberTales/Glossaries/` と `data/Works_NumberTales/References/` に `db_meta.json`, `db_type.json`, 空の `db_Glossary.json` / `db_Reference.json` を追加し、User 手入力前提の最小テンプレートを配置した。
- これにより、既存の works/{work}/db 導線から NumberTales の新規レイヤー DB を段階的に増やせる土台を実ファイルとして用意した。

### `Databases.#DB_*` に `DB_Layer` を追加し、非 `DataBases/` レイヤーの受け皿を実装

- `data/db_type.json` の `$MetaType.$Def_DatabaseCatalog` に `DB_Layer` を追加し、作品別 `db_meta.json` から DB 実体の配置レイヤーを宣言できるようにした。
- `lib/sw-common.js` の `DataFetcher.readDB()` / `listWorkDBs()` は `Databases.#DB_<DbName>.DB_Layer` を参照して、`Glossaries/` や `References/` のような非 `DataBases/` レイヤー配下の `db_<DbName>.json` を読めるようにした。
- DB 一覧カタログでも `DB_Layer` を返すようにし、UI/API 側が各 DB の配置レイヤーを参照できるようにした。
- 回帰確認として `tests/sw.db-layer-routing.test.js` を追加し、layer-aware な DB 読み込みと一覧応答を検証した。

### 最小の `isPrivate` 公開制御を追加

- `lib/sw-common.js` の `db` / `search` エンドポイントで `isPrivate: true` のレコードを除外し、公開 API 応答へ含めないようにした。
- `lib/data-common.js` でも typedef 駆動検索と `_DBLink` 参照先探索から private レコードを除外し、enrich 経路での露出を抑えた。
- `pages/characters.js` では一覧再描画時に public レコードだけを扱い、private レコードが直接渡された場合も詳細画面に本文を描かず「非公開」表示で止めるようにした。
- 回帰確認として `tests/sw.dbmeta.tolerance.test.js` と `tests/pages.characters.ui-output.test.js` を更新し、通過を確認した。

### `_Secondaries` 要素用の `$MetaType` を追加し、二次創作情報 UI の hardcode を削減

- `data/db_type.json` のトップレベル `$MetaType` に `$Def_SecondaryMeta` を追加し、`sec_Category` / `sec_DesignedBy` など `_Secondaries[]` 要素で使う補助フィールドのラベルと型を宣言できるようにした。
- `pages/characters.js` の「二次創作情報」セクションは、この `$Def_SecondaryMeta` を参照して描画項目を決めるように変更し、sec 系フィールド配列のハードコードを外した。
- 回帰確認として `tests/meta.catalog.schema.test.js` と `tests/pages.characters.ui-output.test.js` を更新対象に含める前提を整えた。

### `_Secondaries` の series 一致から `sec_Category` / `sec_DesignedBy` も補完

- `lib/sw-common.js` と `pages/characters.js` で、`Databases.#DB_*._Secondaries[]` のうち `sec_SeriesTitle` などで一致した定義を保持し、その `_Commons` だけでなく `sec_Category` / `sec_DesignedBy` も空欄時にレコードへ補完するようにした。
- これにより、`db_Secondary.json` 側で `sec_SeriesTitle` のみを持つレコードでも、meta 側のシリーズ定義から二次創作分類と制作・考案者を UI/API で一貫して扱えるようにした。
- 回帰確認として `tests/commons.secondaries.test.js` と `tests/pages.characters.ui-output.test.js` を更新し、通過を確認した。

### `Class` を作品別 `dict_Class` 辞書参照へ移行

- `data/Works_NumberTales/DataBases/db_SelfSecondary.json`、`db_SemiPrimary.json`、`db_UnprocessedSecondary.json`、`data/Works_UnauthedLogica/DataBases/db_PrimaryMobs.json`、`data/Works_ShouArRiders/DataBases/db_Primary.json`、`data/Works_PastDivers/DataBases/db_meta.json` の `Class` / `Class_EN` を、作品別 `Dictionaries/dict_Class.json` を正とした `Class` 配列へ変換した。
- `data/Works_PastDivers/DataBases/db_meta.json` の隠し値 `{ hideText: "？？？" }` / `{ hideText_EN: "????" }` も、辞書プレースホルダ `"？？？"` を使う配列形式へ揃えた。
- `data/db_type.json` ではトップレベル `Class` を `#DictIndex[]` + `$dict: "Class"` へ変更し、旧 `Class_EN` のトップレベル宣言を削除した。
- `pages/characters.js` では一覧 chip と `_DBLink` 参照結果の Class 表示を `formatValueForDisplay()` 経由へ寄せ、配列化された辞書キーからラベル解決するようにした。
- 回帰確認として、対象 6 ファイルから `Class_EN` が消えていることを確認し、関連テストを実行して検証した。

### `Belonging` の参照先辞書を `Faction` へ改名し、`$dict` ベースで表示解決するよう統一

- `data/db_type.json` でトップレベル `Belonging` の `$dict` を `Faction` へ変更し、表示フィールド名と辞書名を分離した。
- `data/Dictionaries/db_meta.json` では辞書カタログを `#Dict_Faction` / `keyField: Faction` へ改名し、実体ファイルも `dict_Belonging.json` から `dict_Faction.json` へ変更した。
- `pages/characters.js` の辞書表示解決は、`#DictIndex` 系フィールドについて `fieldKey` 名ではなく typedef の `$dict` を優先して `#Dict_*` / `#List_*` を参照するようにした。
- これにより、record 側のフィールド名が `Belonging` のままでも、辞書項目側は `Faction` / `Faction_EN` を代表キーとして保持できるようにした。
- 回帰確認として `tests/data.shape.test.js`、`tests/sw.deftype.merge.test.js`、`tests/sw.enrich.basic.test.js`、`tests/pages.characters.syntax.test.js` を実行し、通過を確認した。

### `data/Dictionaries/` と作品別 `Dictionaries/` を追加し、`Area` / `Belonging` 辞書本体を分離

- グローバル辞書用に `data/Dictionaries/` を追加し、`db_meta.json` の辞書カタログと `dict_Area.json` / `dict_Belonging.json` の実体ファイルへ `Area` / `Belonging` 辞書を分離した。
- 作品別にも `data/Works_*/Dictionaries/` を追加し、作品固有辞書を今後増やせる受け皿として `db_meta.json` / `db_type.json` の空プレースホルダを用意した。
- `lib/sw-common.js` の `readGlobalMeta()` / `readWorkMeta()` は `Dictionaries/` 側のカタログと各 `dict_*.json` を runtime で読み込み、`General.$VarsDef` へ `#Dict_*` と後方互換の `#List_*` の両方を合流して返すようにした。
- `pages/characters.js` の direct fetch fallback も `data/Dictionaries/` を読むようにし、Service Worker を経由できない環境でも `BelongingArea` を含む辞書表示が崩れないようにした。
- `data/db_meta.json` からは `#List_Area` / `#List_Belonging` の実体配列を削除し、静的実体は辞書 DB 側を正とする構成へ切り替えた。
- 辞書カタログでは JSON ファイル名を個別指定せず、`#Dict_*` から `dict_{DictName}.json` を推論する方針へ変更した。
- 回帰確認として `tests/sw.deftype.merge.test.js`、`tests/sw.enrich.basic.test.js`、`tests/pages.characters.syntax.test.js`、`tests/data.shape.test.js`、`tests/enrich.dblink.jump.merge.test.js` を実行し、通過を確認した。

### `Area` / `Belonging` を `#DictIndex` 化し、`BelongingArea` 補助展開を廃止

- `data/db_type.json` で `Area` を `#DictIndex`、`Belonging` を `#DictIndex[]` として宣言し、いずれも `$dict` で辞書名を持てるようにした。
- これにより `BaseArea` は `$Def_BaseArea` という object typedef 名へ役割を限定し、トップレベル実フィールドは `BelongingArea` に統一した。
- `data/db_meta.json` の `#List_Belonging` でも、所属辞書の補助情報キーを `BaseArea` から `BelongingArea` へ改名した。
- `lib/data-common.js` では、`#List_Belonging` から top-level `BelongingArea` を自動補助展開する処理を削除し、所属辞書の拠点情報は辞書項目側の情報としてのみ保持するようにした。
- `pages/characters.js` は `#DictIndex` を `#ListIndex` と同系統の辞書参照型として表示解決できるようにし、将来 `#Dict_*` へ辞書定義を分離する準備を入れた。
- 回帰防止として `tests/data.shape.test.js` と `tests/enrich.dblink.jump.merge.test.js` を更新し、対象テストと `tests/pages.characters.syntax.test.js` の通過を確認した。

### basic セクションの既定表示を `basicFields` / typedef 指定のみに限定

- `pages/characters.js` で、`$DetailLayout.basicFields` 未指定時に使っていた固定 fallback 配列を廃止した。
- これにより、basic セクションへ出る項目は、作品別 `db_meta.json($DetailLayout.basicFields)` に列挙されたものと、`db_type.json($DefType).$display.section = basic` を持つものだけになった。
- `Belonging` / `BirthDay` / `AnivDay` / `BaseArea` / `Area` など schema 側で basic 指定がある項目は従来どおり表示されるが、未指定作品での `FormalName` / `ModelName` / `ModelNumber` などの自動 fallback 表示は行わないようにした。
- `pages/characters.html` の `asset-version` を更新し、ブラウザが新しい `characters.js` を取得しやすくした。

### `Belonging` 辞書内の `BaseArea` を enrich で `BaseArea` として補助展開

- `lib/data-common.js` で `#List_Belonging` の各項目に含まれる `BaseArea` を逆引きできる index を構築し、`Belonging` だけを持つレコードでも enrich 時に `BaseArea` を補助展開できるようにした。
- `BaseArea` が未設定で、所属から一意に活動拠点を導ける場合のみ top-level `BaseArea` に反映し、複数候補がある場合は `_enrichment.derivedBaseAreas` に保持するようにした。
- `data/db_type.json` / 作品別 `db_type.json` / `db_meta.json` に残っていた `$TypeDef` を `$DefType` へ統一し、live data 上の旧キー依存を解消した。
- `data/db_type.json` の `$Def_BaseArea` を `$DefType` ベースへ正規化し、`about` / `about_EN` を含む宣言へ拡張した。`BelongingArea` はこの object typedef を使い、top-level `Area` は `#ListIndex` の独立宣言として分離した。
- `pages/characters.js` では `$Def_BaseArea` の表示整形を `Area + about` 対応へ寄せ、`Area` の補助ハードコードを削減した。
- 回帰防止として `tests/enrich.dblink.jump.merge.test.js` に `Belonging -> BaseArea -> BelongingArea` の補助展開テストを追加し、通過を確認した。
- 追加で `tests/data.sanity.test.js` に「`/data` 配下で `$TypeDef` を使わない」検証を追加し、通過を確認した。

### `Day` / `StoryEra` の表示を typedef 駆動へ寄せ、basic 補助行ハードコードを削減

- `data/db_type.json` の `BirthDay` / `AnivDay` に `$display.section: basic` を追加し、キャラシートが schema に従って基本情報へ載せられるようにした。
- `pages/characters.js` の表示整形で、`$Def_Day` / `$Def_Day[]` を `DayAbout` 含みで generic に整形し、`AnivDay` 配列は改行ベースで表示するようにした。
- `pages/characters.js` で `StoryEra` の概要表示を共通 formatter 経由へ寄せ、DB 概要パネルの年代メモも `about_JP/about_EN/about` ベースの typedef 的な扱いへ揃えた。
- `pages/characters.js` では `Belonging` / `BirthDay` / `AnivDay` の basic 補助行ハードコードを減らし、schema と `$DetailLayout.basicFields` 側の責務を優先するようにした。
- 回帰確認として `tests/pages.characters.syntax.test.js` を実行し、通過を確認した。

### `db_type.json` / `db_meta.json` の宣言面と内部処理ドキュメントを補強

- `docs/schema-meta-processing.md` を追加し、`$DefType` / `$VarsDef` / `$IndexDef` / `$MetaType` と `CreationWorks` / `Databases` / `_Commons` / `_Secondaries` の責務、および SW/enrich/UI での合流順を整理した。
- `docs/db-update-guidelines.md` に、作品/DB カタログ schema、DB 表示名、`$VarsDef` 合流方針への補足を追加した。
- `docs/README.md`、`docs/api-sw-spec.md`、`docs/implementation-playbook.md` から新しい技術メモへ辿れるようにした。

### セッション完了状態に合わせて指示書と進捗ログを同期

- `.github/copilot-instructions.md` に、`docs/schema-meta-processing.md` の参照方針、`$MetaType` / `DB_Label` の運用、`$VarsDef` の実行時合流前提を追記した。
- `_work_in_progress/2026-03-31_remaining-task.md` に、希望タスク 1〜3 の完了状況を追記した。
- `_work_in_progress/2026-04-21_progress_multi-index-display.md`、`_work_in_progress/2026-04-22_progress_creationwork-meta-api-ui.md`、`_work_in_progress/2026-04-22_progress_schema-meta-docs.md` の未完了タスク欄を完了状態へ更新した。

### `db_meta.json` の創作タイトル情報を API/UI で参照可能に拡張

- `lib/sw-common.js` の `works` / `works/{work}` / `works/{work}/db` / `bootstrap` 応答へ、`CreationWorks` の `Title` / `Title_EN` / `Works_Summary` / `OldTitles` と、作品別 `Databases` の `DB_Summary` / `StoryEra` を正規化して含めるようにした。
- `pages/characters.html` / `pages/characters.js` / `pages/characters.sass` に、選択中の作品情報と DB情報を表示する概要パネルを追加し、作品概要・旧題・年代メモ・DB概要を閲覧できるようにした。
- 回帰確認として `tests/sw.work-meta-info.test.js` と `tests/pages.characters.syntax.test.js` を実行し、通過を確認した。

### DB 表示名とカタログ用 schema 宣言を追加

- 作品別 `data/Works_*/DataBases/db_meta.json` の各 `Databases.#DB_*` に `DB_Label` / `DB_Label_EN` を追加し、DB セレクトや概要表示で人間向けラベルを使えるようにした。
- `lib/sw-common.js` の DB カタログ整形で `DB_Label` / `DB_Label_EN` を返し、旧メタには既定ラベルを補完するようにした。
- `pages/characters.js` と `pages/characters.html` で DB キー直表示をやめ、表示名優先で選択肢と概要ヘッダを描画するようにした。
- `data/db_type.json` に `$MetaType` を追加し、CreationWorks / OldTitles / DatabaseCatalog / StoryEra の補助 schema 宣言を持たせた。
- 回帰確認として `tests/sw.work-meta-info.test.js`、`tests/pages.characters.syntax.test.js`、`tests/meta.catalog.schema.test.js` を実行し、通過を確認した。

### object 形式 `#Index` の複数要素表示と `$display.index` 制御を追加

- `pages/characters.js` で object 形式の `#Index` を複数要素として収集できるようにし、一覧 chip / 詳細 pill / `#Index` 値整形 / `idx` `idxKey` 一致判定を同じ helper 群へ統一した。
- 既定値として、一覧 chip と canonical な直リンクは主要サブ要素を優先しつつ、詳細ヘッダと `#Index` 値表示では非空の全サブ要素を表示するようにした。
- 各サブ要素の `"$display": { "index": { list, detail, value, link, priority, order } }` により、作品別 typedef 側で表示対象と優先順位を宣言的に調整できるようにした。
- 運用ルールを `docs/db-update-guidelines.md`、`docs/implementation-playbook.md`、`.github/copilot-instructions.md` へ同期した。

### `_Secondaries` の default fallback 優先順位を明確化

- `lib/sw-common.js` と `pages/characters.js` で、`Databases.#DB_<DbName>._Secondaries[]` のうち全 `sec_**` 条件が `null` / 空の定義をデフォルト fallback として扱い、条件付き定義が一致した場合はそちらを優先するように整理した。
- これにより、`_Secondaries` 配列の並び順に依存せず、`sec_Category` / `sec_DesignedBy` / `sec_SeriesTitle` を持つ具体定義が fallback 定義より優先されるようにした。
- `data/Works_NumberTales/DataBases/db_SelfSecondary.json` では、一部レコードの `sec_DesignedBy` typo を正規キーへ揃え、`ナンバーテールズ化企画` 向け `_Commons` に一致するよう修正した。
- 回帰確認として `tests/commons.secondaries.test.js`、`tests/sw.enrich.basic.test.js`、`tests/sw.dbmeta.tolerance.test.js` を実行し、通過を確認した。

### 実装運用プレイブックと Copilot 指示書を更新

- `docs/implementation-playbook.md` を追加し、UI / API / SW / data / docs の各レイヤーで「まずどこを正にするか」「どのファイルを先に確認するか」「変更後にどの docs を同期するか」を整理した。
- `.github/copilot-instructions.md` に、2026-04 セッションで確定した運用ルールとして、List 系詳細の multiline 表示、bilingual multiline の 2 列表示、basic 補助行の重複抑制、cross-work `_DBLink` 制約、`db_meta.json` 欠損耐性、docs 同期方針を追記した。
- `docs/README.md` から新しい実装運用プレイブックへ辿れるようにした。

### API / SW 周辺の技術仕様ドキュメントと注釈を補強

- `docs/api-sw-spec.md` を追加し、`/api/v1` / `/pages/v1` / `/svc/v1` の役割差、`db_type.json` / `db_meta.json` / 予約語の責務分担、`_enrichment` の出力仕様、`db_meta.json` 欠損時ポリシーを整理した。
- `docs/README.md` と `docs/viewer-guide.md` から新しい API/SW 技術メモへ辿れるようにした。
- `lib/sw-common.js` に、bootstrap / DB取得 / search / varsdef の設計意図が分かる注釈を追加した。
- `lib/data-common.js` に、work context の辞書合成、cross-work `_DBLink` の schema 制約、`_enrichment` / `displaySections` の位置づけが分かる注釈を追加した。

### `_DBLink` の別作品参照で schema 未宣言項目を抑止

- `lib/data-common.js` の `_DBLink` 穴埋めマージで、別作品から参照する場合は対象作品の `db_type.json($DefType)` とグローバル `data/db_type.json($DefType)` に宣言されたトップレベル項目だけを取り込むようにした。
- これにより、`Works_UnauthedLogica` から `Works_NumberTales` を `_DBLink` 参照した際に、UnauthedLogica 側で宣言していない `Relations` などのトップレベル項目が不要に混入する経路を遮断した。
- 回帰防止として `tests/enrich.dblink.jump.merge.test.js` に「別作品 + schema 未宣言キーはマージしない」テストを追加した。

### `#ListIndex[]` / `#ListLink[]` の詳細表示を要素ごと改行

- `pages/characters.js` の表示整形で、typedef 上の `#ListIndex[]` / `#ListLink[]` は配列要素を `, ` 連結せず改行連結するようにした。
- `kvTable()` 側でも改行文字列を `white-space: pre-wrap` で表示するようにし、`Belonging` のような複数所属が 1 要素 1 行で読めるようにした。
- 詳細ビューの basic 補助テーブルでは、`Belonging` / `Area` / `BirthDay` / `AnivDay` が `db_meta.json($DetailLayout.basicFields)` ですでに表示されている場合に重複追加しないようにした。
- `##String_JP` / `##String_EN` の名称系フィールドで、和英のどちらかに改行が含まれる場合は詳細テーブル内で JP/EN を左右 2 列に分けて表示するようにした。

### データ schema の typo・命名修正

- 共有 schema と作品別データで、relation label の typo `secletRelation` を `secretRelation` へ統一した。
- 共有 schema / NumberTales / PastDivers の relation 応答キー `ComeBacked` を `Reply` へ改名した。
- 共有 schema と NumberTales 系データの関連メモ項目 `RelationAbouts` を `RelationNotes` へ改名した。
- 共有 schema と複数作品データの能力値キー `Communicating` を `Communication` へ統一した。
- 共有 schema と複数作品データの弱点項目 `Weakpoint` を `Weakness` へ改名した。
- 作品識別子 `DestinyFoxsRecords` を `DestinyFoxRecords` へ更新した。
- 回帰確認として `tests/data.sanity.test.js` / `tests/data.shape.test.js` / `tests/sw.deftype.merge.test.js` / `tests/sw.enrich.basic.test.js` を実行し、通過を確認した。

### Decave enum 辞書の API/UI 合成対応

- `lib/sw-common.js` の `v1/deftype/global` で、`db_meta.json` に加えて `data/db_type.json($VarsDef)` も `General.$VarsDef` へ合流して返すようにした。
- `lib/sw-common.js` の `v1/works/{work}/meta` でも、作品別 `db_type.json($VarsDef)` を `meta.General.$VarsDef` に含めるようにした。
- `pages/characters.js` の `fetchGlobalDefType()` で、API 応答が古い/不完全な場合でも `db_type.json` 側の `$EnumDef_*` を補完し、`Decave` の表示解決を維持するようにした。
- 回帰防止として `tests/sw.deftype.merge.test.js` を追加した。

### キャラシートの wrapper/spec 表示修正

- `pages/characters.js` で、`$EnumDef_*` / `#ListIndex` / `#ListLink` / `#Index` の wrapper object を汎用 object 展開より優先して整形するよう変更した。
- これにより、`Works_UnauthedLogica` の `ExistingRarity` が `Rarity: SSR` のような内部キー表示へ崩れる問題を修正した。
- `pages/characters.js` で `specStats` 内の `SpecType` 候補推定を補強し、`Works_FLInvestigator78` で `EffectStats` を誤って能力種別扱いしにくいよう調整した。
- `pages/characters.html` の `asset-version` を更新し、ブラウザ側で新しい `characters.js` を確実に取得できるようにした。
- `pages/characters.js` で `specStats` コンテナ自体を能力値グリッド推定から除外し、`Works_FLInvestigator78` の `ArcanumspecStats` が `能力種別: [object Object]` / `効果詳細: 普通, ...` として誤描画される経路を遮断した。
- `pages/characters.js` で `specStats` 配下の未処理フィールドを `$display.section` に従って spec/profile セクションへ合流するよう変更し、`Works_PastDivers` の `ChronoizedPurity` と `ChronoizedAbout` が表示されるようにした。
- `lib/data-common.js` の enrich 処理で `#ListLink_*` を varsdef から逆引きし、`EffectText` / `SafetyLevelText` などの wrapper object に `Rank` と補助ラベルを再帰補完するよう変更した。
- これにより、作品ごとの差分ではなく SW 側の共通正規化で「スペック/能力」の表示書式を揃えやすくした。
- 回帰防止として `tests/enrich.dblink.jump.merge.test.js` に `#ListLink` 補完テストを追加した。
- `pages/characters.js` の API fetch を `cache: 'no-store'` に変更し、ブラウザが古い enrich 応答を再利用して表示差分が反映されない状況を避けるようにした。
- `pages/characters.html` の `asset-version` を `2026.04.06.5` へ更新し、最新の `characters.js` を取得しやすくした。
- `pages/characters.js` の spec/effect 判定で使う「単一葉オブジェクト」判定を緩和し、SW enrich によって `Rank` や `*_EN` が補完された `#ListLink` wrapper でも `EffectStats` / `SafetyLevel` を表示対象として維持するよう修正した。
- `pages/characters.js` で `SpecLevel` のような rank 系 spec 項目を `SafetyLevel` と同じタグ群へ寄せ、`運命線探偵78` の「安全レベル」と「能力レベル」で表示レイアウトが分かれる問題を解消した。
- `pages/characters.js` で `BirthDay` を `AnivDay` と同じ basic 補助行として扱うよう修正し、`誕生日` が「その他の項目」へ落ちる不具合を解消した。
- `pages/characters.js` の詳細表示を typedef / meta 駆動へ寄せ、未定義のトップレベル項目を自動的に「その他の項目」へ流すフォールバック、および `_DBLink` / `_DBLinkResolved` の表示を停止した。

### API テスト UI のエンドポイント検証を強化

- `api/api.js` で、API テスト UI の入力値をそのまま `fetch()` しないよう変更した。
- カスタム入力およびボタン経由のパスは、同一オリジンかつ `'/api/v1/*'` に解決される場合のみ実行するよう制限した。
- `javascript:` などの不正スキーム、外部オリジン URL、許可外パスは UI 上で拒否し、エラーログ表示へ切り替えるようにした。
- 回帰防止として `tests/api.endpoint-guard.test.js` を追加した。

## 2025.08.21〜2025.08.30

### DB大規模拡張・データ構造整備 / APIテストページ整備

- 複数作品（NumberTales / FLInvestigator78 / ShouArRiders / SinisterChangingGirls / Proxies / DestinyFoxRecords 等）の DB 更新と、`db_meta.json` などメタ情報の整理を実施。
- `api/` 側のテストページ・スクリプトの整備を進め、疑似 API の動作確認導線を改善。

#### 影響範囲（代表）

- `api/api.js`, `api/index.html`
- `data/db_meta.json`
- `data/Works_*/DataBases/*.json`

## 2025.10.25〜2025.10.30

### キャラシート機能（pages）実装・安定化 / テスト導入

- `pages/characters.*` を中心に、キャラシート表示ページの実装と段階的な動作検証（試運転）を実施。
- `pages/sw.js` を含む Service Worker 連携の整備と bugfix を反復し、GitHub Pages 環境での動作安定性を向上。
- Vitest による基本テスト（データ整合・構造・SW エンドポイント）を追加。
- GitHub Pages 向けの運用整備として、`.nojekyll` の追加や GitHub Actions ワークフロー追加を実施。

#### 影響範囲（代表）

- `pages/characters.html`, `pages/characters.js`, `pages/characters.sass`, `pages/characters.css`
- `pages/sw.js`, `api/sw.js`, `svc/sw.js`
- `tests/data.sanity.test.js`, `tests/data.shape.test.js`, `tests/sw.enrich.basic.test.js`
- `.github/workflows/jekyll-gh-pages.yml`, `.nojekyll`

## 2025.11.23

### 共通ライブラリアーキテクチャの実装

#### 実装された変更内容

1. **SharedLibrary アーキテクチャの導入**
2. **StandardEndpointHandlers クラスの実装**
   - Service Worker 間で重複していた標準エンドポイント処理を統合

- UI: 詳細ビューの表示制御を拡張し、`data/db_meta.json` の `CreationWorks.<work>.$DetailLayout`（`headerPills`/`basicFields`/`suppressKeys`）に追従できるようにした。
- UI: `data/db_type.json` の `"$display"` に `auto:false` を追加し、自動表示から除外できるようにした（別名/統合表示向け）。
- Data: `data/db_type.json` に `ModelName`/`Class`/`Class_EN` のトップレベル定義を追加し、`CodeName`/`SPCodeName_EN`/`Class_EN` へ `auto:false` と `aliasOf` を付与した。
  - スコープ対応機能（API、Pages、SVC）
  - エンリッチメント制御（Pages スコープでのみ有効）
  - 約 300 行以上の重複コード削除を実現

3. **EnrichmentProcessor.enrichRecords()メソッドの追加**
   - キャラクターデータの充実化処理機能
   - 画像情報の自動抽出と処理
   - 検索可能テキストのインデックス化
   - エラーハンドリング機能付き

4. **Service Worker 統合とマルチスコープ対応**
   - api/sw.js: 標準 API エンドポイント（エンリッチメントなし）
   - pages/sw.js: キャラクターページ特化（エンリッチメント付き）
   - svc/sw.js: 広告ブロッカー回避用（エンリッチメントなし）

#### 技術的効果

- **保守性向上**: 共通ライブラリによる一元管理
- **コード削減**: 300 行以上の重複コード削除
- **機能統一**: 全スコープで統一された API 動作
- **エラー修正**: enrichRecords メソッド不存在エラーの解決
- **テスト通過**: 全 4 つのテストケースが成功

## 2025.11.26〜2025.12.27

### DB更新（コンテンツ追加・調整）

- DB進捗更新（例: ナンバーテールズ / 運命線探偵 / 獣爾騎兵）を継続。

#### 影響範囲（代表）

- `data/Works_NumberTales/DataBases/db_Primary.json`
- `data/Works_ShouArRiders/DataBases/db_Primary.json`

## 2026.01.24〜2026.01.27

### DB整備・README更新

- 複数作品の DB 情報追加と、`db_meta.json` / `db_type.json` 周辺の整備・軽微な bugfix を実施。
- `README.md` の更新（複数コミット）を実施。

#### 影響範囲（代表）

- `data/Works_*/DataBases/*.json`, `data/db_meta.json`, `data/db_type.json`
- `README.md`

## 2026.02.03

### 呼称フィールド正規化（後処理）と半自動チェックの追加

- 呼称フィールド（callings）正規化のための半自動チェック・後処理手順を整理。
- 正規化支援スクリプト `tools/normalize-callings.mjs` を追加。
- 作業ログを `_work_in_progress/2026-02-03_callings-normalize.md` に記録。

#### 影響範囲（代表）

- `tools/normalize-callings.mjs`
- `data/Works_*/DataBases/*.json`
- `_work_in_progress/2026-02-03_callings-normalize.md`

## 2026.02.18

### typedef 駆動エンリッチ強化 / キャラシート不足フィールドの改善

- `db_type.json($DefType)` を参照した typedef 駆動のエンリッチ・表示追従を強化。
- キャラシート側の不足フィールドや表示追従を改善し、挙動を作業ログに整理。

#### 影響範囲（代表）

- `lib/data-common.js`, `lib/sw-common.js`
- `pages/characters.js`, `pages/sw.js`
- `_work_in_progress/2026-02-18_characters-missing-fields.md`
- `_work_in_progress/2026-02-18_sw-typedef-driven-enrichment.md`

## 2026.02.20

## 2026.03.06

### 会話パターン情報追加のためのスキーマ拡張（typedef）

- `data/db_type.json($DefType)` に `ConversationPattern` を追加し、会話パターン（口調/話題傾向/頻度等）を格納できるようにした。
- `ConversationPattern` 配下の `DialogueExamples` を `#Dialogue[]|#Dialogue_withAbout[]|#Null` として整理し、台詞系テキストであることを typedef 上で明示した。
- 値（コンテンツ）は User 手動入力を前提とし、Copilot による創作内容の自動生成を避ける運用を想定。
- `ConversationPattern` は当面 `searchable:false` とし、表示は可能だが検索インデックスへは含めない方針を明示した。
- `#Dialogue[]|#Dialogue_withAbout[]|#Null` の運用確認として、ネストした array union 型の enrich 正規化と、`ConversationPattern` の構造化表示に対応した。
- `data/Works_NumberTales/DataBases/db_type.json` の `Relation.*.Comments` を `#Dialogue` 化し、関係欄コメントも台詞系として schema-driven に整形できるようにした。

### pages/characters.js の構文エラー修正

- `pages/characters.js` 先頭に関数内コード断片が混入し、ブラウザで `Illegal return statement` が発生してキャラシートが表示不能になる不具合を修正した。
- あわせて `tests/pages.characters.syntax.test.js` を追加し、`node --check` による構文スモークテストで同種の破損を検知できるようにした。

### `#Dialogue` 表示統一と nullable 型の整理

- `#Dialogue` 型は `Relation.Comments` の本文と同じ共通ノードで描画するようにし、会話例と関係コメントの表示書式を統一した。
- `Hobby` / `SpetialSkill` / `Favor` / `Unlike` / `Strength` / `Weakpoint` を `#String|#Summary|#Null` に統一した。
- `ConversationPattern` の `TalkingTone` / `TopicPreference` / `TalkFrequency` / `PreferredTopics` / `AvoidedTopics` / `ConversationNotes` も `#String|#Summary|#Null` に統一した。

### `ConversationPattern` の詳細表示レイアウト調整

- `ConversationPattern` は表形式ではなく、項目ごとの「見出し枠 + 本文」で表示するように変更した。
- `DialogueExamples` は `Relation` セクションに近い `kv-grid` の複数枠表示へ寄せ、各台詞例を独立した枠として表示するようにした。

### Object 型フィールド処理の強化（その1〜3）

#### 変更内容

1. **キャラシート表示の Object 値フォーマット強化**
   - `pages/characters.js` で、Object 型値が `[object Object]` にならないよう表示整形を強化
   - `_Jump` / `_DBLink` / `_Search` などの参照系オブジェクトを人間が読める形に整形
   - `Weight_kg` / `Height_cm` など単位付きの基本項目でも、`{ value, about_* }[]` / `{ hideText }` を含めて表示可能に
   - `_Commons` 適用時に `#List_*` 等のメタ定義がレコードへ混入しないよう、`#`/`_` 始まりキーを除外

2. **検索（EnrichmentProcessor.searchRecords）の Object 値比較を強化**
   - Object/配列/ラッパー（`{ value, about_* }` / `{ hideText }` 等）の揺れを吸収し、検索一致判定の耐性を向上

3. **参照マージ出力（\_DBLink / \_Jump）の実装**
   - `lib/data-common.js` の `EnrichmentProcessor.enrichRecords()` に、参照先DBの解決→同名フィールド穴埋め→`_Jump` 実値置換を追加
   - `_Search` は **1件一致のみ採用**（曖昧一致・複数一致はスキップ）
   - `hideText` は意図的マスクとして尊重（参照先値で上書きしない）
   - 画像系フィールドは **別DB（別JSON）から参照しない**（同一JSON参照の場合のみマージ許可）

4. **テスト追加**
   - `tests/enrich.dblink.jump.merge.test.js` を追加し、`_DBLink/_Jump` マージ挙動を回帰防止

5. **進捗ログ追加**
   - `_work_in_progress/2026-02-20_dblink-jump-merge.md` に実装方針・影響範囲・検証結果を記録

#### 影響範囲

- `pages/characters.js`
- `lib/data-common.js`
- `tests/enrich.dblink.jump.merge.test.js`
- `_work_in_progress/2026-02-20_dblink-jump-merge.md`

### typedef 表示メタデータ（`$display`）の試験導入

- `db_type.json($DefType)` に後方互換な表示メタ情報 `"$display"` を追加（宣言のみ・既存挙動は維持）。
- まず `unit`（例: `Height_cm`/`Weight_kg`）と、UI分類用の `section`、管理主体/タグ領域を表す `tagSpace`（`creation`/`creatorProgress`/`system`/`internal` 案）を導入。
- グローバルだけでなく、作品別 `data/Works_*/DataBases/db_type.json` にも `Images` や enum/list 系フィールドへ `section/tagSpace` を追記し、スキーマ駆動表示への移行準備を開始。
- クライアント（`pages/characters.js`）で `"$display.unit"` を参照し、身長/体重などの単位付き表示を typedef 駆動へ移行（cm/kg のハードコードを撤去）。
- クライアント（`pages/characters.js`）で `"$display.section"` を参照し、未表示のトップレベル項目を `basic/profile/spec/other` へ自動振り分けして表示するよう対応。
- 設計メモを `_work_in_progress/2026-02-20_schema-driven-display-format.md` に整理。

## 2026.02.21

### キャラシート: db_meta.json（$VarsDef）ネスト定義の参照強化

- `pages/characters.js` の `#ListIndex` 表示解決で、作品別 `db_meta.json` にある `$Def_*` 配下の `#List_*`（例: `$Def_ArcanumspecStats.$Def_SpecType.#List_Material`）も参照して表示名を解決できるようにした。
- `DualizePattern` のように `#List_<Field>` 内の実値キーが `Pattern` になるケースも、値一致による柔軟な逆引きで表示名へ解決するよう改善。

### キャラシート: object子要素の分解表示 / Relation表示の宣言駆動化

- UI（`pages/characters.js`）: typedef 上で子フィールドが定義されている object 値（例: `For79or80thDealerCalling` / `SpecType.ActionType`）を、子ラベル付きで展開して表示するようにし、`[object Object]` 表示を回避。
- UI（`pages/characters.js`）: `Relation.Related[].RelationLabel` を `db_meta.json($VarsDef.#List_RelationLabel)` でJP化して表示するようにした。
- Data（NumberTales）: `data/Works_NumberTales/DataBases/db_type.json` の `$VarsDef.$Def_Relations.$TypeDef` を `data/Works_NumberTales/DataBases/db_meta.json(General.$VarsDef.$Def_Relations.$TypeDef)` へ移動し、`db_type.json` からは `$VarsDef` を削除。
- Data（ShouArRiders）: `BeastspecName` / `BeastspecName_EN` に `$display.section:"profile"` を追加し、「プロフィール/テキスト」へ自動分類されるようにした。
- UI（`pages/characters.js`）: `resolveVarsDefLabel()` が `Databases.*._Commons`（例: ShouArRiders の `#List_Beast`）も探索して `#ListIndex` の表示名解決に利用できるようにした。
- UI（`pages/characters.js`）: `#ListIndex_withAbout[]`（例: `RaceType`）の `{ <Field>: code, about(_JP|EN) }` を「表示名（about）」として整形できるようにした。

#### 影響範囲（代表）

- `pages/characters.js`
- `db_type.json($DefType)` の `$alt`（代替フィールド参照）を UI と enrich 出力が解釈し、該当キーが無い場合に代替キーを参照できるようにした。

### EnumDef/EnumLink 表示のフィールド単位制御（Rank/Rarity）

- UI（`pages/characters.js`）で、typedef 由来の `$type` に含まれる `$EnumDef_*` / `$EnumLink` を汎用的に解釈し、Rank/Rarity などの定義型を共通ロジックで表示整形できるようにした。
- UI（`pages/characters.js`）の表示整形（`formatValueForDisplay()`）へ `fieldKey` を伝播し、作品別 `db_meta.json` の `$EnumLink_${Field}`（例: `$EnumLink_ExistingRarity`）から表示名を解決できるようにした。
- `$EnumLink` が存在する場合の既定表示は「alphaLabel（コード＋ラベル）優先」（仮設定）としつつ、`db_type.json($DefType)` の `$display` に `rankFormat` / `rarityFormat` / `enumFormat` を指定することでフィールド単位に表記を切り替えられるようにした。
- `$EnumLink_*` 定義が `db_meta.json` の `$VarsDef` 内でネストしているケース（例: `$Def_AbilityStats.$EnumLink_AbilityText`）を想定し、UI 側でネスト探索して解決できるようにした。
- `db_type.json($DefType)` の `$display.enumLinkKey` により、参照する `$EnumLink_*` をフィールド単位に指定できるようにした（例: `AbilityStats` → `AbilityText`、`SpecLevel` → `SpecLevelText`）。
- `#ListLink_*` が typedef で宣言されている「文字列ラッパー」（例: `{ EffectText: '絶大' }` / `{ SafetyLevelText: '安全' }`）について、`db_meta.json` の `#ListLink_*` 定義から逆引きして `Rank` を取り出せる場合は `alphaLabel`（例: `S（絶大）`）として表示できるようにした。
- `db_type.json($DefType).$display` に `listLinkShowEnum`（boolean）/ `listLinkEnumName`（string）を追加し、#ListLink の enum 併記可否・参照する enum キーを JSON 側で制御できるようにした（JS 側のハードコード削減）。
- Data: `data/db_type.json` の `AbilityStats` に `$display.rankFormat` を追記（例示）。
- Data: `data/Works_UnauthedLogica/DataBases/db_type.json` の `ExistingRarity` に `$display.rarityFormat` を追記（例示）。

#### 影響範囲（代表）

- `data/db_type.json`
- `data/Works_FLInvestigator78/DataBases/db_type.json`
- `data/Works_NumberTales/DataBases/db_type.json`
- `data/Works_ShouArRiders/DataBases/db_type.json`

### EnumDef/#ListIndex: JP/EN 併記と表示制御（langMode）

- UI（`pages/characters.js`）: `$EnumDef(|$EnumDef_withAbout)` および `#ListIndex(|#ListIndex_withAbout)` の表示で、辞書（`db_meta.json`）から JP/EN を取得し `JP / EN` 形式で併記できるようにした。
- UI（`pages/characters.js`）: 作品別メタで `#List_*` が `General.$VarsDef` 以外（例: `General.$Def_Relations.#List_RelationLabel`）に定義されている場合も探索して解決できるようにし、RelationLabel がコード（英語）だけになる問題を回避。
- UI（`pages/characters.js`）: typedef の `$display.langMode`（任意）で、JP/EN の表示切替・併記抑制ができるようにした（例: `'jp' | 'en' | 'enJp' | 'raw'`）。
- UI（`pages/characters.js`）: グローバル定義辞書の取得失敗時に「空オブジェクトをキャッシュして固定化」しないようにし、Service Worker が制御状態になった後に再試行で復旧できるようにした。
- UI（`pages/characters.js`）: グローバル辞書/typedef キャッシュが期待形でない場合は自動的に破棄して再フェッチする自己復旧を追加（古いキャッシュ等で辞書解決できずコード表示に戻るケースの緩和）。
- UI（`pages/characters.js`）: `fetchGlobalDefType()` の API 応答が期待形でない場合に、`/data/db_meta.json` を `cache:'no-store'` で直 fetch する最終フォールバックを追加（GenderType 等がコード表示に戻るケースの最終救済）。
- UI（`pages/characters.js`）: `fetchGlobalDefType()` の妥当性判定を強化し、`General.$VarsDef.$EnumDef_GenderType` を含まない不完全な辞書（誤レスポンス等）を有効キャッシュしないよう修正（「性別だけ FemaleNeutral が残る」根本原因の可能性に対応）。
- UI（`pages/characters.js`）: Service Worker の controller 待ちで「タイムアウトでも成功扱い」になっていたため未制御のまま `/pages/v1/works` を叩いて 404 になる問題を修正（制御されるまで待機し、失敗は初期化エラーとして扱う）。
- UI（`pages/characters.js`）: controller が付与されないケースの救済として、SW ready 後に `clients.claim()` を先に依頼し、短い待機→再試行の段階的待機に変更（SW/キャッシュリセット直後の初期化が 15s 固定で遅くなる問題を緩和）。
- UI（`pages/characters.js`）: `schemaType` 推定が `#String` 等になってしまう経路でも、`fieldKey` があれば `db_meta.json($VarsDef)` を最後に参照して Enum/List の表示名解決を試すよう改善（GenderType が英語コードのまま残るケースの緩和）。
- UI（`pages/characters.js`）: `fieldKey` が `GenderType_JP` のような言語サフィックス付きで伝播した場合でも、VarsDef 参照用のキーをベース名（`GenderType`）へ正規化して Enum/List の表示名解決ができるよう修正（kv-table の性別が `FemaleNeutral` のまま残るケースの根治）。
- UI（`pages/characters.js`）: `$display` 抽出拡張に伴う `ReferenceError`（`traverseTmp` 未定義）で初期描画が落ちる不具合を修正。
- UI（`pages/characters.js`）: `#List_Belonging` のように「ベースキーがJP文字列で \*\_JP が無い」辞書定義でも、JP/EN 併記が EN-only にならないようフォールバックを改善。
- `data/Works_SinisterChangingGirls/DataBases/db_type.json`
- `data/Works_Proxies/DataBases/db_type.json`
- `data/Works_DestinyFoxRecords/DataBases/db_type.json`
- `data/Works_UnauthedLogica/DataBases/db_type.json`
- `_work_in_progress/2026-02-20_schema-driven-display-format.md`

### Secondary DB（二次創作DB）の表示追従（isForSecondary / RelationToPrimary）

- UI（`pages/characters.js`）: `db_type.json($DefType)` のトップレベル項目抽出で `isForSecondary` を DB 文脈（Primary/Secondary）に応じてフィルタし、Secondary 専用フィールドが Primary 側に出ないよう制御を追加。
- UI（`pages/characters.js`）: `RelationToPrimary` を「関係」系セクションとして描画し、Secondary レコードで「原作との関係」を表示できるようにした。

## 2026.02.21

### 2言語対応フィールド（_\_JP / _\_EN）の同義解釈

- UI（`pages/characters.js`）: 詳細ビューの基本情報テーブルとスキーマ駆動の自動表示で、`*_JP`/`*_EN` を同義フィールドとして1行に統合し、重複表示を抑止。
- UI（`pages/characters.js`）: リスト側の簡易検索（`matchFilter`）に `Name_JP`/`FormalName_JP` などの互換キーも追加。
- SW（`lib/data-common.js`）: `EnrichmentProcessor.searchRecords()` が、クエリ hashTag の `base`/`*_JP`/`*_EN` を相互にエイリアス扱いして一致判定できるように拡張。
- Test: `tests/bilingual-fields.test.js` を追加。

### `_Commons` 既定値の適用強化（空値も未設定扱い）

- SW（`lib/sw-common.js`）: `CommonsProcessor.applyCommonsToRecords()` の既定値適用で、`undefined` だけでなく `null` / `''` / `[]` / `{}` も未設定扱いにして `_Commons` を適用するよう拡張。
- `{ hideText: '...' }` は意図的マスクとして扱い、空値として上書きしない。
- これにより、作品別 `db_meta.json` の `_Commons` で指定した初期値が、後段の `_DBLink` 参照で穴埋めされる値より優先される。

### キャラシート: JP/EN 併記・辞書表示・空表示抑止の追補

- UI（`pages/characters.js`）: スキーマ上に base キーしか無い場合でも、実データに `*_JP` / `*_EN` があれば 1 行に統合して表示するよう拡張。
- UI（`pages/characters.js`）: base キーが表示済みの場合は `*_JP` / `*_EN` を二重表示しないよう抑止。
- UI（`pages/characters.js`）: 空配列/空オブジェクト等を「表示不要」とみなす判定を強化し、空の能力種別が余分に出るケースを抑制。
- UI（`pages/characters.js`）: `_DBLink` 解決結果のチップ（`RaceType`/`GenderType`）を typedef/meta 駆動の整形へ統一。
- SW（`lib/sw-common.js`）: `v1/deftype/global` が誤って `db_type.json` を返していたため、`db_meta.json`（`General.$VarsDef` の定義辞書）を返すよう修正。これにより `GenderType` / `RelationLabel` 等の和文化が安定して動作する。
- UI（`pages/characters.js`）: `fetchGlobalDefType()` がラッパー形式（例: `{ meta: ... }`）のレスポンスを受け取った場合でも辞書本体を復元できるようにし、`GenderType` などが英語コード表示にフォールバックするケースを緩和。
- UI（`pages/characters.js`）: 詳細ビューの基本情報テーブルで、値整形に `metaForLookup`（work+global 統合メタ）を使うよう統一し、グローバル辞書（`$EnumDef_GenderType`）を確実に参照できるようにした。
- UI（`pages/characters.js`）: `#ListIndex` の表示名解決で「値一致を確認せずに先頭要素のラベルを返してしまう」不具合を修正。これにより `Belonging` 等が“常に同一値”になる問題を解消。
- UI（`pages/characters.js`）: typedef が `$EnumDef(|$EnumDef_withAbout)` / `#ListIndex[]` のフィールドについて、辞書定義に応じて「JP/EN 併記（例: `日本語 / English`）」で表示できるようにした（例: `GenderType`, `Belonging`, `RelationLabel`）。
- Data（NumberTales）: `Relation.Related` / `Relation.Commented` / `ComeBacked` の typedef を `$Def_Relations[]` に揃え、実データ（配列）と現行 UI ロジックに合わせて堅牢化。

### GenderType 辞書表示の堅牢化 / `Valiable` 統合

- UI（`pages/characters.js`）: `resolveVarsDefLabelPack()` で `$EnumDef_*` の辞書解決を「キー直引き（例: `#FemaleNeutral`）」優先にし、スキャン依存による取りこぼしを低減。
- UI（`pages/characters.js`）: `GenderType` の typo コード `Valiable` を `Variable` として正規化し、辞書に無くても表示が崩れないよう後方互換を追加。
- Data（`data/db_meta.json`）: `$EnumDef_GenderType` から `#Valiable` を削除し、`#Variable` に統合。
- UI（`pages/characters.js`）: typedef から `GenderType` の `schemaType` が取得できない経路でも、`$EnumDef` として辞書解決を試すフォールバックを追加（英語コード表示の取りこぼし対策）。
- UI（`pages/characters.js`）: デバッグON時に、詳細ビューDOM内に `GenderType` の生コードが残っている箇所を自動検出してコンソールへ出力（表示経路特定用）。

## 2026.03.04

### セキュリティアラート対応（CodeQL 指摘の修正）

- SW（`lib/sw-common.js`, `pages/sw.js`）: `works` / `db` パラメータを英数字+`_` のみ許可し、不正な入力は 400（Bad Request）として扱うように修正（パス注入/パストラバーサル対策）。
- SW（`lib/sw-common.js`）: `works/db` の不正入力や DB 不存在を 500 で落とさず、400/404 で返すようハンドリングを改善。
- UI（`pages/characters.js`, `pages/characters_final.js`）: `innerHTML` による動的文字列描画を廃止し、`textContent` と DOM 構築で表示（DOM XSS 対策）。
- UI共通（`lib/frontend-common.js`）: `DOMUtils.createElement()` で `innerHTML` を直接セットしないよう変更。

### トップページ導線（GitHub Pages / README）改善

- GitHub Pages: ルートに `index.html` を追加し、UI / API / ガイドラインへの入口を明確化。
- README（`README.md`）: トップ導線をデプロイ先 URL（`database.numbertales-radiann.net`）中心に整理。
- README（`README.md`）: 折りたたみ（`<details>`）内の Markdown 互換性向上のため `markdown="1"` を付与。

### `#Index` 型の段階導入（API 側: search/enrich）

- SW 共通（`lib/data-common.js`）: `EnrichmentProcessor.searchRecords()` が `hashTag:'#Index'` を解釈し、作品 typedef（`data/Works_*/DataBases/db_type.json.$IndexDef`）に基づいて実フィールドへ展開できるようにした。
  - スカラー（例: `key: 1`）だけでなく、ネスト index（例: `key: { Stoat: 'Major', Num: 0 }`）も AND 条件として展開して検索できる。
- 回帰修正（`lib/data-common.js`）: index 子要素が `#Number|#String` のような union の場合は数値比較を抑止し、`'0'` が `'000'` 等に誤一致して複数ヒットになるケースを回避。
- 回帰修正（`lib/data-common.js`）: 検索クエリで `key:null` を明示した場合は `val:null` を一致扱いにし、`#String|#Null` のような Null 許容サブキー（ネスト index）を含む検索が成立するようにした。
- 仕様整理（Breaking）（`lib/data-common.js`, `pages/characters.js`）: `$Index` 互換を削除し、`#Index` に統一。
- UI（`pages/characters.js`）: 一覧・詳細の `#Index` 表示（チップ/ピル/テーブル値）を直リンク（`idx/idxKey`）としてリンク化。
- Test（`tests/enrich.dblink.jump.merge.test.js`）: `#Index` 検索（スカラー/ネスト）の回帰テストを追加。
- Data（作品別 typedef）: 作品ごとの index ルートキー（例: `Num` / `Card` / `BeastType` / `Drc` / `Unit` / `Generation` / `Model`）を、各 `data/Works_*/DataBases/db_type.json($DefType)` に `"$type":"#Index"` として明示。
- Data（Breaking）: 作品ごとの index 定義（表示名/ネスト構造）は `data/Works_*/DataBases/db_type.json.$IndexDef` に集約し、`data/db_meta.json(CreationWorks.*.$DefType_Index / $Def_Index)` から削除。

### Enum/List 表示名解決の堅牢化（一覧の GenderType 回帰対策）

- UI（`pages/characters.js`）: `resolveVarsDefLabelPack()` が `#FemaleNeutral` のような「#付きコード」を受け取っても辞書（`$EnumDef_*` / `#List_*`）から JP/EN 表示名を解決できるようにし、一覧で英語コード表示へ退避する回帰を緩和。
- UI（`pages/characters.js`）: デバッグON時に、一覧の GenderType が生コードに退避した場合のみ最小ログを出力し、辞書欠損/値形式の切り分けを容易化。
- UI（`pages/characters.js`）: 一覧の GenderType チップ表示では `$display.langMode` を適用せず、既定の JP/EN 併記を優先（意図しない `langMode:'en'` 混入で英語コードのみになる回帰の暫定回避）。
- UI（`pages/characters.js`）: `schemaType:'$EnumDef|$EnumDef_withAbout'` を `$EnumDef_withAbout` の文字列一致で誤って enum 名扱いしないよう修正し、EnumDef の辞書解決がスキップされて raw（英語コード）に退避する問題を修正。

### フェーズ2: DB 種別多様化への耐性（メタ欠損フォールバック）

- SW 共通（`lib/sw-common.js`, `pages/sw.js`）: 作品別 `db_meta.json` の欠損/取得失敗時に、DB取得/検索/エンリッチが 500 で落ちないようにし、`_Commons` 適用のみスキップして継続。
- SW 共通（`lib/sw-common.js`）: メタが欠損している場合の DB 列挙フォールバック候補に `PrimaryDealer` / `PrimaryMobs` / `UnprocessedSecondary` を追加。
- SW 共通（`lib/sw-common.js`）: `db_meta.json.Databases.#DB_*._Secondaries[]` の `sec_Category` / `sec_DesignedBy` / `sec_SeriesTitle` による `_Commons` 分岐適用を調整。
  - `sec_SeriesTitle` が未指定の定義では、`sec_Category` 等の指定がある場合はレコード側でも必須一致として扱い、誤適用を防止。
- Test（`tests/sw.dbmeta.tolerance.test.js`）: `readWorkMeta()` 失敗時の耐性に関する回帰テストを追加。
- Test（`tests/commons.secondaries.test.js`）: `sec_Category` による `_Secondaries` 分岐（primary未指定時の必須一致）の回帰テストを追加。

### 開発支援（テスト/ドキュメント）

- Test（`tests/docs.links.test.js`）: Markdown 内の既知誤リンク（例: `pages/characters.html` の単数表記）を継続検知する軽量テストを追加。
- Docs（`README.test.md`, `CONTRIBUTING.md` ほか）: Windows/PowerShell の実行ポリシーで `npm.ps1` がブロックされる環境向けに、`npm.cmd test` / `.\node_modules\.bin\vitest.cmd run` の回避策を追記。

### フェーズ3: 予約語/機械処理キーの整理（命名の言語化・ハードコード削減）

- SW 共通（`lib/sw-common.js`）: 予約語（`_`/`$`/`#`）の判定・既知キー定数・`warnOnce` をまとめた `SchemaNaming` を追加。
- SW 共通（`lib/data-common.js`）: `_DBLink/_Jump/_Search/_enrichment` 等の処理で、`SchemaNaming` を参照して予約語判定・システムキー除外を統一（`startsWith('_')` 等の散在を削減）。
- 互換警告: 作品メタの旧キー `Secondaries` を参照した場合に、開発者向けに一度だけ警告を出す（正は `_Secondaries`）。
- Docs（`docs/db-update-guidelines.md`）: 予約語プレフィックスと命名運用の目安を追記。
- Data（UnauthedLogica）: typedef の legacy ラベルキー `hashtag_JP` を廃止し、`hashTag_JP` に統一。

### フェーズ4: API への統合（エンリッチ/マージの段階移行）

- API（`api/sw.js`）: `GET /api/v1/works/{work}/db/{dbName}` と `GET /api/v1/search` で `?enrich=1` を受け取り、UI 用 API（`/pages/v1`）と同等のエンリッチ出力（参照マージ・`$alt` フォールバック・`_enrichment` 付与など）を opt-in で返せるようにした（既定は互換維持のため enrich 無し）。
- SVC（`svc/sw.js`）: `/svc/v1` でも同様に `?enrich=1` をサポート。
- Docs（`docs/viewer-guide.md`）: `/api`/`/svc` の enrich opt-in を明記。
