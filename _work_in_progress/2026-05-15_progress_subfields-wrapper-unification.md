# subFields wrapper 統合作業メモ

- 目的: `subFields` による standalone 描画へ `spec` 系も統合し、独自整形が必要な subField を shared section renderer registry 経由で扱えるようにする
- 変更点の要約: 新設した `lib/section-wrapper-common.js` に section renderer registry を分離し、`pages/characters.js` の subField 描画を `sectionWrapper` 宣言ベースへ寄せた
- 変更点の要約: 新設した `lib/section-wrapper-common.js` に section renderer registry を分離し、`pages/characters.js` の subField 描画を `sectionWrapper` 宣言ベースへ寄せた。あわせて `subFields` に列挙された key は basic/profile/relation の既定ルートより優先して、JSON 宣言順どおりに standalone section を並べるようにした
- 影響範囲: `lib/section-wrapper-common.js`, `pages/characters.js`, `data/db_type.json`, `data/Works_*/DataBases/db_type.json`, `tests/section-wrapper-common.test.js`, `tests/pages.characters.ui-output.test.js`, `docs/wrapper-summary-registry.md`, `docs/implementation-playbook.md`, `.github/copilot-instructions.md`, `CHANGELOG.md`
- 未完了タスク: 単体テスト実行 / docs リンク確認 / 追加作品の目視確認
- 参考リンク: `docs/wrapper-summary-registry.md`, `docs/implementation-playbook.md`, `data/db_meta.json`
