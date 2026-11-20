# 未宣言部位図10件の明示参照を補完

## 目的

CreationsAI [Issue #4](https://github.com/radiann-kswg/100BeautiesLab_CreationsAI/issues/4) で未宣言と判明した10画像について、作者の追加依頼に基づきCreationsDB側の参照を補完する。main / developで作業する。

## 原画照合と変更内容

- Primaryの2-alt（2B）・5・50・58・63・75・87: 部位図7枚と設定画7枚を見比べ、既存TailsUnitの形状・本数・配色・分岐配置との対応を確認。`TailsUnit[0].TailsUnit_PNGName` へ実名を追加し、それ以外の尾の値は維持する。
- Primaryの28: 設定画と差分の表裏拡大図を確認。既存AD[4]の表面番号図とAD[9]のダングルイヤリングを維持し、番号意匠の裏面図を1項目追加する。表示側がDesignElementからattrサブフォルダを導出するため、`attr/numberMark` にある裏面図は `#Element_NumberMark` で関連付ける。裏面自体に数字があるとは記述しない。
- SelfSecondaryの223・753: 設定画・コアフォルダ画像・部位図を照合し、両形態にある本人左頬の下線付き番号を各1項目登録する。既存のFaceMaking / Left / NumberMarkを使い、Formationは共通のnullとする。番号から形状・衣装・新しい設定は補完しない。
- 223の部位図は透明部分のRGBも暗色だが、alphaと原画の印字を確認できており空画像ではない。

## 影響範囲

- `data/Works_NumberTales/DataBases/db_Primary.json`
- `data/Works_NumberTales/DataBases/db_SelfSecondary.json`
- `CHANGELOG.md` と本ログ

schema・元画像・権利指定・既存英訳は変更しない。新しい日英説明は確認できた位置・印字と画像の役割だけに限定する。ADは既存CLIで候補を準備し、根拠・辞書・型のdry-run検証後にapplyした。

## 検証と残作業

- 候補・画像観察・適用記録は `.cache/issue4/db-declarations/`。
- 初回の全体テストで、既存の衣装品項目へ28の番号図を付けるとフォルダがずれることを検出。元項目を復元して番号意匠の裏面項目へ修正し、CLIで再検証・適用した。
- 元データとの限定差分をassertし、対象外レコード・既存権利・既存英訳・尾の形状/本数/分岐の不変を確認。登録された画像集合が元の未宣言10件と完全一致し、表示側と同じDesignElementからのフォルダ導出でも全10ファイルが実在することを検証した。
- 最終全体テストは84ファイル/1,519件成功（32.26秒）。修正直後の画像・schema・フィールド順の関連122テストも成功。`data:order:check` は0/1465、`git diff --check` も成功。
- 独立Ponytail Reviewで最終の追加指摘なし。28の既存AD14項目を維持して末尾1項目だけ追加し、223/753は各1項目。新しい英訳もJPの観察範囲に一致することを確認した。
- データ変更は作業中にmain/developの `465413fc` へコミットされたことを確認。この検証結果の追記はその後の差分。
- sub1へのマージとCreationsAIの再生成・公開反映は未実施。
