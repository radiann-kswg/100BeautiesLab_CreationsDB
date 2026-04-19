# 2026-04-19 進捗ログ: 作品別の一覧/詳細 目視確認チェックリスト

## 目的

- 最優先タスク 2 の仕上げとして、`pages/characters.html` の一覧表示と詳細表示について、作品ごとの差分を踏まえた目視確認観点を整理する。
- 特に直近修正の影響を受けやすい「画像ギャラリー/ライトボックス」「基本情報（BirthDay 等）」「能力/安全レベル表示」「二次創作DB表示」を、作品別に確認しやすくする。

## 共通チェック項目（全作品）

- 一覧カード
  - サムネイルの縦横比が崩れない
  - 作品名・サブテキスト・チップがカード幅をはみ出さない
  - モバイル幅でもカード内の改行と余白が破綻しない
- 詳細表示
  - 左カラム画像と右カラム情報が 2 カラム時に重ならない
  - `基本情報` / `スペック/能力` / `プロフィール/テキスト` / `関係` のセクション順が自然
  - `BirthDay` がある作品では「基本情報」に表示され、`その他の項目` へ漏れない
  - `_DBLink` / `_DBLinkResolved` など内部補助情報が画面に出ない
- 画像ギャラリー / ライトボックス
  - 画像カードの高さがキャプション有無で極端に崩れない
  - 「拡大」ボタンのフォーカス枠と角丸が画像枠に沿う
  - ライトボックスの閉じるボタン、背景クリック、`Esc` で閉じられる
  - 小画面でもライトボックス内の画像・キャプションが収まる

## 作品別チェック項目

### 1. NumberTales

- 対象DB
  - `Primary`
  - `Secondary`
  - `SemiPrimary`
  - `SelfSecondary`
  - `UnprocessedSecondary`
- 一覧
  - `#Index` 由来の番号チップがカード幅で潰れない
  - サムネイル無しレコードでもプレースホルダが崩れない
- 詳細
  - `TailsUnit` が基本情報内で自然に収まる
  - `Relation` のリンクやコメント表示が折り返しで崩れない
  - Secondary 系では `RelationToPrimary` が関係セクションとして見える
  - `SafetyLevel` や能力タグが 1 行ごとに崩れず表示される

### 2. FLInvestigator78

- 対象DB
  - `Primary`
  - `PrimaryDealer`
- 一覧
  - タロット由来のインデックスや能力系チップが詰まりすぎない
- 詳細
  - `SafetyLevel` と `SpecLevel` が同じタグ群として視覚的に揃っている
  - `ArcanumspecStats.SpecType` と `EffectStats` の表示順が自然
  - `能力種別` / `効果詳細` が `[object Object]` にならない

### 3. ShouArRiders

- 対象DB
  - `Primary`
- 一覧
  - 画像とチップ群がカード内で均等に収まる
- 詳細
  - `BeastspecName` が基本情報側で見切れず表示される
  - `SpecLevel` 表示がタグ内で崩れない
  - 獣種や分類系のラベルが raw code ではなく表示名になっている

### 4. SinisterChangingGirls

- 対象DB
  - `Primary`
- 一覧
  - 長めの名称やチップが 2 行以上になってもカード高さが極端に乱れない
- 詳細
  - `BustSize` を含む基本情報テーブルの列幅が破綻しない
  - プロフィール系テキストが横スクロールを出さない

### 5. UnauthedLogica

- 対象DB
  - `Primary`
  - `PrimaryMobs`
- 一覧
  - レアリティや分類チップがカードからはみ出さない
- 詳細
  - `ExistingRarity` が wrapper object 表示にならず、整形済みの表示になる
  - mob 系レコードでも基本情報と能力表示のレイアウトが崩れない

### 6. PastDivers

- 対象DB
  - `Primary`
- 一覧
  - サムネイル無し時のプレースホルダ高さが他作品と揃う
- 詳細
  - `ChronoholderName` / `ChronospecName` が基本情報内で見切れない
  - `ChronoizedPurity` / `ChronoizedAbout` など specStats 配下の補助項目が適切なセクションに入る
  - `SafetyLevel` 系表示がタグレイアウトの中で崩れない

### 7. DestinyFoxRecords

- 対象DB
  - `Primary`
- 一覧
  - 画像があるレコードと無いレコードでカード高さの差が過大にならない
- 詳細
  - 基本情報テーブルとプロフィール文の間隔が詰まりすぎない
  - 画像ギャラリーがある場合にキャプション付きカードが崩れない

### 8. Proxies

- 対象DB
  - `Proxy`
- 一覧
  - 代理世代などのインデックス表示がカード上で自然に収まる
  - 実画像サムネイルが縦横比を保って表示される
- 詳細
  - `Proxy` DB でも一覧→詳細遷移が通常作品と同じ構造で表示される
  - 画像ギャラリーとライトボックスが最も確認しやすい作品として、操作確認の起点にできる

## 確認優先順（実施順の推奨）

1. `Proxies / Proxy`
2. `FLInvestigator78 / Primary`
3. `NumberTales / Primary`
4. `NumberTales / Secondary`
5. `PastDivers / Primary`
6. `UnauthedLogica / Primary`
7. `ShouArRiders / Primary`
8. `SinisterChangingGirls / Primary`
9. `DestinyFoxRecords / Primary`

## 補足

- このログは「コード変更」ではなく、目視確認の抜け漏れを減らすための実施観点整理である。
- 目視確認で不具合が見つかった場合は、対象作品/DB/画面幅/表示セクションを控えて、`pages/characters.sass` / `pages/characters.js` のどちらで直すべきか切り分ける。
