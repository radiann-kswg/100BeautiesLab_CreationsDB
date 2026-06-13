# 2026-06-13 希望タスク

## 今回の希望タスクの対応を始める前に

2026年5～6月中の残留タスクについて、リポジトリ全体で進捗の整理をあらかじめ行い、これまでで対応中の作業や対応ルールの全体を把握したうえで、当ファイルの内容を確認していただきたい。

### 既存の残留タスク・対応中の事項

以下に対応中の残留タスクについてまとめている進捗ログを記載する。

- 2026-05-29-progress_bilingual-wrapper-apiswui.md
- 2026-06-01_remaining-task.md
- 2026-06-09_progress_identitymotif-conversion.md
- 2026-06-12_progress_language-toggle.md
- 2026-06-12_progress_translation-style-unified.md

### 引継ぎまたは棚卸を行いたい進捗ログ

以下の進捗ログは、他のタスクの進捗ログと比較して、内容が重複している（もしくは記録として助長すぎる）可能性があるため、上記の進捗ログなどへの引継ぎや内容の棚卸を行い整理したうえで 当該の進捗ログファイルを削除したい。

- 2026-06-11_progress_english-fields-addition.md
- 2026-06-12_progress_english-fields-followup.md
- 2026-06-12_progress_translation-num11-13.md
- 2026-06-12_progress_translation-num14-16.md
- 2026-06-12_progress_translation-num23-25.md
- 2026-06-12_progress_translation-num26-30.md

## 希望タスク内容

前述にある通りの2026年5～6月中の残留タスクについて リポジトリ全体で進捗の整理を行ったうえで、今後既存の残留タスクに加えて追加で行っていただきたい希望タスクと将来対応についてをまとめる。
なお これらの希望タスクは番号順に優先順を記載しているため、可能であればその順序で対応することが望ましい。

### 1. 英訳時の創作固有な表現や固有語彙の辞書DBの作成およびUI拡張（最優先）

この希望タスクは、以下の既存タスクに関連する対応である。併せて内容を確認していただきたい。

- 2026-06-01_remaining-task.md （タスク 2. 造語・固有名詞辞書機能と創作基本資料 DB の追加）
- 2026-06-12_progress_translation-style-unified.md

#### 現状

現在、翻訳スタイルの統一に向けた対応が進められているが、創作固有な表現や固有語彙については、翻訳者（おもにGitHub Copilot）の裁量に任されている部分が大きい。そのため、翻訳の品質やスタイルの一貫性を保つためには、これらの表現を管理するため（および創作閲覧者に創作作品の基本情報を共有するため）の辞書DBを作成し、UI上で参照できるようにすることが望ましい。

#### 創作固有な表現や固有語彙の例

- 創作内で重要な意味を持つ造語（例: `Works_PastDiver`における「時空遷移/ChronoidShift(ing)」など）
- 創作世界における独自の地名や組織名、キャラクターの肩書きなどの固有名詞

#### 対応方針

- 創作固有な表現や固有語彙を管理するための辞書DBを新たに実装する。
- 辞書DBには、用語の日本語表記、英語表記、説明（日本語・英語両方）などのフィールドを設けることが望ましい。
- UI上では 翻訳を行う際に、これらの用語を参照できるようにする。また、創作閲覧者も作品の基本情報としてこれらの用語を参照できるようにする。

#### 補足と留意事項

- 辞書DBの内容は、**Userが手動で入力することを前提とし、GitHub Copilotなどの自動補完機能による内容の生成**は可能な限り避けることが望ましい。

### 2. BasicInfo フィールドの厳密な和英対応

この希望タスクは、以下の既存タスクに関連する対応である。併せて内容を確認していただきたい。

- 2026-05-29-progress_bilingual-wrapper-apiswui.md
- 2026-06-12_progress_language-toggle.md
- 2026-06-01_remaining-task.md （タスク 5. bilingual wrapper の UI 表示対応）

#### 現状

`BasicInfo`フィールドは、直近の実装で和英両方の情報を含むことができるよう機能の改修が行われたが、実際には`#Number_withAbout` 型などで英文ページを表示しているのに`about_EN`フィールドではなく`about_JP`フィールドにある日本語の説明が表示されているなど、和英の内容が混在しているケースがある。

#### 対応方針

- `BasicInfo`フィールドなどの和英両方の内容を厳密に分けるため、各作品のDBにおいて`value_JP`, `value_EN`, `about_JP`, `about_EN`を適切にUI（もしくはAPI/SW）で切り換えられているかを確認し、問題がある箇所を修正する。
- wrapper/section renderer 側で、`BasicInfo`フィールドの内容を表示する際に、UIの言語設定に応じて適切なフィールドを参照するように修正する。
- なお、この対応は`BasicInfo`フィールドに限らず、他のフィールド（例: `StreamingGreeting`の`greeting_JP`/`greeting_EN`など）についても同様の対応を行うことが望ましい。

### 3. IdentityMotif フィールドのUI対応

この希望タスクは、以下の既存タスクに関連する対応である。併せて内容を確認していただきたい。

- 2026-05-29-progress_bilingual-wrapper-apiswui.md
- 2026-06-09_progress_identitymotif-conversion.md
- 2026-06-12_progress_language-toggle.md

#### 現状

`IdentityMotif`フィールドは UIの表示対応が一切行われておらず、キャラシートUI上では全く表示されない状態である。

#### 対応方針

- `IdentityMotif`フィールドの内容をキャラシートUI上で表示するための実装を行う。
- 具体的には、`IdentityMotif`フィールドの内容を適切にUI上で描画するためのwrapper/section rendererを実装する。
- 類似対応として、他にObject形式で和文フィールドと英文フィールドが共存しているその他のフィールド（`StreamingGreeting`の`greeting_JP`/`greeting_EN`など）についても、UIの言語設定に応じて適切な内容が表示されるようにすることが望ましい。

## 備考

このログファイルはUserが進捗状況を把握・記録するために作成したものであり、GitHub Copilotにより自動生成されたものではない。
