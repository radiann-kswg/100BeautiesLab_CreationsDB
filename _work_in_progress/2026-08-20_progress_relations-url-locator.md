# 相関図 URL 圧縮ロケータ設計案

- 作成日: 2026-08-20
- 状態: ✅ 実装済み（2026-09-03）。実装内容・設計からの差分は [2026-09-03_progress_short-link.md](./2026-09-03_progress_short-link.md) を参照
- 対象: `pages/relations.html` / `pages/relations.js`

## 0. チャット内作業の棚卸し

### 完了済み

| 項目 | 結果 | 変更・確認対象 |
| --- | --- | --- |
| 開発環境の UI 目視確認 | 完了 | トップ、キャラシート、API GUI、相関図を確認。作品・DB 取得、57 番直リンク、画像、参照解決、API 200、相関図グラフ描画を確認 |
| API クイックテストのボタン修正 | 完了 | [api/stylesheet.sass](../api/stylesheet.sass) を正として 3 列幅を統一。720px 以下は 1 列。生成 CSS / sourcemap も同期し、デスクトップ・モバイル・`/api/v1/index` 200 を確認 |
| 相関図 URL の現状整理 | 完了 | `m` / `d` / `g` / `f` / `e` / `q` / `sec` / `t` / `lang` の責務を確認 |
| Badge 識別子の既存資産調査 | 完了 | `$IndexDef.$badge`、`Num_Badge`、`Unit_Badge`、`Beast_Badge`、`Works_Code`、`buildBadge().full` を確認 |

### 設計済み・未実装

| 項目 | 現在の案 | 未完了作業 |
| --- | --- | --- |
| 相関図 URL 圧縮 | `r=<map>/<drill...>` を正規形にし、旧 `m` / `d` は読み取り互換 | parser、URL 正規化、テスト、docs、ブラウザ確認 |
| URL 用 Badge | ASCII かつ一意な `{Index}_Badge` と `Works_Code` 付き `full` を URL 識別子に利用 | 不足する Badge / facet locator code のスキーマ・辞書設計、実装、データ検証 |
| キャラシート Badge 入口 | `badge=NTS-57` を解決して `c=NumberTales/Primary/Num:57` へ `replaceState()` | Badge 逆引き、複合 Index 対応、互換優先順位、テスト、ブラウザ確認 |

### 未解決・別タスク候補

- キャラシートで `q=57` を入力した際、番号 57 以外の複数レコードも残る過剰一致を確認した。検索対象へ参照解決後の値が混ざっている可能性があり、URL 圧縮設計とは分離して原因調査する。
- 初回のキャラシート読み込みでブラウザコンソールに 404 が 1 件記録された。画面表示は継続したが、対象リソースは未特定のため、ネットワークログで確認する。
- 相関図 URL の `r=`、Badge 入口の `badge=` は、いずれもこのチャット時点では実装していない。

### 棚卸しの判定

- 完了ログへ退避する対象: なし。相関図 URL 系は設計継続中で、同じログに設計案と未完了事項を保持する。
- 既存の残留タスク台帳への追加: 今回は見送る。実装着手時に 1 タスクとして登録し、`r=` と `badge=` のどちらを同一タスクで扱うか確定する。
- コード変更を伴う完了項目: API ボタン修正のみ。相関図 URL と Badge 入口は設計段階。

## 1. 背景

相関図は現在、表示状態を次の個別クエリへ分散している。

- `m`: マップ（`own` / `shared`）
- `d`: ドリルダウン経路（スラッシュ連結）
- `g`: グルーピング軸
- `f`: フォーカス中ノード
- `e`: 非表示エッジ種別
- `q`: キャラクター検索
- `sec`: 二次創作系 DB を含めるか
- `t`: サムネイル表示
- `lang`: 表示言語

たとえば表示状態によっては、`?m=shared&d=...&g=...&f=...&e=...&q=...&sec=1&t=1&lang=en` のように長くなる。

現実装では `readStateFromUrl()` / `buildStateQuery()` が `pages/relations.js` にあり、キャラシート用の `lib/viewer-locator.js` は `c=<Work>/<DB>/<Index>` の圧縮ロケータを提供している。相関図からキャラシートへ移動する `characterHref()` はすでに同じ `buildViewerQueryString()` を利用している。

## 2. 提案する正規 URL

相関図専用の `r`（relations locator）を追加し、作品スコープとドリルダウン位置を 1 本へまとめる。

```text
relations.html?r=<map>[/<drill-segment>...][&g=...][&f=...][&e=...][q=...][sec=1][t=1][lang=en]
```

例:

```text
relations.html?r=own
relations.html?r=own/NumberTales
relations.html?r=own/NumberTales/所属/百花繚乱研究所
relations.html?r=shared/NumberTales
relations.html?r=own/NumberTales/所属/百花繚乱研究所&g=クラス名&q=イズナ
```

### `r` の意味

- 先頭セグメント: `own` または `shared`
- 2 セグメント目以降: 現在の `state.drill` を順番どおりに格納
- 作品 ID は `Works_` / `#Works_` を付けない短縮形に統一する
- セグメントの値は URL エンコードして境界を保つ。`/` はセグメント区切りとしてのみ扱い、既存の `d` のように未エスケープ値を連結しない
- `own` は既定値なので、初期状態だけは `r` を省略してもよい。生成側は可読性のため `r=own` を出してもよいが、既定値を省略する方が短い

`c` はキャラシートの直リンク専用として維持する。相関図で `c=NumberTales` を受け付ける既存の後方互換は残すが、新規生成では `r=` を使う。

## 2.1 バッジ／URL 識別子の分離

`r` のドリル経路や `f` のフォーカス対象へ `hashTag_JP` / `hashTag_EN`、辞書の表示名、レコードの `Name_JP` / `Name_EN` をそのまま載せない。全角文字、空白、`/`、`&`、読点、言語切替による値の変動を URL の識別子へ持ち込むためである。

既存の相関図実装には、すでに次の短縮値の仕組みがある。

- `lib/graph/graph-badge.js` の `$IndexDef.$badge`
- レコード側の `Num_Badge` / `Unit_Badge`
- 辞書側の `Beast_Badge`
- `data/db_meta.json` の `Works_Code`
- `buildBadge()` が返す作品コード付き `full` 値（例: `NTS-57`）

これを URL 設計にも利用し、次の二層を明確に分ける。

| 用途                | 正とする値                            | 例                     | 和英ラベルの使用 |
| ------------------- | ------------------------------------- | ---------------------- | ---------------- |
| ノードの表示        | `badge`                               | `57`                   | 不使用           |
| ノードの URL 識別子 | `full`                                | `NTS-57`               | 不使用           |
| 作品スコープ        | `Works_Code` または既存の短縮 Work ID | `NTS` / `NumberTales`  | 不使用           |
| 作品・階層の表示    | `hashTag_JP` / `hashTag_EN`           | `所属` / `Affiliation` | 表示専用         |
| 階層値の URL 識別子 | 辞書・facet の ASCII code             | `100BL` など           | 不使用           |

### `{Index}_Badge` の採用案

スカラー Index の生値が URL に向かない場合は、既存の `Num_Badge` / `Unit_Badge` と同じ規則で `{Index}_Badge` をレコードへ置けるようにする。複合 Index は root 名を使い、例として `Card_Badge`、`Letter_Badge` を候補とする。

- 値は ASCII の英数字を基本とし、区切りは `-` のみ許可する
- 作品内で一意であることをデータテストで検証する
- 表示名・英訳名から自動生成しない。表記変更で既存 URL が変わるため、User が値を監修する
- `$IndexDef.$badge.keys` から参照し、レコードへ値がある場合は既存の `buildBadge()` 経路で利用する
- 辞書に由来する Index はレコードへ複製せず、既存の `codeFrom` 形式で辞書の `{Index}_Badge` 列を参照する

`full` の ASCII 性は、相関図の URL 識別子として使う前に検証する。満たさない既存データは URL エンコードで隠すのではなく、`{Index}_Badge` または辞書の Badge 列を追加して解決する。バッジから画像ファイル名を推測する実装は既存方針どおり行わない。

## 2.2 キャラシートの Badge 短縮入口

キャラシートでは、Badge を入力する短縮入口を別パラメータとして受け付け、解決後に既存の `c=` へ正規化する案を採用候補とする。

```text
characters.html?badge=NTS-57
characters.html?badge=FLI-M16&lang=en
```

### 解決フロー

1. `badge` を URL から読み取る
2. `Works_Code` + `buildBadge({ withWorkCode: true })` の結果と完全一致させる
3. 一意に解決できたレコードから、作品・DB・実 Index 値・Index キーパスを取り出す
4. 既存の `buildViewerQueryString()` で `?c=<Work>/<Db>/<IdxToken>` を生成する
5. `history.replaceState()` で同一ページの URL を正規 `c=` へ書き換える
6. 通常の `c=` 直リンクと同じ詳細表示経路へ合流する

正規化後の例:

```text
characters.html?badge=NTS-57
→ characters.html?c=NumberTales/Primary/Num:57
```

ブラウザの再読込や共有時には常に `c=` が残るため、Badge 入口は互換・入力補助として扱い、URL の正規形は増やさない。

### Badge 入力の規則

- 作品コード付き `full`（`NTS-57`）を正規入力とする
- 作品コードなしの `57` は、`work` / `db` が同時に指定されている場合だけ受理する案とする
- `badge` と `c` が同時にある場合は、正規形である `c` を優先する
- `badge` と旧 `idx` / `num` が同時にある場合は、既存互換の優先順位を崩さず、`badge` は無視する
- Badge の部分一致・表示名一致・和英ラベル一致は行わない
- 不明または複数一致の場合は `c=` へ書き換えず、既存の「キャラクターが見つからない」状態へ合流する

### 実装場所の候補

- `lib/graph/graph-badge.js` の `buildBadge()` は生成規則の正として再利用する
- Badge からレコードを探す処理は `pages/characters.js` の URL 初期化直後に置く
- 解決結果を `recordMatchesIndexQuery()` へ直接特殊扱いで渡さず、実 Index 値へ変換して既存の `c=` 経路へ合流させる
- Badge 値を使った全 DB 走査が必要になる場合は、既存の API / enrich 結果から取得済みのレコードだけを対象にし、別のデータ取得経路を新設しない
- 作品・DB が URL で絞られている場合は、その範囲を先に限定する

### テストと受け入れ条件

- `badge=NTS-57` が `c=NumberTales/Primary/Num:57` へ正規化される
- 複合 Index の Badge が実 Index 条件へ戻り、既存の複合 `c=` と同じレコードを開く
- `badge=NTS-57&lang=en` の言語指定が正規化後も保持される
- `badge` と `c` の同時指定で `c` が優先される
- 未知 Badge、重複 Badge、部分一致では URL を書き換えない
- `Num_Badge` / `Unit_Badge` / 辞書由来 Badge の各パターンを 1 件ずつ確認する
- ブラウザでは Badge URL → `c=` URL → 詳細表示 → 再読込の往復を確認する

### ドリル階層値は別管理

`Num_Badge` のような Index バッジを、そのまま `所属` や `クラス名` のドリル値へ流用しない。ドリル対象は Index ではないため、次の優先順で URL 用キーを解決する。

1. facet 宣言の URL 用 code（候補: `$display.facet.locatorKey`）
2. 辞書行の明示的な `{Field}_Badge` / `{Field}_Code`
3. 既存の ASCII かつ一意な辞書キー
4. それも無い場合は、その値を URL ロケータへ載せず、表示状態としてのみ扱う

このため、`r=own/NumberTales/所属/百花繚乱研究所` は設計例として残すが、実装時の正規形は `r=own/NTS/Belonging:100BL` のような ASCII キーへ寄せる。表示時は schema と辞書から和文・英文ラベルを復元する。

### フォーカス値の候補

`f` は現在の内部 `node.key` をそのまま公開せず、次のいずれかの短い値へ正規化する。

```text
f=NTS-57
f=FLI-M16
```

複合 Index の Badge が一意でない場合は `Works_Code` と DB 識別子を加える（例: `f=NTS-Primary-57`）。それでも一意性が保証できない場合は、URL を生成せずフォーカス状態を共有対象外にする。推測で表示名を連結して衝突を隠さない。

## 3. 補助パラメータの扱い

すべてを 1 つの opaque な JSON/Base64 値へ詰め込むと、人間が URL を読めず、手修正もしづらい。そこで、ページの主対象を示す `r` だけを圧縮し、表示設定は意味のある補助キーとして残す。

- `g`: グルーピング軸。状態として保存する
- `f`: フォーカス中ノード。選択状態の共有が必要な場合だけ保存する
- `e`: 手動で非表示にしたエッジ種別。カンマ区切りを維持する
- `q`: キャラクター検索語。値がある場合だけ保存する
- `sec`: 二次創作系 DB を含める指定。`1` の場合だけ保存する
- `t`: サムネイル表示。`1` の場合だけ保存する
- `lang`: `jp` / `en` / `mix`。既定値 `mix` は省略する

将来的に表示設定まで 1 本へ集約する必要が生じた場合は、`r` の主ロケータと混ぜず、別の `v=`（view preset）を追加する。初回実装では YAGNI として見送る。

## 4. 生成・解釈の責務

### `pages/relations.js`

- `readStateFromUrl()` は `r` を最優先で読む
- `r` が無い場合は既存の `m` + `d` を読む
- `c=Work/Db/Index` は既存互換として、作品スコープへ降りる用途だけ受理する
- 旧 `s=Work/Db` も読み取り専用で維持する
- `buildStateQuery()` は `r` を出力し、旧 `m` / `d` は生成しない
- `syncUrl()` は初回読み込み後、旧形式を正規形へ書き換える

### `lib/viewer-locator.js`

`c` はキャラシートの作品・DB・インデックスを表すため、相関図専用の `r` まで同じ parser に押し込まない。必要になった場合のみ、DOM 非依存の小さな `relations-locator.js` を追加し、次の純関数を持たせる。

- `parseRelationsLocator(raw)`
- `buildRelationsLocator({ map, drill })`

ただし、初回実装では `relations.js` 内の `readStateFromUrl()` / `buildStateQuery()` に閉じた薄い処理でもよい。2 ページ以上が共有し始めた時点で共通モジュールへ切り出す。

## 5. 正規化ルール

- 不明な map は `own` にフォールバックする
- 空セグメントは除去する
- 作品 ID の `#Works_` / `Works_` 接頭辞は読み取り時に除去する
- ドリル経路の不正な値は、既存の `normalizeDrillPath()` で利用可能な段まで切り詰める
- URL に含める値は状態オブジェクトへ戻す際に 1 回だけ decode する
- 空の補助パラメータは生成しない
- `lang=mix`、`m=own`、`sec=0`、`t=0` のような既定値は生成しない

## 6. 後方互換

読み取り専用で次を維持する。

1. 新形式 `r=<map>/<drill...>`
2. 現行形式 `m` + `d` + 補助キー
3. 旧 `s=Work/Db`
4. 相関図で開かれた `c=Work/Db/Index` の作品段フォールバック

優先順位は `r` → `m` / `d` → `c` → `s` とする。同じ状態を複数形式で指定した場合は、より新しい正規形を優先する。

キャラシートから相関図へ戻る導線が必要になった場合は、`characterHref()` の `c` を相関図用 `r` に変換する専用 helper を使う。URL の各ページで個別に `URLSearchParams` を組み立てない。

## 7. テスト計画

実装時は次の最小テストを追加する。

- `r=own` の parse / build
- `r=shared/NumberTales` の parse / build
- 複数段のドリル経路が順序を保つ
- ドリル値に日本語・空白・`/`・`&` が含まれても境界が壊れない
- 不明 map と空セグメントの正規化
- `r` と現行 `m` / `d` の競合時の優先順位
- 旧形式から新形式への URL 書き換え
- `g` / `f` / `e` / `q` / `sec` / `t` / `lang` が従来どおり保持される
- キャラシート側の `c=` 直リンクと相関図側の `r=` が互いに解釈を奪わない

ブラウザ確認では、次の URL を開いて履歴・表示が一致することを確認する。

- `relations.html?r=own`
- `relations.html?r=own/NumberTales`
- `relations.html?r=shared/NumberTales&g=...&q=...`
- 現行の `m` + `d` 形式
- `relations.html?c=NumberTales`

## 8. 実装順

1. `r` の文法と優先順位を純関数で固定する
2. `readStateFromUrl()` / `buildStateQuery()` を `r` 正規形へ変更する
3. 旧 URL の正規形書き換えを実装する
4. 既存の相関図 URL テストへ回帰ケースを追加する
5. 開発環境で履歴操作、作品ドリル、検索、キャラシート遷移を目視確認する
6. `docs/viewer-guide.md` と相関図 URL の仕様説明を更新する
7. 仕様変更として `CHANGELOG.md` を更新する

## 9. 今回の判断

- 実装はこのログ作成時点では行わない
- `c` の意味を相関図まで拡張せず、`r` を新設する
- 主対象（マップ + ドリル位置）だけを 1 本へ圧縮する
- 表示設定を Base64/JSON の 1 パラメータへ詰め込む案は、可読性と手修正性を失うため初回では採用しない
- `viewer-locator.js` の早期肥大化を避け、共有需要が出るまで相関図用 parser はページ内に留める
