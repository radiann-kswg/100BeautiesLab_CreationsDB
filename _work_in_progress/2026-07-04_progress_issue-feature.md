# Issue機能の追加（データベース改善目的） (2026-07-04)

## 目的

データベース改善（誤字・不整合の報告、機能改善提案）を受け付けられるように、リポジトリへ GitHub Issues 連携機能を追加する。

## 変更点の要約

1. **GitHub Issues 機能を有効化**
   - `radiann-kswg/100BeautiesLab_CreationsDB` の Issues 機能をON（User が Settings から手動有効化。Claude 側トークンは Administration write 権限が無く `gh repo edit --enable-issues` は 403 で失敗したため）。
2. **Issue テンプレート追加（`.github/ISSUE_TEMPLATE/`）**
   - `data-correction.yml` — データ内容の誤り・修正報告用。対象作品（dropdown）/対象DB/対象キャラクター名またはインデックス値/該当フィールド名/詳細/該当URL/確認チェックボックス（未公開創作内容を含まないことの確認）。
   - `feature-suggestion.yml` — サイト機能・DB構造の改善提案用。背景/提案内容/代替案/確認チェックボックス。
   - `config.yml` — 白紙Issue無効化＋ `guideline.md` とホームページへの導線（contact_links）。
3. **サイト側の連携導線（`pages/characters.html` / `characters.js` / `characters.sass` / `characters.css`）**
   - キャラ詳細表示の `.detail-header` に「⚠ データの誤りを報告」リンク（`#btn-report-issue`）を追加。
   - `renderDetail()` 内で `buildDataCorrectionIssueUrl(workId, dbName, detailTitleBase)` を呼び出し、表示中の 作品/DB/キャラクター識別情報/現在ページURL を `data-correction.yml` の各フィールドid（`work`/`db`/`character`/`url`）へクエリパラメータとして事前入力した GitHub Issue 作成画面URLを組み立てる。
   - `work` は GitHub Issue Forms のdropdown事前入力仕様に合わせ、テンプレートの選択肢文字列と完全一致するラベル（`ISSUE_REPORT_WORK_LABELS`）へマッピング。
   - 非公開キャラクター表示時・一覧表示時（詳細未選択時）はリンクを非表示に維持（`#detail-view` が hidden の間は自動的に隠れる）。
   - `characters.sass` に `.detail-header__report`（右寄せ・折返し無し）を追加し、対応する `characters.css` へ手動反映（`npx sass` でのフル再コンパイルは既存の autoprefixer 由来のベンダープレフィックスを剥がす差分が大量に出たため、今回の追加分のみ手動で同期）。
   - `<meta name="asset-version">` を `2026.07.02.2` → `2026.07.04.1` へ更新（CSS/JS両方更新のため）。
4. **ドキュメント**
   - `CHANGELOG.md` に追記。

## 影響範囲（編集したファイル）

- `.github/ISSUE_TEMPLATE/data-correction.yml`（新規）
- `.github/ISSUE_TEMPLATE/feature-suggestion.yml`（新規）
- `.github/ISSUE_TEMPLATE/config.yml`（新規）
- `pages/characters.html`
- `pages/characters.js`
- `pages/characters.sass`
- `pages/characters.css`
- `CHANGELOG.md`

## 検証

- `npm test` → 21 files / 163 tests passed（既存回帰無し）。
- ローカル `python -m http.server` + Playwright（devDependency）でキャラ詳細deep link（`?work=NumberTales&db=Primary&idx=2&idxKey=Num`）を開き、
  - `#btn-report-issue` が表示され、`href` が `https://github.com/radiann-kswg/100BeautiesLab_CreationsDB/issues/new?template=data-correction.yml&title=...&db=Primary&character=2%28%E3%83%84%E3%82%B0%29&url=...&work=%E3%83%8A%E3%83%B3%E3%83%90%E3%83%BC%E3%83%86%E3%83%BC%E3%83%AB%E3%82%BA...` の形で正しく組み立てられることを確認。
  - `?work=NumberTales&db=Primary`（詳細未選択の一覧表示）では `#btn-report-issue` が `hidden` のままであることを確認。
- 検証用の一時スクリプト（`.cache/check_issue_btn*.mjs`）は確認後に削除済み。

## 未完了タスク・注意点

- **GitHub上でのテンプレート最終表示確認は未実施**（ローカルでYAML構文は目視確認したのみ）。User側で一度 `https://github.com/radiann-kswg/100BeautiesLab_CreationsDB/issues/new/choose` を開き、テンプレート選択画面・フォーム項目の見え方を確認してもらえると安心。
- **`feature-suggestion.yml` からサイトへの動線は未設置**（データ修正報告のみサイト連携。機能提案はGitHub側から直接起票する運用を想定）。必要であれば別途サイト側にも導線を追加可能。
- Issue管理ラベル（`data-correction` / `enhancement`）はテンプレート側で指定済みだが、リポジトリ側にラベル自体が事前定義されているかは未確認（無ければGitHubが自動作成する想定）。
- `characters.css` は手動同期のため、今後 `characters.sass` を編集する際は必ず対応差分を `characters.css` にも反映する（自動コンパイル環境が無い場合、フル再コンパイルすると autoprefixer 差分で無関係な変更が入るため要注意）。
