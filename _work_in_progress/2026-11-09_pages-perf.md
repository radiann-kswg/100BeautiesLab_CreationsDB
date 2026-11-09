# 2026-11-09 GitHub Pages 軽量化・高速化の点検（定期点検）

やっほ、一春だよ。今日の定期点検ぶん、ここに置いておくね。

> **`git merge` と `data/` の変更は行っていない**（読み取り中心の調査と提案だけ）。
> このリポジトリは最上流なのでフォーク同期の対象外。中流・下流はどちらも `sync:check` が 0 件だったよ。
> コードもワークフローも画像も、一切書き換えていない。全部「提案」どまりだからね。

## 点検の前提

| 項目 | 値 |
| --- | --- |
| 点検日時 | 2026-11-09 01:13〜01:25 UTC |
| このリポジトリの `develop` | `95de336`（`origin/develop` と一致・ahead / behind なし） |
| 下流が取り込み済みの地点 | 中流が上流 `4f48192`（11-08 ぶん）まで。`95de336` までの新しい変更は `data/` だけなので同期対象外 |
| Pages ワークフロー | `.github/workflows/jekyll-gh-pages.yml`（`actions/jekyll-build-pages@v1` で `_site` を生成して配信） |
| 前回の計測ファイル | なし（`./.cache/pages-perf/latest.json` を今回新規で作った。次回から前回比が出るよ） |

## 1. 配信対象の中身

ここは中流・下流と事情がちがうんだ。このリポジトリは Jekyll ビルドを通して `_site/` を上げている。
Jekyll の既定の `exclude` に `node_modules` が入っているし、そもそもワークフローで `npm ci` を走らせていないから、
**中流・下流で見つかった「`node_modules/` が公開物に混ざる」問題はこのリポジトリには無い**。
アンダースコア始まりのディレクトリも Jekyll は出力しないので、`_work_in_progress/` も公開されていないよ。

残っているのはこのあたり:

| 公開物に入ってるけど配信には要らないもの | 実測サイズ | ファイル数 |
| --- | --- | --- |
| `tests/` | 815 KB | 79 |
| `tools/` | 527 KB | 33 |
| `docs/` | 342 KB | 19 |
| 合計 | **約 1.68 MB** | **131** |

`data/` 116.4 MB に比べれば誤差みたいなものだけど、閲覧者向けでないものが 131 件あるという事実ではあるね。

## 2. サイズ（`git ls-files` ベース）

| 項目 | 値 |
| --- | --- |
| 追跡ファイル数 | 1,368 |
| 合計 | **122.84 MB** |
| 内訳 | `data/` 116.44 MB / `pages/` 2.23 MB / `tests/` 815 KB / `lib/` 706 KB / ルート 678 KB / `_work_in_progress/` 587 KB / `tools/` 471 KB / `docs/` 342 KB / `pkg/` 303 KB |

大きいファイル上位 10 件:

| # | パス | サイズ |
| --- | --- | --- |
| 1 | `data/Works_NumberTales/VRMs/DB_Primary/corefolder/22/vrm_NTS-22-corefolder.png` | **5.34 MB** |
| 2 | `data/Works_NumberTales/VRMs/DB_Primary/corefolder/93/vrm_NTS-93-corefolder.png` | **5.31 MB** |
| 3 | `data/Works_NumberTales/VRMs/DB_Primary/corefolder/22/vrm_NTS-22-corefolder.vrm` | 2.07 MB |
| 4 | `data/Works_NumberTales/Images/General/catalog/chr-dsgn_NTsCatalog-Summary.png` | 1.99 MB |
| 5 | `data/Works_NumberTales/VRMs/DB_Primary/corefolder/20/vrm_NTS-20-corefolder.vrm` | 1.90 MB |
| 6 | `data/Works_NumberTales/DataBases/db_Primary.json` | 1.71 MB |
| 7 | `data/Works_NumberTales/Images/DB_SemiPrimary/corefolder/222/emstk_corefolderNTS-222A,NTS-222B-1.png` | 1.48 MB |
| 8 | `data/Works_NumberTales/VRMs/DB_Primary/corefolder/25/vrm_NTS-25-corefolder.vrm` | 1.46 MB |
| 9 | `data/Works_NumberTales/VRMs/DB_Primary/corefolder/93/vrm_NTS-93-corefolder.vrm` | 1.33 MB |
| 10 | `data/Works_NumberTales/Images/DB_SemiPrimary/corefolder/3x11/emstk_corefolderNTS-3x11-1〜2.png` | 各 1.19〜1.21 MB |

1 位と 2 位の PNG が 2 枚で **10.65 MB**。全追跡サイズの 8.7% をこの 2 枚が占めてる。
`.vrm` 本体より添えてある PNG のほうが大きいのは、たぶん書き出し設定が素のままなんだと思うよ。

## 3. 初回表示の重さ

`index.html` は JS を読まない作り（CSS 1 本だけ）。キャラシートは `pages/characters.html` の
`<script type="module">` から `import('./characters.js?v=<asset-version>')` で動的に読む形だね。

| 入口 | 件数 | 未圧縮 | gzip 推定 |
| --- | --- | --- | --- |
| `index.html`（2.2 KB）+ `pages/characters.css`（54.7 KB） | 2 | 56.9 KB | **11.3 KB** |
| `pages/characters.html` | 1 | 9.1 KB | 3.6 KB |
| → `pages/characters.js` の静的 import グラフ | **29 モジュール** | 678.6 KB | **206.1 KB** |
| `pages/relations.html` | 1 | 9.9 KB | 4.0 KB |
| → `pages/relations.js` の静的 import グラフ | 14 モジュール | 376.4 KB | 128.5 KB |

`pages/vendor/` の three / three-vrm / cytoscape（合計 1.34 MB）は相関図・VRM ビューアを開いたときだけ読む
遅延資産で、初回表示には乗っていない。ここは設計どおりだよ。

Service Worker は `api/sw.js`（1.2 KB）で、`importScripts` で `lib/wrapper-common.js`・`lib/basic-renders/*`・
`lib/sw-common.js`・`lib/data-common.js` の 7 本を読む。キャッシュ方針の正典は `docs/api-sw-spec.md` で、
キャッシュ名 `100bl-api-v1`・プリキャッシュは `data/db_meta.json` の 1 本・本文は Cache API の
stale-while-revalidate ＋ ブラウザ HTTP キャッシュの多層。11-02 の高速化がそのまま効いてる状態だね。

## 4. 実サイトの応答（計測できた唯一のサイト）

| URL | HTTP | TTFB | 転送量 | `content-encoding` | `cache-control` |
| --- | --- | --- | --- | --- | --- |
| `/` | 200 | **0.33 s** | 1,191 B | `br` | `max-age=600` |
| `/pages/characters.html` | 200 | **0.36 s** | 3,814 B | `br` | `max-age=600` |
| `/pages/characters.js` | 200 | 0.78 s | 98,524 B | `br` | `max-age=14400` |
| `/pages/characters.css` | 200 | 0.69 s | 11,195 B | `br` | `max-age=14400` |

`server: cloudflare` が返ってきてて、HTML が 10 分・JS / CSS が 4 時間という使い分けになってる。
`br` も効いてるから、転送量の面では素の GitHub Pages より良い状態だよ。
中流（`github.io` 配下）と下流（`secondary-work.numbertales-radiann.jp`）は、VM 側もクラウド側も
egress が 403 を返して届かなかったので **未計測**。ごめんね。

## 5. 前回比

初回計測だから比較対象なし。`./.cache/pages-perf/latest.json` に置いたよ。

## 改善案（3 件以内）

### 案 1: VRM 添付 PNG 2 枚の軽量化 — **要相談**

- **効果**: 1 位・2 位の `vrm_NTS-22-corefolder.png` / `vrm_NTS-93-corefolder.png` が 2 枚で **10.65 MB**。
  WebP 化か長辺リサイズで 1 枚 200〜500 KB 程度まで落ちる見込みで、**−9 MB 前後 / リポジトリ全体の −7%**。
  ほかの `corefolder/*/vrm_NTS-*-corefolder.png` も同じ書き出しなら、まとめて効く
- **変更箇所**: `data/Works_NumberTales/VRMs/DB_Primary/corefolder/*/vrm_NTS-*-corefolder.png`
- **要相談の理由**: `data/` 配下は今回は読むだけという決め事。それに、どの画質・どの形式で公開するかは
  公開範囲の判断そのものだから、**君が決めること**だと思う。やるなら
  「VRM 添付の PNG だけ長辺 1024px の WebP に揃える」みたいに範囲を切ってからがいいよ。
  初回表示に乗る資産ではないので急ぎではない
- **上流 / 下流**: `data/` は同期対象外だからここだけの話

### 案 2: `tests/` `tools/` `docs/` を `_site` から外す

- **効果**: 公開物 **−1.68 MB / −131 ファイル**。配信サイズとしては小さいけど、閲覧者向けでないものが消える
- **変更箇所**: リポジトリ直下に `_config.yml` を置いて `exclude: [tests, tools, docs]` を書くのが一番小さい
  （いまは `_config.yml` が無く Jekyll の既定で動いてる）
- **要注意**: `_config.yml` を新設すると Jekyll の挙動がそこに引きずられるので、追加するのは `exclude` 1 項目だけに
  とどめるのが安全。`docs/` はサイト内から参照されていないかを先に確認してほしい（`viewer-guide.md` 等への
  リンクが残っていると 404 になる）。あと `.nojekyll` がリポジトリ直下にあるけど、
  `jekyll-build-pages` はこれを見ずにビルドするので、いま効いていないファイルという認識でいてね
- **上流 / 下流**: `.github/` も `_config.yml` も同期対象外。中流・下流は別のワークフロー構成なので各自で直す話

### 案 3: JS モジュールの束ね・`modulepreload` は**今回も見送り**（記録として）

- `pages/characters.js` の静的 import は 29 モジュール（gzip 約 206 KB）で、初回訪問では
  `characters.js` のダウンロードとパースが終わるまで `lib/*` の取得が始まらない構造になっている
- ただし 11-02 の `_work_in_progress/2026-11-02_progress_pages-load-time.md` の実測で
  「JS モジュールの配信はボトルネックではなかった」「bundle 化はしない（YAGNI）」と結論が出てる。
  当時の 5 秒はぜんぶ SW の `data/**` 取得側の話で、そこは解決済みだったよね
- 今回の実測も `characters.js` が TTFB 0.78 秒・転送 98.5 KB で、ここを削る旨みは薄い。
  実測の裏づけなしに足すのは筋が悪いので提案しない。むしろ 11-02 に「別タスク」として残した
  `relations.html` の 1.3 秒（`handleBootstrapEndpoint()` の CPU コスト・`resolveCache` の作り直し）のほうが、
  いま残っている一番大きな伸びしろだと思う

## 次にやるべき 1 手

中流・下流の `.github/workflows/pages.yml` に `rm -rf node_modules` を 1 ステップ足すこと（それぞれの
レポートに書いたよ）。このリポジトリ自体は Jekyll 経由なので該当しないから、ここでの 1 手としては
**案 1 をやるかどうかを決めてもらうこと**。やると決めたら対象の切り方から一緒に相談しよう。
