# 2026-03-23 APIsec スキャン導入進捗

## 目的

- GitHub Actions から APIsec を用いた API コードスキャンを実行し、結果を GitHub Code Scanning に取り込めるようにする。
- 固定サンプル値で失敗していた既存ワークフローを、実リポジトリ向けの設定駆動ワークフローへ置き換える。

## 変更点の要約

- `.github/workflows/apisec-scan.yml` を再構成し、`workflow_dispatch` 入力と Repository Secrets / Variables を使った設定解決を追加。
- 必須設定未投入時はジョブ失敗ではなくスキップとサマリー通知へ変更。
- APISec 実行後に SARIF 生成有無を判定し、生成時のみ GitHub Code Scanning へアップロードする処理を追加。
- APISec ステップ自体が失敗した場合でも、SARIF 取り込み後にジョブ失敗を返すように制御を整理。
- APISec action の既定ホストが `https://cloud.apisec.ai` であることを踏まえ、`APISEC_HOST` / `apisec_host` で接続先ホストを明示できるようにした。
- undocumented input に依存しないよう、workflow から upstream の `apisec-run-scan.sh` を直接実行する構成へ切り替えた。

## 影響範囲

- `.github/workflows/apisec-scan.yml`
- `CHANGELOG.md`
- `_work_in_progress/README.md`

## 未完了タスク

- GitHub Repository 側で `APISEC_PROJECT` などの Variables と `APISEC_USERNAME` / `APISEC_PASSWORD` Secrets を投入する。
- 利用中テナントが `cloud.apisecapps.com` 系であれば、`APISEC_HOST` にそのベース URL を投入する。
- 必要に応じて `APISEC_OPENAPI_SPEC_URL` を設定し、APIsec 上で対象 API の登録/更新を自動化する。
- 実際の GitHub Actions 実行結果を確認し、プロファイル名やリージョン名が APIsec 側設定と一致するか検証する。

## 次にやるべきこと

以下は、User が GitHub Repository 側で順に確認・投入すれば APISec スキャンを動かせるようにするための具体手順。

### 1. 先に把握しておくこと

- 今回のワークフローは、`.github/workflows/apisec-scan.yml` 内で次の値を参照する。
- 必須なのは `APISEC_USERNAME`、`APISEC_PASSWORD`、`APISEC_PROJECT` の 3 つ。
- これらが未設定でも workflow 自体は壊れず、Actions のサマリー上で「何が足りないか」を表示してスキップする。
- 小文字の `apisec_username` / `apisec_password` も後方互換として読めるが、今後は大文字の `APISEC_USERNAME` / `APISEC_PASSWORD` に寄せるほうがわかりやすい。

### 2. GitHub Secrets に入れる値

GitHub Repository の `Settings` → `Secrets and variables` → `Actions` → `Secrets` で追加する。

- `APISEC_USERNAME`
  - APISec にログインできるユーザー名。
  - 既存で `apisec_username` があるなら、そのままでも一応動く。
- `APISEC_PASSWORD`
  - 上記ユーザーのパスワード。
  - 既存で `apisec_password` があるなら、そのままでも一応動く。

補足:

- 既存の小文字 Secret から大文字 Secret に移行する場合は、値をコピーして大文字版を新設すればよい。
- どちらもある場合は大文字版が優先される前提で考えてよい。

### 3. GitHub Variables に入れる値

GitHub Repository の `Settings` → `Secrets and variables` → `Actions` → `Variables` で追加する。

- `APISEC_PROJECT`
  - 必須。
  - APISec 側で登録済みのプロジェクト名と完全一致させる。
  - 今回の旧失敗例のように、サンプル値 `VAmPI` のままでは動かない。
- `APISEC_PROFILE`
  - 任意。
  - 未設定時は workflow 側で `Master` が使われる。
  - APISec 側に `Master` が存在しない運用なら、実在する profile 名をここに入れる。
- `APISEC_REGION`
  - 任意。
  - APISec 側のスキャナリージョン名に合わせる。
  - 何を指定すべきかわからない場合は、まず未設定で試す。
- `APISEC_OPENAPI_SPEC_URL`
  - 任意。
  - 入れると、workflow 実行時に API 定義を APISec に登録または更新してからスキャンする。
  - まだ APISec 側の project 登録が固まっていない場合や、OpenAPI 定義を workflow から同期したい場合に使う。
- `APISEC_HOST`
  - 任意。
  - APISec の利用テナントが既定の `https://cloud.apisec.ai` ではない場合に設定する。
  - 今回のようにブラウザ上で `https://cloud.apisecapps.com` にログインしている場合は、そのテナント URL をここへ入れないと GitHub Actions 側だけ別ホストへログインし、`Bad Credentials` になる可能性がある。
- `APISEC_REFRESH_PLAYBOOKS`
  - 任意。
  - `true` または `false`。
  - 既存 project の playbooks を更新してから走らせたい場合だけ `true`。
- `APISEC_FAIL_ON_VULN_SEVERITY`
  - 任意。
  - `Critical` / `High` / `Medium` のいずれか。
  - 結果をまず観察したい段階では未設定推奨。
  - CI をゲートしたい段階で初めて `High` などを入れるのが安全。
- `APISEC_EMAIL_REPORT`
  - 任意。
  - `true` または `false`。
  - メール通知が不要なら未設定または `false` のままでよい。

### 4. 最小構成での推奨セット

最初の 1 回は、以下の最小構成で確認するのが安全。

- Secrets
  - `APISEC_USERNAME`
  - `APISEC_PASSWORD`
- Variables
  - `APISEC_PROJECT`
- 利用テナントが既定ホストでない場合のみ追加
  - `APISEC_HOST`
- まずは未設定でよいもの
  - `APISEC_PROFILE`
  - `APISEC_REGION`
  - `APISEC_OPENAPI_SPEC_URL`
  - `APISEC_REFRESH_PLAYBOOKS`
  - `APISEC_FAIL_ON_VULN_SEVERITY`
  - `APISEC_EMAIL_REPORT`

この状態なら、既に APISec 側へ登録済みの project に対して、もっとも単純な on-demand scan を試せる。

### 5. GitHub Actions での手動実行手順

GitHub 上で `Actions` → `APIsec` → `Run workflow` を開き、必要なら以下を入力する。

- `apisec_project`
  - Repository Variable をまだ作っていない場合は、ここに直接 project 名を入れてよい。
- `apisec_profile`
  - Variable 未設定で、かつ `Master` 以外を使いたい場合に入力する。
- `apisec_region`
  - region 指定が必要な運用のときだけ入力する。
- `openapi_spec_url`
  - 今回の実行で API 定義の登録/更新まで行いたい場合のみ入力する。
- `refresh_playbooks`
  - 既存 project の playbooks 更新が必要な場合のみ `true`。
- `fail_on_vuln_severity`
  - 最初の動作確認では `none` 推奨。

手動実行時の考え方:

- まずは Variables/Secrets を入れたうえで、入力欄は空のまま実行して挙動を見るのが簡単。
- 値の切り替えを試したい場合だけ `workflow_dispatch` 入力で上書きする。

### 6. 実行後に見る場所

workflow 実行後は、少なくとも次を確認する。

- Job summary
  - `APIsec scan skipped` と出ていれば、設定不足。
  - 不足している Secret / Variable 名がそのまま出る。
- `Validate APIsec configuration` step
  - workflow がどの project / profile / region 設定で走ろうとしているか確認できる。
- `Trigger APIsec scan` step
  - APISec 側での scan 実行成否がわかる。
- `Detect SARIF output` step
  - `SARIF file generated` なら GitHub Code Scanning への連携対象が作られている。
- Repository の `Security` → `Code scanning alerts`
  - SARIF が正常に上がっていれば、ここに APISec 由来の結果が出る。

### 7. よくある詰まりどころ

- `APIsec scan skipped`
  - Secrets か Variables が足りない。
  - まず `APISEC_USERNAME` / `APISEC_PASSWORD` / `APISEC_PROJECT` の 3 点を確認する。
- `Trigger APIsec scan` が失敗
  - APISec 側の project 名不一致。
  - profile 名不一致。
  - region 名不一致。
  - APISec の認証情報不正。
  - APISec の接続先ホスト不一致。
- SARIF が生成されない
  - APISec 側の scan が完了していない、または失敗している可能性がある。
  - まず `Trigger APIsec scan` のログを確認する。
- Code Scanning に結果が出ない
  - `Detect SARIF output` でファイル未生成になっていないか確認する。
  - `Upload APIsec SARIF` step が走っているか確認する。

### 8. User 向けの推奨作業順

安全に進めるなら、次の順で十分。

1. `APISEC_USERNAME` と `APISEC_PASSWORD` を Secrets に投入する。
2. `APISEC_PROJECT` を Variable に投入する。
3. いったん他の Variables は入れずに手動実行する。
4. 失敗したら APISec 側の project 名、profile 名、region 名の一致を確認する。
5. project 未登録なら `APISEC_OPENAPI_SPEC_URL` か workflow 入力 `openapi_spec_url` を使って登録/更新付きで再実行する。
6. 動作が安定してから `APISEC_FAIL_ON_VULN_SEVERITY` を追加し、CI ゲート化するか判断する。

### 9. User が確認しておくとよいメモ

- 今回の workflow は「設定不足で即失敗する」のではなく、「不足を表示してスキップする」設計。
- そのため、最初の確認ポイントは赤い失敗表示かどうかではなく、Job summary の内容。
- 最初から `fail_on_vuln_severity=High` を入れると、設定が正しくても scan 結果次第でジョブが失敗する。
- 初回はまず scan 実行と SARIF 連携の成立確認を優先し、その後に fail 条件を強めるほうが切り分けしやすい。

## 今回の登録内容に合わせた具体値

User が今回 APISec 登録に使ったファイル `api/.private/openapi.yml` では、少なくとも以下の値が確認できる。

- `info.title`: `100BeautiesLab_CreationsDB API`
- `servers[0].url`: `https://database.numbertales-radiann.net/api/v1`

このため、GitHub 側で最初に試す値は以下を基準にする。

### 1. まず GitHub Variables に入れる候補

- `APISEC_PROJECT`
  - 第一候補: `100BeautiesLab_CreationsDB API`
  - ただし、APISec 画面で project 作成時に別名を手入力しているなら、そちらを優先する。
  - 判定基準は「APISec の project 一覧に表示されている名前と完全一致する文字列」。

### 1.5 今回の認証エラーで追加確認する値

- `APISEC_HOST`
  - APISec をブラウザで開いているホスト名と合わせる。
  - 今回の調査では upstream の `apisec-run-scan.sh` が host 未指定時に `https://cloud.apisec.ai` へログインする実装だった。
  - そのため、User が `https://cloud.apisecapps.com` 側のテナントを使っているなら、認証情報が正しくても host 不一致で `Bad Credentials` になり得る。
  - まずは User が実際にログインしている APISec 画面のベース URL をそのまま `APISEC_HOST` に入れて再実行する。

### 2. 今は入れない方がよい値

- `APISEC_OPENAPI_SPEC_URL`
  - 今回は未設定推奨。
  - 理由: `api/.private/openapi.yml` はローカルの private ファイルであり、そのパス自体を GitHub Actions や APISec に渡しても参照できない。
  - すでに APISec 登録を手動で済ませているため、最初の GitHub 動作確認では不要。

### 3. 任意であとから検討する値

- `APISEC_PROFILE`
  - APISec 画面上で default profile が `Master` なら未設定でよい。
  - `Master` 以外しか無い場合は、APISec に表示されている profile 名をそのまま入れる。
- `APISEC_REGION`
  - region を明示指定しないと動かない場合のみ設定する。
  - 最初は未設定推奨。

### 4. 現時点の推奨設定セット

最初の GitHub 実行では、以下の 3 つだけでよい。

- Secret: `APISEC_USERNAME`
- Secret: `APISEC_PASSWORD`
- Variable: `APISEC_PROJECT=100BeautiesLab_CreationsDB API`
- 利用テナントが `cloud.apisec.ai` 以外なら Variable: `APISEC_HOST=<User が実際にログインしている APISec のベース URL>`

これで workflow を手動実行し、APISec 側に既存 project があれば scan 実行まで進む想定。

## 今回のケースでの推奨実行順

### 1. GitHub Settings に値を投入

- `Settings` → `Secrets and variables` → `Actions`
- `Secrets`
  - `APISEC_USERNAME`
  - `APISEC_PASSWORD`
- `Variables`
  - `APISEC_PROJECT = 100BeautiesLab_CreationsDB API`

### 2. workflow を手動実行

- `Actions` → `APIsec` → `Run workflow`
- いったん入力欄は空のままで実行する
  - `apisec_project`: 空
  - `apisec_profile`: 空
  - `apisec_region`: 空
  - `openapi_spec_url`: 空
  - `refresh_playbooks`: `false`
  - `fail_on_vuln_severity`: `none`

### 3. 実行結果の見方

- `APIsec scan skipped`
  - Secret / Variable の不足。
- `Trigger APIsec scan` が失敗
  - `APISEC_PROJECT` 名が APISec 画面の project 名とズレている可能性が高い。
- `Detect SARIF output` で生成成功
  - GitHub Code Scanning 側への連携候補ができている。

## 将来的に自動更新もしたい場合

今回は「手動登録済み project を GitHub から scan する」段階に留めるのが安全。

もし将来的に `APISEC_OPENAPI_SPEC_URL` を使って registration / update も自動化したいなら、以下が必要。

- OpenAPI ファイルを APISec から到達可能な URL に置く
- その URL を `APISEC_OPENAPI_SPEC_URL` に設定する
- 必要に応じて `APISEC_REFRESH_PLAYBOOKS=true` を追加する

補足:

- 現在の `api/.private/openapi.yml` は private 運用前提のため、GitHub Actions / APISec の自動登録元としては使わない。
- 自動更新をするなら、公開可能な専用の OpenAPI 配置場所を別途用意するほうがよい。

## 参考リンク

- APIsec action: https://github.com/apisec-inc/apisec-run-scan
- 対象ラン: https://github.com/radiann-kswg/100BeautiesLab_CreationsDB/actions/runs/23428132009
