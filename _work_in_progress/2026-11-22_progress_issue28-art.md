# NumberTales 完成イラストの収録と制作候補（2026-11-22）

[Issue #28](https://github.com/radiann-kswg/100BeautiesLab_CreationsDB/issues/28) の残対応。上流は本体ローカルの `develop@14ffc63a`。作者確認により、26番の絵チャット画像を Primary の `Images.arts_PNGPath` に追加し、既存のレコード・画像カテゴリの利用条件を適用した。既存の別作品への画像参照も保持した。

## 収録結果

- 26番はギャラリーとローカル再ビルドの許可済み画像索引で参照できる（820×589）。Primary の `arts/` にある PNG 101枚のうち、同 DB の `Images.arts_PNGPath` が参照する実ファイルは99枚。残り2枚はいずれも既知の `_lang_EN/` の言語差分。
- 89番は JPEG バイトだった同名ファイルを PNG として再保存。JPEG/PNG をともに BGRA32 へデコードし、1061×878・全画素の SHA-256 が一致した（`0065ee8c3aa38bed6c25603babd4d2561bd9463eec7848ba448ba27d377e89aa`）。下流の画像索引でも幅1061・高さ878・長辺1061を取得できた。
- Primary の catalog 11枚は、すべて既存名・9000×6000でレコードから参照できた。参考観察として、リポジトリ全体の署名走査では NumberTales Primary の完成絵以外に、PNG 拡張子で PNG 署名を持たない画像が6枚あった。

## 制作・収録の優先順位

CreationsAI `7dbd5997` のビルダーと検証器を使用。入力は `addon-ai-tag@d6ca65e8` のアーカイブに今回の26番の参照と89番のファイルを適用したもの。出力は `.cache/issue28-inventory/dataset/`。作品・DB・カテゴリ・レコード・個別画像の除外、共有画像の拒否優先を適用した。同じ出力の許可済みマニフェストと画像索引の共通部分を集計した。

NumberTales の対象は Primary 95件、SemiPrimary 13件、SelfSecondary 9件、計117件。8月の112件とは母集団が異なる。設定画・衣装資料は別カテゴリで、下表で0枚でも設定画が存在する場合がある。

| 順位 | バッジ | 次の作業 |
| --- | --- | --- |
| 1（8件） | Primary **51・80**、SemiPrimary **777・777JP・888**、SelfSecondary **148・777MP・777JMP** | 許可済みの `arts` と `corefolder` がともに0枚。手元の公開可能な原画を先に探し、あれば登録、なければ新規制作の第一候補。148の既存合同絵は共有画像の除外が効くため候補に含めていない。 |
| 2（2件） | Primary **67A・67B** | ヒューマノイドの絵チャット画像は各1枚。`images.corefolder` は空なので、コアフォルダ原画を優先して探す。 |
| 3（45件） | Primary 30件、SemiPrimary 9件、SelfSecondary 6件 | 正規のコアフォルダ画像があり、許可済みの `arts` が0枚。イベント絵・合同絵を含む既存絵を優先する。全バッジは棚卸しコマンドの「corefolder あり・arts 0枚」で再取得できる。 |
| 個別確認（2件） | Primary **0・00** | 両者とも `arts` があり、現行の形態別 AIHints には `humanoid` のみがある。コアフォルダ制作の優先枠に入れる根拠は未確認。 |

残り60件は `arts` と `corefolder` の両方を持つ。許可済み `arts` は延べ130参照・実画像100枚。このうち19枚を複数の対象レコードが参照する。56・65のコアフォルダ合同絵、47・74の絵チャット、34・43の合同絵は、いずれも双方のレコードに登録済み。記念絵のようにファイル名に番号がないものも、実パスで集計した。

## 検証と再集計

```powershell
node tools/inventory-numbertales-art.mjs .cache/issue28-inventory/dataset
```

公開済みデータセットを再集計する場合は、引数をその `ai-dataset` ディレクトリに変更する。出力には親コミット、対象レコードの全バッジ、共有実パスと参照元が含まれる。ファイル名やギャラリー掲載だけで個々の登場人物の形態を確定しない。

- 下流のローカル再ビルドと検証成功。全11作品・1,511レコード、画像参照533件、未解決0件。公開データセットへの反映は上流変更の取り込み後。
- [収録・再集計の手順](../docs/db-update-guidelines.md#71-numbertales-の完成イラストを公開するとき)・[棚卸しツール](../tools/inventory-numbertales-art.mjs)・[回帰テスト](../tests/inventory-numbertales-art.test.js)・[11月20日の事前調査](./2026-11-20_github-issue-28-review.md)・[画像メタの別課題 #63](https://github.com/radiann-kswg/100BeautiesLab_CreationsDB/issues/63)
