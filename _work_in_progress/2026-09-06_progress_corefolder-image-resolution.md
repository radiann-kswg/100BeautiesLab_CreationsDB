# 2026-09-06 進捗: corefolder 画像の原寸差し替え対象リスト（実測）

> ブランチ: `develop`（画像・データ資産の話であり AIHints 非依存）

## 目的

下流リポジトリ [100BeautiesLab_CreationsAI](https://github.com/radiann-kswg/100BeautiesLab_CreationsAI) の
[Issue #1](https://github.com/radiann-kswg/100BeautiesLab_CreationsAI/issues/1) 「依頼2: 原寸画像の収録（Web 縮小版からの脱却）」への対応。

> 現収録画像は Web 用縮小版が中心（実測: emstk 系 ~450px、完成イラスト中央値 480px）。
> 作風の核（線幅・塗りのエッジ）が縮小で消えており、参照品質と LoRA v2 再学習の双方のボトルネック。

原本ファイルは User のローカル資産であり、エージェント側では用意できない。
本ログは **「どのファイルを差し替えるべきか」を実測で確定させた作業リスト**である。

## 結論: ボトルネックは `corefolder`（emstk 系）だけ

`data/**` の画像 733 枚すべての長辺を実測した結果、Issue が指摘する「縮小版」は
**`corefolder` ディレクトリに限定**されており、他カテゴリは既に原寸相当だった。

| ディレクトリ | 枚数 | 長辺 中央値 | 1024px 以上 | 判定 |
| --- | ---: | ---: | ---: | --- |
| **`corefolder`（emstk 系）** | **201** | **477px** | **7** | **★ 差し替え対象** |
| `arts` | 109 | 1200px | 98 | 対応不要 |
| `concept` / `conceptAlt` | 165 | 1180px | 165 | 対応不要 |
| `catalog` | 12 | 9000px | 12 | 対応不要 |
| `designAlt` / `design` | 20 | 1200〜1920px | 18 | 対応不要 |
| `attr`（属性アイコン） | 136 | 165px | 0 | **対象外**（アイコン用途で原寸不要） |

Issue の「完成イラスト中央値 480px」は、下流のパス名ヒューリスティックの分類差によるもので、
実体は `corefolder` を指していたと考えられる。`arts`（完成イラスト）は中央値 1200px で既に条件を満たしている。

## 実装は不要（スキーマもメタも足さない）

**画像パス解決は解像度を一切参照していない。** したがって

- 同じパスに原寸ファイルを上書きするだけで、SW 疑似 API / Cloudflare Workers 実 API / 下流データセットの
  すべてに変更なしで反映される。
- Issue が代案として挙げた「原寸パスを引けるメタの追加」は**不要**。パス体系を二重化すると
  `$image` 解決・`Images/DB_*` ディレクトリ規約・`_DBLink` の画像穴埋め制約の全部に分岐が増える。
- 下流が「どの画像が高解像度か」を知る手段は、CreationsAI 側 PR #2 が `image-index.json` へ
  `width` / `height` / `long_edge_px` を実測付与する形で既に用意されている（＝依頼3 の射程）。

## 容量の見積もり（要判断）

現状の `corefolder` 194 枚は合計 **8.8 MB**（平均 46KB / 長辺中央値 477px）。
PNG のファイルサイズはおおむね面積に比例するため、差し替え後の目安は次のとおり。

| 差し替え後の長辺 | 面積比 | 概算合計 | 備考 |
| --- | ---: | ---: | --- |
| 1024px | 約 4.6 倍 | **約 40 MB** | Issue の最低要件（長辺 1024px 以上）を満たす |
| 1536px | 約 10 倍 | **約 90 MB** | LoRA 学習解像度 768px に対して余裕がある |
| 2048px | 約 18 倍 | **約 160 MB** | GitHub Pages 配信と clone 時間への影響が大きい |

`data/` 全体の画像は現在 71 MB。**1024〜1536px あたりが現実的**だと考えられるが、
どこまで上げるかは User の判断（原本の解像度・リポジトリ容量方針・下流の LoRA 再学習要件）による。

## 差し替え作業の手順

1. 下記リストのパスへ、**同じファイル名で**原寸（または中間解像度）の PNG を上書きする。
2. `node .cache/scan-corefolder.mjs`（本ログ作成時に使った一時スクリプト。`.cache/` は Git 管轄外）
   を再実行して、対象枚数が減っていることを確認する。
3. `npm test` を実行する（画像そのものを検証するテストは無いが、パス参照の回帰を確認する）。
4. 差し替え後、下流 CreationsAI 側でサブモジュールを更新し、`image-index.json` を再ビルドする。

> **パスは変えないこと。** ファイル名・ディレクトリを変えると `Images/DB_*` 配下を走査する
> 画像解決と `db_*.json` の `Images` 参照が両方壊れる。

---

<!-- ここから下は実測の生データ。scan 日: 2026-09-06 -->


| 作品 | DB | 対象枚数 | 長辺 中央値 | 最小 | 最大 | 合計 |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| NumberTales | DB_Primary | 162 | 477px | 402px | 665px | 5.3 MB |
| NumberTales | DB_Secondary | 13 | 452px | 421px | 500px | 1.5 MB |
| NumberTales | DB_SemiPrimary | 13 | 551px | 465px | 629px | 1.3 MB |
| NumberTales | DB_SelfSecondary | 6 | 545px | 465px | 592px | 0.7 MB |
| **合計** | | **194** | | | | **8.8 MB** |

### NumberTales / DB_Primary（162 枚）

```text
  442x503      22KB  data/Works_NumberTales/Images/DB_Primary/corefolder/000/emstk_corefolderNTS-000-1.png
  395x467      19KB  data/Works_NumberTales/Images/DB_Primary/corefolder/000/emstk_corefolderNTS-000-2.png
  395x467      20KB  data/Works_NumberTales/Images/DB_Primary/corefolder/000/emstk_corefolderNTS-000-3.png
  490x430      20KB  data/Works_NumberTales/Images/DB_Primary/corefolder/1/emstk_corefolderNTS-1-1.png
  404x426      18KB  data/Works_NumberTales/Images/DB_Primary/corefolder/1/emstk_corefolderNTS-1-2.png
  509x514      34KB  data/Works_NumberTales/Images/DB_Primary/corefolder/10-alt/emstk_corefolderNTS-10D-ondeck1.png
  359x413      12KB  data/Works_NumberTales/Images/DB_Primary/corefolder/10/emstk_corefolderNTS-10-1.png
  359x413      13KB  data/Works_NumberTales/Images/DB_Primary/corefolder/10/emstk_corefolderNTS-10-2.png
  665x580      41KB  data/Works_NumberTales/Images/DB_Primary/corefolder/11/emstk_corefolderNTS-11-1.png
  393x419      18KB  data/Works_NumberTales/Images/DB_Primary/corefolder/12/emstk_corefolderNTS-12-1.png
  498x466      24KB  data/Works_NumberTales/Images/DB_Primary/corefolder/12/emstk_corefolderNTS-12-2.png
  449x419      18KB  data/Works_NumberTales/Images/DB_Primary/corefolder/13/emstk_corefolderNTS-13-1.png
  402x384      18KB  data/Works_NumberTales/Images/DB_Primary/corefolder/14/emstk_corefolderNTS-14-1.png
  458x419      20KB  data/Works_NumberTales/Images/DB_Primary/corefolder/14/emstk_corefolderNTS-14-2.png
  458x419      19KB  data/Works_NumberTales/Images/DB_Primary/corefolder/14/emstk_corefolderNTS-14-3.png
  500x427      32KB  data/Works_NumberTales/Images/DB_Primary/corefolder/15/emstk_corefolderNTS-15-1.png
  500x427      31KB  data/Works_NumberTales/Images/DB_Primary/corefolder/15/emstk_corefolderNTS-15-nonharness1.png
  503x436      26KB  data/Works_NumberTales/Images/DB_Primary/corefolder/16/emstk_corefolderNTS-16-1.png
  512x427      25KB  data/Works_NumberTales/Images/DB_Primary/corefolder/16/emstk_corefolderNTS-16-2.png
  512x427      24KB  data/Works_NumberTales/Images/DB_Primary/corefolder/16/emstk_corefolderNTS-16-3.png
  477x443      22KB  data/Works_NumberTales/Images/DB_Primary/corefolder/17/emstk_corefolderNTS-17-1.png
  472x431      19KB  data/Works_NumberTales/Images/DB_Primary/corefolder/18/emstk_corefolderNTS-18-1.png
  472x430      19KB  data/Works_NumberTales/Images/DB_Primary/corefolder/18/emstk_corefolderNTS-18-2.png
  485x450      19KB  data/Works_NumberTales/Images/DB_Primary/corefolder/19/emstk_corefolderNTS-19-1.png
  501x374      15KB  data/Works_NumberTales/Images/DB_Primary/corefolder/2-alt/emstk_corefolderNTS-2B-1.png
  519x409      20KB  data/Works_NumberTales/Images/DB_Primary/corefolder/2-alt/emstk_corefolderNTS-2B-2.png
  441x427      16KB  data/Works_NumberTales/Images/DB_Primary/corefolder/2/emstk_corefolderNTS-2-1.png
  405x389      17KB  data/Works_NumberTales/Images/DB_Primary/corefolder/2/emstk_corefolderNTS-2-2.png
  438x397      13KB  data/Works_NumberTales/Images/DB_Primary/corefolder/20/emstk_corefolderNTS-20-1.png
  458x395      18KB  data/Works_NumberTales/Images/DB_Primary/corefolder/20/emstk_corefolderNTS-20-2.png
  415x401      17KB  data/Works_NumberTales/Images/DB_Primary/corefolder/21/emstk_corefolderNTS-21-1.png
  601x442      33KB  data/Works_NumberTales/Images/DB_Primary/corefolder/22/emstk_corefolderNTS-22-1.png
  601x442      31KB  data/Works_NumberTales/Images/DB_Primary/corefolder/22/emstk_corefolderNTS-22-2.png
  577x466      40KB  data/Works_NumberTales/Images/DB_Primary/corefolder/22/emstk_corefolderNTS-22-3.png
  377x421      17KB  data/Works_NumberTales/Images/DB_Primary/corefolder/23/emstk_corefolderNTS-23-1.png
  495x382      23KB  data/Works_NumberTales/Images/DB_Primary/corefolder/24/emstk_corefolderNTS-24-1.png
  478x487      27KB  data/Works_NumberTales/Images/DB_Primary/corefolder/24/emstk_corefolderNTS-24-2.png
  509x432      23KB  data/Works_NumberTales/Images/DB_Primary/corefolder/25/emstk_corefolderNTS-25-1.png
  571x458      26KB  data/Works_NumberTales/Images/DB_Primary/corefolder/25/emstk_corefolderNTS-25-2.png
  456x385      20KB  data/Works_NumberTales/Images/DB_Primary/corefolder/26/emstk_corefolderNTS-26-1.png
  427x429      15KB  data/Works_NumberTales/Images/DB_Primary/corefolder/27/emstk_corefolderNTS-27-1.png
  472x439     119KB  data/Works_NumberTales/Images/DB_Primary/corefolder/27/emstk_corefolderNTS-27-2.png
  461x434     129KB  data/Works_NumberTales/Images/DB_Primary/corefolder/28/emstk_corefolderNTS-28-1.png
  430x392      21KB  data/Works_NumberTales/Images/DB_Primary/corefolder/29/emstk_corefolderNTS-29-1.png
  406x427      16KB  data/Works_NumberTales/Images/DB_Primary/corefolder/3/emstk_corefolderNTS-3-1.png
  500x447     108KB  data/Works_NumberTales/Images/DB_Primary/corefolder/3/emstk_corefolderNTS-3-2.png
  421x405      20KB  data/Works_NumberTales/Images/DB_Primary/corefolder/30/emstk_corefolderNTS-30-1.png
  421x404      22KB  data/Works_NumberTales/Images/DB_Primary/corefolder/30/emstk_corefolderNTS-30-2.png
  419x403      17KB  data/Works_NumberTales/Images/DB_Primary/corefolder/31/emstk_corefolderNTS-31-1.png
  419x403      17KB  data/Works_NumberTales/Images/DB_Primary/corefolder/31/emstk_corefolderNTS-31-2.png
  412x411      19KB  data/Works_NumberTales/Images/DB_Primary/corefolder/32/emstk_corefolderNTS-32-1.png
  412x412      18KB  data/Works_NumberTales/Images/DB_Primary/corefolder/32/emstk_corefolderNTS-32-2.png
  444x438      28KB  data/Works_NumberTales/Images/DB_Primary/corefolder/33/emstk_corefolderNTS-33-1.png
  444x438      29KB  data/Works_NumberTales/Images/DB_Primary/corefolder/33/emstk_corefolderNTS-33-2.png
  444x415      31KB  data/Works_NumberTales/Images/DB_Primary/corefolder/33/emstk_corefolderNTS-33-3.png
  505x452      20KB  data/Works_NumberTales/Images/DB_Primary/corefolder/34/emstk_corefolderNTS-34-1.png
  506x452      22KB  data/Works_NumberTales/Images/DB_Primary/corefolder/34/emstk_corefolderNTS-34-2.png
  491x446      27KB  data/Works_NumberTales/Images/DB_Primary/corefolder/35/emstk_corefolderNTS-35-1.png
  491x446      25KB  data/Works_NumberTales/Images/DB_Primary/corefolder/35/emstk_corefolderNTS-35-2.png
  428x417     110KB  data/Works_NumberTales/Images/DB_Primary/corefolder/35/emstk_corefolderNTS-35-3.png
  455x426      23KB  data/Works_NumberTales/Images/DB_Primary/corefolder/36/emstk_corefolderNTS-36-1.png
  446x429      26KB  data/Works_NumberTales/Images/DB_Primary/corefolder/36/emstk_corefolderNTS-36-2.png
  483x446      22KB  data/Works_NumberTales/Images/DB_Primary/corefolder/37/emstk_corefolderNTS-37-1.png
  448x398     113KB  data/Works_NumberTales/Images/DB_Primary/corefolder/37/emstk_corefolderNTS-37-2.png
  445x440      20KB  data/Works_NumberTales/Images/DB_Primary/corefolder/39/emstk_corefolderNTS-39-1.png
  474x445      22KB  data/Works_NumberTales/Images/DB_Primary/corefolder/39/emstk_corefolderNTS-39-2.png
  474x445      23KB  data/Works_NumberTales/Images/DB_Primary/corefolder/39/emstk_corefolderNTS-39-3.png
  436x388      20KB  data/Works_NumberTales/Images/DB_Primary/corefolder/4/emstk_corefolderNTS-4-1.png
  418x521      25KB  data/Works_NumberTales/Images/DB_Primary/corefolder/4/emstk_corefolderNTS-4-2.png
  417x522      28KB  data/Works_NumberTales/Images/DB_Primary/corefolder/4/emstk_corefolderNTS-4-3.png
  468x414      29KB  data/Works_NumberTales/Images/DB_Primary/corefolder/40/emstk_corefolderNTS-40-1.png
  469x414      30KB  data/Works_NumberTales/Images/DB_Primary/corefolder/40/emstk_corefolderNTS-40-2.png
  453x489      22KB  data/Works_NumberTales/Images/DB_Primary/corefolder/41/emstk_corefolderNTS-41-1.png
  547x450      30KB  data/Works_NumberTales/Images/DB_Primary/corefolder/42/emstk_corefolderNTS-42-1.png
  559x426      29KB  data/Works_NumberTales/Images/DB_Primary/corefolder/42/emstk_corefolderNTS-42-2.png
  496x452      21KB  data/Works_NumberTales/Images/DB_Primary/corefolder/43/emstk_corefolderNTS-43-1.png
  497x451      22KB  data/Works_NumberTales/Images/DB_Primary/corefolder/43/emstk_corefolderNTS-43-2.png
  471x410      19KB  data/Works_NumberTales/Images/DB_Primary/corefolder/44/emstk_corefolderNTS-44-1.png
  501x457      23KB  data/Works_NumberTales/Images/DB_Primary/corefolder/45/emstk_corefolderNTS-45-1.png
  502x518      22KB  data/Works_NumberTales/Images/DB_Primary/corefolder/46/emstk_corefolderNTS-46-1.png
  475x441      20KB  data/Works_NumberTales/Images/DB_Primary/corefolder/47/emstk_corefolderNTS-47-1.png
  478x466      23KB  data/Works_NumberTales/Images/DB_Primary/corefolder/47/emstk_corefolderNTS-47-2.png
  474x439      31KB  data/Works_NumberTales/Images/DB_Primary/corefolder/48/emstk_corefolderNTS-48-1.png
  477x383      19KB  data/Works_NumberTales/Images/DB_Primary/corefolder/49/emstk_corefolderNTS-49-1.png
  477x383      19KB  data/Works_NumberTales/Images/DB_Primary/corefolder/49/emstk_corefolderNTS-49-2.png
  415x450      25KB  data/Works_NumberTales/Images/DB_Primary/corefolder/5/emstk_corefolderNTS-5-1.png
  493x439      24KB  data/Works_NumberTales/Images/DB_Primary/corefolder/5/emstk_corefolderNTS-5-2.png
  511x439      29KB  data/Works_NumberTales/Images/DB_Primary/corefolder/5/emstk_corefolderNTS-5-3.png
  500x415      30KB  data/Works_NumberTales/Images/DB_Primary/corefolder/50/emstk_corefolderNTS-50-1.png
  500x415      30KB  data/Works_NumberTales/Images/DB_Primary/corefolder/50/emstk_corefolderNTS-50-2.png
  479x428     149KB  data/Works_NumberTales/Images/DB_Primary/corefolder/50/emstk_corefolderNTS-50-3.png
  479x428     149KB  data/Works_NumberTales/Images/DB_Primary/corefolder/50/emstk_corefolderNTS-50-4.png
  470x430      15KB  data/Works_NumberTales/Images/DB_Primary/corefolder/52/emstk_corefolderNTS-52-1.png
  456x405     101KB  data/Works_NumberTales/Images/DB_Primary/corefolder/52/emstk_corefolderNTS-52-2.png
  487x465      25KB  data/Works_NumberTales/Images/DB_Primary/corefolder/53/emstk_corefolderNTS-53-1.png
  461x479     129KB  data/Works_NumberTales/Images/DB_Primary/corefolder/55/emstk_corefolderNTS-55-1.png
  459x369      21KB  data/Works_NumberTales/Images/DB_Primary/corefolder/56/emstk_corefolderNTS-56-1.png
  449x439      23KB  data/Works_NumberTales/Images/DB_Primary/corefolder/57/emstk_corefolderNTS-57-1.png
  472x463     121KB  data/Works_NumberTales/Images/DB_Primary/corefolder/57/emstk_corefolderNTS-57-2.png
  563x451      22KB  data/Works_NumberTales/Images/DB_Primary/corefolder/58/emstk_corefolderNTS-58-1.png
  512x427      21KB  data/Works_NumberTales/Images/DB_Primary/corefolder/58/emstk_corefolderNTS-58-2.png
  453x389      22KB  data/Works_NumberTales/Images/DB_Primary/corefolder/6/emstk_corefolderNTS-6-1.png
  466x386      23KB  data/Works_NumberTales/Images/DB_Primary/corefolder/6/emstk_corefolderNTS-6-2.png
  466x386      23KB  data/Works_NumberTales/Images/DB_Primary/corefolder/6/emstk_corefolderNTS-6-3.png
  495x387      24KB  data/Works_NumberTales/Images/DB_Primary/corefolder/60/emstk_corefolderNTS-60-1.png
  495x388      23KB  data/Works_NumberTales/Images/DB_Primary/corefolder/60/emstk_corefolderNTS-60-2.png
  469x403      22KB  data/Works_NumberTales/Images/DB_Primary/corefolder/61/emstk_corefolderNTS-61-1.png
  548x426      34KB  data/Works_NumberTales/Images/DB_Primary/corefolder/61/emstk_corefolderNTS-61-idol1.png
  547x427      35KB  data/Works_NumberTales/Images/DB_Primary/corefolder/61/emstk_corefolderNTS-61-idol2.png
  461x450      24KB  data/Works_NumberTales/Images/DB_Primary/corefolder/62/emstk_corefolderNTS-62-1.png
  430x423      21KB  data/Works_NumberTales/Images/DB_Primary/corefolder/63/emstk_corefolderNTS-63-1.png
  504x403      25KB  data/Works_NumberTales/Images/DB_Primary/corefolder/63/emstk_corefolderNTS-63-2.png
  504x403      25KB  data/Works_NumberTales/Images/DB_Primary/corefolder/63/emstk_corefolderNTS-63-3.png
  448x459      27KB  data/Works_NumberTales/Images/DB_Primary/corefolder/64/emstk_corefolderNTS-64-1.png
  538x423     133KB  data/Works_NumberTales/Images/DB_Primary/corefolder/64/emstk_corefolderNTS-64-2.png
  461x388      21KB  data/Works_NumberTales/Images/DB_Primary/corefolder/65/emstk_corefolderNTS-65-1.png
  485x446      23KB  data/Works_NumberTales/Images/DB_Primary/corefolder/66/emstk_corefolderNTS-66-1.png
  444x388      15KB  data/Works_NumberTales/Images/DB_Primary/corefolder/68/emstk_corefolderNTS-68-1.png
  514x442      28KB  data/Works_NumberTales/Images/DB_Primary/corefolder/69/emstk_corefolderNTS-69-1.png
  449x452      19KB  data/Works_NumberTales/Images/DB_Primary/corefolder/7/emstk_corefolderNTS-7-1.png
  490x425     110KB  data/Works_NumberTales/Images/DB_Primary/corefolder/70/emstk_corefolderNTS-70-1.png
  483x439      25KB  data/Works_NumberTales/Images/DB_Primary/corefolder/71/emstk_corefolderNTS-71-1.png
  470x475      24KB  data/Works_NumberTales/Images/DB_Primary/corefolder/72/emstk_corefolderNTS-72-1.png
  472x407      23KB  data/Works_NumberTales/Images/DB_Primary/corefolder/73/emstk_corefolderNTS-73-1.png
  436x416      24KB  data/Works_NumberTales/Images/DB_Primary/corefolder/73/emstk_corefolderNTS-73-2.png
  482x416      22KB  data/Works_NumberTales/Images/DB_Primary/corefolder/74/emstk_corefolderNTS-74-1.png
  449x438      21KB  data/Works_NumberTales/Images/DB_Primary/corefolder/75/emstk_corefolderNTS-75-1.png
  473x463     123KB  data/Works_NumberTales/Images/DB_Primary/corefolder/75/emstk_corefolderNTS-75-2.png
  472x443      26KB  data/Works_NumberTales/Images/DB_Primary/corefolder/76/emstk_corefolderNTS-76-1.png
  472x443      25KB  data/Works_NumberTales/Images/DB_Primary/corefolder/76/emstk_corefolderNTS-76-2.png
  525x442      25KB  data/Works_NumberTales/Images/DB_Primary/corefolder/76/emstk_corefolderNTS-76-3.png
  525x442      25KB  data/Works_NumberTales/Images/DB_Primary/corefolder/76/emstk_corefolderNTS-76-4.png
  476x462      22KB  data/Works_NumberTales/Images/DB_Primary/corefolder/77/emstk_corefolderNTS-77-1.png
  476x461      23KB  data/Works_NumberTales/Images/DB_Primary/corefolder/77/emstk_corefolderNTS-77-2.png
  519x488      33KB  data/Works_NumberTales/Images/DB_Primary/corefolder/78/emstk_corefolderNTS-78-1.png
  509x413      30KB  data/Works_NumberTales/Images/DB_Primary/corefolder/78/emstk_corefolderNTS-78-2.png
  457x441      22KB  data/Works_NumberTales/Images/DB_Primary/corefolder/8/emstk_corefolderNTS-8-1.png
  479x454      20KB  data/Works_NumberTales/Images/DB_Primary/corefolder/81/emstk_corefolderNTS-81-1.png
  469x438      26KB  data/Works_NumberTales/Images/DB_Primary/corefolder/84/emstk_corefolderNTS-84-1.png
  451x414      19KB  data/Works_NumberTales/Images/DB_Primary/corefolder/85/emstk_corefolderNTS-85-1.png
  451x415      20KB  data/Works_NumberTales/Images/DB_Primary/corefolder/85/emstk_corefolderNTS-85-2.png
  493x421      23KB  data/Works_NumberTales/Images/DB_Primary/corefolder/86/emstk_corefolderNTS-86-1.png
  507x450      35KB  data/Works_NumberTales/Images/DB_Primary/corefolder/87/emstk_corefolderNTS-87-1.png
  551x505      37KB  data/Works_NumberTales/Images/DB_Primary/corefolder/87/emstk_corefolderNTS-87-2.png
  551x504      39KB  data/Works_NumberTales/Images/DB_Primary/corefolder/87/emstk_corefolderNTS-87-3.png
  542x518      43KB  data/Works_NumberTales/Images/DB_Primary/corefolder/88/emstk_corefolderNTS-88-1.png
  490x441      23KB  data/Works_NumberTales/Images/DB_Primary/corefolder/89/emstk_corefolderNTS-89-1.png
  477x443     131KB  data/Works_NumberTales/Images/DB_Primary/corefolder/89/emstk_corefolderNTS-89-2.png
  447x447      22KB  data/Works_NumberTales/Images/DB_Primary/corefolder/9/emstk_corefolderNTS-9-1.png
  468x458     124KB  data/Works_NumberTales/Images/DB_Primary/corefolder/9/emstk_corefolderNTS-9-2.png
  495x435      27KB  data/Works_NumberTales/Images/DB_Primary/corefolder/92/emstk_corefolderNTS-92-1.png
  448x412      20KB  data/Works_NumberTales/Images/DB_Primary/corefolder/93/emstk_corefolderNTS-93-1.png
  385x462     124KB  data/Works_NumberTales/Images/DB_Primary/corefolder/93/emstk_corefolderNTS-93-2.png
  520x372      19KB  data/Works_NumberTales/Images/DB_Primary/corefolder/94/emstk_corefolderNTS-94-1.png
  515x480      32KB  data/Works_NumberTales/Images/DB_Primary/corefolder/96/emstk_corefolderNTS-96-1.png
  519x426      25KB  data/Works_NumberTales/Images/DB_Primary/corefolder/96/emstk_corefolderNTS-96-2.png
  523x484      31KB  data/Works_NumberTales/Images/DB_Primary/corefolder/97/emstk_corefolderNTS-97-1.png
  558x530      28KB  data/Works_NumberTales/Images/DB_Primary/corefolder/97/emstk_corefolderNTS-97-2.png
  558x530      27KB  data/Works_NumberTales/Images/DB_Primary/corefolder/97/emstk_corefolderNTS-97-3.png
  477x423      22KB  data/Works_NumberTales/Images/DB_Primary/corefolder/98/emstk_corefolderNTS-98-1.png
  541x490      39KB  data/Works_NumberTales/Images/DB_Primary/corefolder/99/emstk_corefolderNTS-99-1.png
  541x490      39KB  data/Works_NumberTales/Images/DB_Primary/corefolder/99/emstk_corefolderNTS-99-2.png
```

### NumberTales / DB_Secondary（13 枚）

```text
  368x440      93KB  data/Works_NumberTales/Images/DB_Secondary/corefolder/hexademical/0xA/emstk_corefolderNTS-0xA-1.png
  497x383     113KB  data/Works_NumberTales/Images/DB_Secondary/corefolder/hexademical/0xB/emstk_corefolderNTS-0xB-1.png
  452x409     126KB  data/Works_NumberTales/Images/DB_Secondary/corefolder/hexademical/0xC/emstk_corefolderNTS-0xC-1.png
  452x409     125KB  data/Works_NumberTales/Images/DB_Secondary/corefolder/hexademical/0xC/emstk_corefolderNTS-0xC-2.png
  384x421     101KB  data/Works_NumberTales/Images/DB_Secondary/corefolder/hexademical/0xD/emstk_corefolderNTS-0xD-1.png
  384x421     102KB  data/Works_NumberTales/Images/DB_Secondary/corefolder/hexademical/0xD/emstk_corefolderNTS-0xD-2.png
  446x422     106KB  data/Works_NumberTales/Images/DB_Secondary/corefolder/hexademical/0xE/emstk_corefolderNTS-0xE-1.png
  450x453     118KB  data/Works_NumberTales/Images/DB_Secondary/corefolder/hexademical/0xF/emstk_corefolderNTS-0xF-1.png
  449x452     133KB  data/Works_NumberTales/Images/DB_Secondary/corefolder/hexademical/0xF/emstk_corefolderNTS-0xF-1a.png
  449x452     119KB  data/Works_NumberTales/Images/DB_Secondary/corefolder/hexademical/0xF/emstk_corefolderNTS-0xF-2.png
  449x452     133KB  data/Works_NumberTales/Images/DB_Secondary/corefolder/hexademical/0xF/emstk_corefolderNTS-0xF-2a.png
  500x449     161KB  data/Works_NumberTales/Images/DB_Secondary/corefolder/numberize/emstk_corefolderNTS-241RZ1.png
  487x423     113KB  data/Works_NumberTales/Images/DB_Secondary/corefolder/numberize/emstk_corefolderNTS-605RZ1.png
```

### NumberTales / DB_SemiPrimary（13 枚）

```text
  495x418     123KB  data/Works_NumberTales/Images/DB_SemiPrimary/corefolder/100/emstk_corefolderNTS-100-1.png
  551x413     142KB  data/Works_NumberTales/Images/DB_SemiPrimary/corefolder/111/emstk_corefolderNTS-111-1.png
  551x413     141KB  data/Works_NumberTales/Images/DB_SemiPrimary/corefolder/111/emstk_corefolderNTS-111-2.png
  461x465     142KB  data/Works_NumberTales/Images/DB_SemiPrimary/corefolder/216/emstk_corefolderNTS-216KZ-1.png
  618x517      32KB  data/Works_NumberTales/Images/DB_SemiPrimary/corefolder/222/emstk_corefolderNTS-222A-2a.png
  616x518      32KB  data/Works_NumberTales/Images/DB_SemiPrimary/corefolder/222/emstk_corefolderNTS-222B-2b.png
  628x551      59KB  data/Works_NumberTales/Images/DB_SemiPrimary/corefolder/3x11/emstk_corefolderNTS-3x11-1.png
  629x550      61KB  data/Works_NumberTales/Images/DB_SemiPrimary/corefolder/3x11/emstk_corefolderNTS-3x11-2.png
  545x446     137KB  data/Works_NumberTales/Images/DB_SemiPrimary/corefolder/444/emstk_corefolderNTS-444-1.png
  545x446     135KB  data/Works_NumberTales/Images/DB_SemiPrimary/corefolder/444/emstk_corefolderNTS-444-2.png
  545x446     138KB  data/Works_NumberTales/Images/DB_SemiPrimary/corefolder/444/emstk_corefolderNTS-444-3.png
  524x425     146KB  data/Works_NumberTales/Images/DB_SemiPrimary/corefolder/64/emstk_corefolderNTS-64XP-1.png
  592x502      43KB  data/Works_NumberTales/Images/DB_SemiPrimary/corefolder/666/emstk_corefolderNTS-666-1.png
```

### NumberTales / DB_SelfSecondary（6 枚）

```text
  551x413     143KB  data/Works_NumberTales/Images/DB_SelfSecondary/corefolder/111/emstk_corefolderNTS-111MP-1.png
  461x465     131KB  data/Works_NumberTales/Images/DB_SelfSecondary/corefolder/216/emstk_corefolderNTS-216-1.png
  530x436     149KB  data/Works_NumberTales/Images/DB_SelfSecondary/corefolder/223/emstk_corefolderNTS-223-1.png
  545x446     137KB  data/Works_NumberTales/Images/DB_SelfSecondary/corefolder/444/emstk_corefolderNTS-444MP-1.png
  592x502      40KB  data/Works_NumberTales/Images/DB_SelfSecondary/corefolder/666/emstk_corefolderNTS-666MP-1.png
  484x400     121KB  data/Works_NumberTales/Images/DB_SelfSecondary/corefolder/753/emstk_corefolderNTS-753-1.png
```


## 参考リンク

- 下流 Issue: https://github.com/radiann-kswg/100BeautiesLab_CreationsAI/issues/1
- 下流 PR（image-index への解像度メタ付与。依頼3 の射程）: https://github.com/radiann-kswg/100BeautiesLab_CreationsAI/pull/2
- 画像ディレクトリ規約: `AGENTS.md`「API 通信とデータ管理」/ `docs/api-sw-spec.md`
- 同日の依頼1 対応（`addon-ai-tag` ブランチ）: `_work_in_progress/2026-09-06_progress_aihints-seed-semiprimary-selfsecondary.md`
