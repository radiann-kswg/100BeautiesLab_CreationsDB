# アルベッツ未入力キャラの苗字・コードネーム 下書き入力 (2026-07-06)

## 目的

`data/Works_UnibyteLive/DataBases/db_Primary.json` のアルベッツのうち、
`FormalName_JP` / `FormalName_JPReading` / `FormalName_EN` / `CodeName_JP` / `CodeName_EN` が
未入力だった24人分について、既に確定しているキャラ（N:北上ギザン／S(2代目):左伯ナーミィ／
T(2代目):丁字路ティジー／Y:丫字路ワケメ／Z:右仗ジグ／T(初代):打金クギィ／P(初代):了津フィッシュ／
S(初代):双曲ツェット）の傾向（方位・字形・既存Name_JP/ENに仕込まれたダジャレ）に寄せた命名案を作成し、
一春（Claude）案として **下書き入力** した。**最終的な採否・微調整はUser判断**（今回の入力はドラフト）。

参考資料: `data/Works_UnibyteLive/.private/アルベッツの苗字の命名について.md`（ChatGPT/Gemini初期案）

## 経緯（複数ラウンドの推敲）

Plan Modeで3ラウンドのUserフィードバックを経て確定：

1. **v1**: ChatGPT/Gemini案をベースに24人分の初期ドラフトを作成
2. **v2**: User指摘を受け、実在の有名人・著名創作キャラと苗字が被る4件を修正
   （C:弓月→弧月／O:円城→窓木／Q2代目:尾形→的尾／X2代目:綾瀬→綾織）。
   F/H/K/Pに音楽記号（♭・独音名H・ケッヘル番号・p）の小ネタを追加、L/Rに「行列」対を追加
3. **v3→v4**: User指摘を受けさらに調整
   - O: 苗字漢字を「丸城」・読み「まどぎ」に確定（User指定）
   - H: 独音名H案を撤回し「梯桁（H形鋼／H-Beam）」に変更（I:直井の"I-Beam"と対になる鋼材ペア）
   - R(初代/リャク): Name_JP/ENがネットスラング「以下略(ry)」由来であることが判明し、
     「略歴」「登録商標®」の要素も加えて多層化
   - Q(2代目): CodeName_ENの「Cue」を語源的に正確な「Queue」に修正
   - 他22件はUser承認済みでこのプランでは変更せず（以後Userが直接推敲）

## 変更点の要約

`data/Works_UnibyteLive/DataBases/db_Primary.json` の24レコードに、`Name_JP`/`Name_EN` 直後へ
`FormalName_JP` → `FormalName_JPReading` → `FormalName_EN` → `CodeName_JP` → `CodeName_EN` を挿入。

| 文字 | 苗字(JP) | 読み | EN | 由来（要約） |
|---|---|---|---|---|
| A(6期) | 鋭峰エイリ | えいほうエイリ | Accenty A-Peak | 鋭い頂点＋文字A発音「エイ」 |
| B(3期) | 積木ブロッキー | つみきブロッキー | Blocky B-Block | 「積み木」＝Blockyの直訳 |
| C(5期) | 弧月チャーミ | こげつチャーミ | Charmy C-Crescent | Cの弧＋Charmyの「チャーム」 |
| D(3期) | 半円ドアン | はんげんドアン | Doorn D-Arch | Dの半円＋「ドア」 |
| E(4期) | 三枝エッヂ | さえぐさエッヂ | Edgy E-Ridge | Eの3本線＋エッジ |
| F(6期) | 平旗ハタカ | ひらはたハタカ | Flatka F-Flat | 旗＋音楽記号「フラット(♭)」 |
| G(6期) | 渦田グニー | うずたグニー | Gooniee G-Spiral | Gの渦巻き＋擬態語「ぐにゃぐにゃ」 |
| H(4期) | 梯桁ハシゴ | はしげたハシゴ | Headladder H-Beam | 梯子＋建築用語「H形鋼」 |
| I(1期) | 直井ミィ | なおいミィ | Imy I-Beam | Iの直線＋英一人称「I」 |
| J(2期) | 蛇尾ジャック | じゃびジャック | Jacky J-Hook | Jの鈎形＝蛇の尾＋J発音「ジェイ」 |
| K(6期) | 鍵番キィ | かぎばんキィ | Kèy K-Key | 鍵＋ケッヘル番号(K.) |
| L(2期) | 列柱コナー | れっちゅうコナー | Lracket L-Column | R(行)と「行列」で対 |
| M(4期) | 双峰ヤマネ | そうほうヤマネ | Mountee M-Peaks | Mの双峰＋「山」 |
| O(1期) | 丸城マルア | まどぎマルア | Orvy O-Circle | User指定（丸城／まどぎ） |
| P(2代目) | 音栓プラグ | おんせんプラグ | Plugy P-Stop | パイプオルガンの「音栓(stop)」 |
| Q(2代目) | 的尾マトア | まとおマトア | Que Q-Tail | Qの尾形＋Queueの語源「尾」 |
| Q(初代) | 鏡石レンズ | かがみいしレンズ | Quartz Q-Lens | レンズ＋石英 |
| R(2代目) | 行田ロゥ | ぎょうだロゥ | Rows R-Row | L(列)と「行列」で対 |
| R(初代) | 略歴リャク | りゃくれきリャク | Ry R-Résumé | ネットスラング「以下略(ry)」＋就職卒業生の経歴 |
| U(5期) | 入江カップ | いりえカップ | Uncove U-Cove | UncoveはUncoverのダジャレ |
| V(5期) | 楔谷トゲミ | くさびだにトゲミ | Veen V-Wedge | Vの先端＋「トゲ」 |
| W(4期) | 双谷タニネ | そうやタニネ | Windine W-Valleys | Wの二つの谷＋「谷」 |
| X(初代) | 交野カイ | こうのカイ | Xhi X-Cross | Xの交差＋ギリシャ文字χの読み |
| X(2代目) | 綾織クリス | あやおりクリス | Xriss X-Crisscross | Criss-cross＋綾織 |

## 命名衝突チェック

実在の有名人・著名創作キャラと苗字が紛らわしいものが無いか確認し、明確な懸念があった4件を修正済み
（詳細はプラン参照: 弓月光氏／円城塔氏／ゴールデンカムイ尾形百之助／既出人物名「綾瀬」）。
軽度の参考メモ（一般的な実在苗字だが特定の一人物と強く結びつくわけではないため今回は据え置き）：
E:三枝（作曲家三枝成彰氏）、X(初代):交野（大阪府交野市由来）。

## 影響範囲

- `data/Works_UnibyteLive/DataBases/db_Primary.json`（24レコード、各+5フィールド）
- npm test 実行のため `npm install` を実施（devDependencies未インストール状態だったため）

## 検証

- `npm test` → 22 test files / 178 tests **全件 pass** ✅

## 未完了タスク / 今後の課題

- 今回の24件はあくまで**下書き**。User自身が目視レビューし、特にH・R(初代)の再設計分を含め
  必要に応じて個別修正する想定。
- ボーナス案として提示した I・O の2代目候補（`I:カーソル/Inactive`(4期)・`O:マリル/Objeroll`(6期)）は
  **未実装**。Height_cm等の基礎情報が無いため、DBへの新規レコード追加は別途User判断待ち。
- 軽度の命名衝突メモ（E:三枝／X初代:交野）は据え置きのため、気になる場合は個別に差し替え検討。

## 参考

- `data/Works_UnibyteLive/.private/アルベッツの苗字の命名について.md`（ChatGPT/Gemini初期案）
- 確定済み参考キャラ: N:北上ギザン／S(2代目):左伯ナーミィ／T(2代目):丁字路ティジー／Y:丫字路ワケメ／
  Z:右仗ジグ／T(初代):打金クギィ／P(初代):了津フィッシュ／S(初代):双曲ツェット
