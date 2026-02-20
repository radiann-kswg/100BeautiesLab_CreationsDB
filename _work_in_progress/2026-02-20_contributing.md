# 2026-02-20: CONTRIBUTING.md 追加とドキュメント整備

## 目的

- リポジトリの機能/ルールが増えてきたため、Issue/PR/開発手順/データ更新手順の入口を `CONTRIBUTING.md` に集約する。
- 既存Markdownの記述ゆれ（直リンク仕様など）を最小限で補正する。

## 変更点の要約

- `CONTRIBUTING.md` を新規追加。
  - 開発環境、テスト、データ更新（db_type/db_meta）、ブランチ/PR のチェックリストを整理。
- `README.md` の技術セクションに、貢献手順とテスト手順へのリンクを追加。
- `pages/README.md` の直リンク例を `idx/idxKey` を含む形に更新し、`num` の後方互換を明記。
- `README.test.md` の Notes を現状の構成（`lib/data-common.js` を中心にロジックをテスト）に合わせて更新。

## 影響範囲（編集したファイル）

- `CONTRIBUTING.md`（新規）
- `README.md`
- `pages/README.md`
- `README.test.md`

## 未完了タスク

- なし（必要があれば、Issue/PR テンプレートや CODEOWNERS の導入を別途検討）

## 参考

- Qiita: 【GitHub】CONTRIBUTING.md（「迷わせないこと」を目的に入口を集約する、という方針の参考）
