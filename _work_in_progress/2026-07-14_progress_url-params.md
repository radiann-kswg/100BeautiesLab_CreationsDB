# 2026-07-14 進捗: キャラシート直リンク URL の簡略化（圧縮ロケータ `?c=`）

## 目的

`pages/characters.html` の URL パラメータを、**URL 貼付・手入力に耐える簡潔なルール**へ整理する。

## 背景・課題

従来の生成 URL は次のように冗長だった。

```
characters.html?work=Works_NumberTales&db=Primary&num=57&idx=57&idxKey=Num&q=&lang=
```

冗長さの原因は URL 文法ではなく**生成側**にあった。

1. `setQS()` が現在のクエリ全体を `URLSearchParams` へ流し込むため、**空の値まで `q=&lang=` として残る**
2. `idxKey=Num` のとき、旧互換の `num=` を**同じ値で併記**していた
3. 作品IDを `Works_` 接頭辞付きで出力していた（読み取り側の `normalizeWorkKey()` は接頭辞なしでも解釈できた）
4. URL 生成が 4 箇所で個別に `new URLSearchParams({...cur, ...})` を組み立てており、仕様が分散していた

## 合意事項（User 承認済み）

- URL 文法: **①空パラメータ除去 ②`Works_` 接頭辞の省略 ③`idx`/`idxKey` 統合 + パス風 1 本パラメータ**
- 旧パラメータ: **読み取りのみ互換維持**（生成側は新形式のみ）

## 新しい URL 文法

```
characters.html?c=<作品>[/<DB>[/<インデックス>]]

  <インデックス> = 値  または  キーパス:値

例:
  ?c=NumberTales/Primary/57            # 主要インデックスの値だけ
  ?c=NumberTales/Primary/Num:57        # キーパス明示
  ?c=FLInvestigator78/Primary/Card.Num:7
  ?c=NumberTales/Primary&q=狐
```

- キーパスと解釈するのは `^[A-Za-z_]\w*(\.[A-Za-z_]\w*)*$` に合致する場合のみ（値にコロンが含まれても壊れない）
- 3 セグメント目以降の `/` はインデックス値の一部として保持
- `q` / `lang` は独立キーのまま。**値があるときだけ**付与
- `URLSearchParams` が退避する `%2F` / `%3A` は復元して出力（クエリ内では正当な文字。RFC 3986: `query = *( pchar / "/" / "?" )`）

## 変更点の要約

### `pages/characters.js`

- **新設**: `VIEWER_LOCATOR_PARAM` / `INDEX_KEY_PATH_RE` / `workKeyForURL()` / `parseIdxToken()` / `buildIdxToken()` / `parseViewerLocator()` / `buildViewerQueryString()` / `buildViewerHref()`
- **`getQS()`**: 圧縮ロケータと旧個別キーの双方を解釈（個別キー優先）。旧 `?num=` は `idx` / `idxKey='Num'` へ正規化する
  - この正規化が無いと、初期化時の `setQS({ lang })`（言語の URL 反映）で `num` が落ち、**直リンク先が失われる**（実装中に発見した落とし穴）
- **`setQS()` / `buildViewerNavigationHref()`**: 空値を出さず、`c` 形式で出力。`num` は生成しない
- **置換**: 個別に URL を組んでいた 4 箇所（インデックスチップ / 詳細ヒーローのグループピル / `buildIndexHref` / `buildViewerNavigationHref`）を共通ヘルパーへ集約
- **テストフック**: `__parseViewerLocatorForTest` / `__buildViewerQueryStringForTest` / `__getQSForTest` を追加

### 例外（圧縮しないケース）

`_DBLink` の複合条件（JSON ペイロード + `idxKey=__conditions__`）は 1 本のロケータで表現できないため、従来の個別キー形式で出力する。手入力対象ではないため許容する。

### 触っていないもの

- `/api/v1` `/pages/v1` `/svc/v1` の **API クエリ**（`pkg/*` の `idxKey` 等）は対象外。今回はビューアのページ URL のみ
- `lib/section-renders/*` は `idx` / `idxKey` を渡す既存契約のままで変更不要（`num` オプションは受理するが出力しない no-op になった）

## 影響範囲（編集したファイル）

- `pages/characters.js`
- `pages/characters.html`（`asset-version`: `2026.07.13.3` → `2026.07.14.1`）
- `tests/pages.characters.url-params.test.js`（新規・14 件）
- `tests/pages.characters.ui-output.test.js`（生成 href の期待値を新形式へ追従）
- `docs/viewer-guide.md` / `CLAUDE.md` / `.github/copilot-instructions.md` / `CHANGELOG.md`

## 検証

- `npm test`（Vitest）: 新規 URL テスト 14 件すべて成功。URL 関連の既存アサーション 3 件も新形式で成功
  - 検証観点: 圧縮ロケータの生成／解釈、空パラメータの非出力、`q`/`lang` の独立維持、JSON 複合条件のフォールバック、旧 `work=Works_*` / `idx`+`idxKey` / `num` の読み取り互換、個別キーの優先
- 後方互換の回帰テストとして、`tests/pages.characters.ui-output.test.js` の jsdom 初期 URL は**旧形式のまま**残した（`?work=Works_PastDivers&idx=Yayoi&idxKey=Chronos.Lunar&q=`）

### 実機確認（Playwright Chromium + ローカル静的サーバー `127.0.0.1:5500`）

検証スクリプト: `.cache/verify-url.mjs`（Git 管轄外。再実行可）

| シナリオ | 入力 URL | 結果クエリ | 詳細表示 |
| --- | --- | --- | --- |
| 旧形式（空パラメータ込み） | `?work=Works_NumberTales&db=Primary&num=57&idx=57&idxKey=Num&q=&lang=` | `?c=NumberTales/Primary/Num:57` | OPEN `57(イズナ)` |
| 旧 `?num=` のみ | `?work=NumberTales&db=Primary&num=57` | `?c=NumberTales/Primary/Num:57` | OPEN `57(イズナ)` |
| 新形式・キー省略 | `?c=NumberTales/Primary/57` | `?c=NumberTales/Primary/Num:57` | OPEN `57(イズナ)` |
| 新形式・キー明示 | `?c=NumberTales/Primary/Num:57` | 同上 | OPEN `57(イズナ)` |
| ネストインデックス（別作品） | `?c=FLInvestigator78/Primary/Card.Num:7` | `?c=FLInvestigator78/Primary/Card.SuitNum:7` | OPEN `アクセラ` |
| 一覧クリック | `?c=NumberTales/Primary` | `?c=NumberTales/Primary/Num:1` | OPEN `1(ハジメ)` |
| 詳細 → 戻る | `?c=NumberTales/Primary/Num:57` | `?c=NumberTales/Primary` | closed |
| 検索入力 | `?c=NumberTales/Primary` | `?c=NumberTales/Primary&q=%E7%8B%90` | closed（一覧 2 件に絞込） |

- 旧形式 URL は**開いた時点で新形式へ書き換わる**ことを実機で確認。空パラメータ（`q=` / `lang=`）は残らない
- 既定言語が `mix` のため `lang` は URL に付かない（`jp` / `en` を明示したときだけ付与）
- ネストインデックスは、入力に別の子キー（`Card.Num`）を与えても**レコードの主要インデックス（`Card.SuitNum`）へ正規化**される（`openDetail()` の既存挙動。URL が主要インデックスへ収束するので望ましい）
- `pageerror` の発生なし

## 未完了タスク・申し送り

- **既存の失敗テスト 6 件（本変更以前から / URL と無関係）**: `tests/pages.characters.ui-output.test.js`
  - `renders dictionary-backed basic fields in detail view`（期待 `夜月機関 / Yadzuki Organization` に対し `夜月機関`）
  - `renders enum and hideText values in basic info table`（期待 `女性 / Female` に対し `Female`）
  - `renders secondary metadata fields in a dedicated detail section`（`ラジアン（柏木主税）` を含まない）
  - `renders series-backed secondary metadata when only sec_SeriesTitle exists on the record`（`散狐アタスト` を含まない）
  - `resolves Class values via a Belonging-scoped dictionary (scopeField)`（和英併記が出ない）
  - `renders other-work spec stats as standalone subField sections ...`（`物理的作用: B（標準 / Normal）` にならない）
  - いずれも**辞書解決の和英併記・二次創作メタの合流**まわりで、直近の DB 整備（`c99ab37`）以降の追従漏れの可能性が高い。テスト期待値の書き換えで隠さず、**実装側の課題として別途調査**が必要
- ブラウザ実機確認は実施済み（上記「実機確認」節）。未コミット
