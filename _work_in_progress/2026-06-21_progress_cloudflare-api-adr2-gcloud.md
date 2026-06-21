# 2026-06-21 ADR-0002: 画像生成バックエンドを Google Cloud にする

## Status: Draft（Cloud Run サービス設計中）

- **Date**: 2026-06-21
- **Deciders**: 二春（サークル主） / 一春（代理）

---

## Context（背景）

ADR-0001 で API 配信基盤を Cloudflare Workers + R2 + D1 に移行した。
Cloudflare Workers は CPU 制限（Pro プランで 30秒/req）があるため、
重い処理（画像生成・バッチ変換・GPU 推論）には適さない。

`numbertales-imagegen` 等の画像生成パイプラインのバックエンドとして
**Google Cloud** を棲み分けて使う設計を本 ADR で定義する。

---

## コネクタ疎通状況（2026-06-21 確認 ✓）

- **GCP プロジェクト ID**: `claude-radiannkswg`
- **Google Compute Engine MCP コネクタ**: 疎通確認済み
  - 確認ゾーン: `asia-northeast1-a/b/c`、`us-central1-a`、`asia-northeast2-a`
  - 既存インスタンス: **なし**（クリーンな状態）
- **Cloud Run**: MCP ツールなし → `gcloud` CLI または GCP コンソールで操作

---

## Decision（決定方針）

### 役割分担

| 処理種別                         | 実行基盤                          |
|----------------------------------|-----------------------------------|
| API 配信（検索・参照解決・メタ） | **Cloudflare Workers + R2 + D1**  |
| 画像生成（テキスト→画像）        | **Google Cloud Run** (HTTP エンドポイント) |
| バッチ処理（大量生成・変換）     | **Google Compute Engine** (GPU VM / スポット) |
| モデルホスティング（将来）       | **Vertex AI**（候補・要検討）     |

### 連携経路

```
クライアント
   │
   ▼
Cloudflare Workers  (/api/v1/generate 等、未実装・将来計画)
   │
   └─(subrequest)──► Google Cloud Run
                       asia-northeast1
                       イメージ生成コンテナ (numbertales-imagegen)
                           │
                           ▼
                       Cloudflare R2 (creationsdb-data)
                       生成済み画像を保存
```

Workers の外部 subrequest 上限（Pro: 1000/req）は通常用途では問題なし。

---

## Cloud Run 設計仕様（暫定）

### サービス概要

| 項目 | 値 |
|------|----|
| サービス名 | `numbertales-imagegen` |
| リージョン | `asia-northeast1`（東京） |
| CPU | 1〜4 vCPU（リクエスト中のみ） |
| メモリ | 2〜8 GiB |
| 最小インスタンス | 0（コールドスタート許容） |
| 最大インスタンス | 3 |
| タイムアウト | 300秒 |
| 認証 | Cloud Run Invoker（IAM）または API Key |

> GPU オプション（Cloud Run Gen2 + T4）は将来オプション。まずは CPU 推論から。

### エンドポイント設計

```
POST /generate
Content-Type: application/json
Authorization: Bearer <token>

{
  "workKey": "Works_NumberTales",
  "charKey": "1",           // idx_value
  "template": "icon",       // 生成テンプレート名
  "options": { ... }        // テンプレート固有オプション
}

→ 202 Accepted
{
  "jobId": "abc123",
  "status": "queued",
  "estimatedSeconds": 30
}

GET /generate/{jobId}
→ 200 OK
{
  "jobId": "abc123",
  "status": "done",          // queued | running | done | error
  "r2Key": "generated/Works_NumberTales/1/icon.webp",
  "url": "https://..."
}
```

### Dockerfile スケルトン（参考）

```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
ENV PORT=8080
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]
```

---

## Cloud Run デプロイ手順（初回）

```bash
# 1. Artifact Registry リポジトリ作成
gcloud artifacts repositories create numbertales-imagegen \
  --repository-format=docker \
  --location=asia-northeast1 \
  --project=claude-radiannkswg

# 2. Docker イメージビルド & プッシュ
gcloud builds submit --tag \
  asia-northeast1-docker.pkg.dev/claude-radiannkswg/numbertales-imagegen/app:latest \
  --project=claude-radiannkswg

# 3. Cloud Run デプロイ
gcloud run deploy numbertales-imagegen \
  --image asia-northeast1-docker.pkg.dev/claude-radiannkswg/numbertales-imagegen/app:latest \
  --platform managed \
  --region asia-northeast1 \
  --no-allow-unauthenticated \
  --timeout 300 \
  --memory 4Gi \
  --project=claude-radiannkswg
```

---

## Cloudflare Workers → Cloud Run 認証経路

Cloud Run は未認証リクエストを拒否するため、Workers から呼ぶ際は以下のいずれかを使う：

### 方針A: API Key（シンプル）
- Secret Manager にキーを保存 → Workers の環境変数（`GCLOUD_IMAGE_API_KEY`）から参照
- Cloud Run 側で `X-API-Key` ヘッダーを検証するミドルウェアを実装

### 方針B: OIDC トークン（推奨）
- Workers の Service Account に `roles/run.invoker` を付与
- Workers 側で Workload Identity を使ったトークン取得
- ただし Cloudflare Workers での GCP OIDC フローは実装コストがやや高い

**今フェーズは方針A で進め、本番化時に方針Bへ移行する**。

---

## 次アクション

- [ ] `numbertales-imagegen` リポジトリの Docker 化スコープ確認（別リポジトリ）
- [ ] Cloud Run サービスを `gcloud` で作成（初回は空コンテナ or hello-world でOK）
- [ ] Secret Manager に仮 API Key を登録
- [ ] Workers に `/api/v1/generate` プロキシルートを追加（ADR-0001 次フェーズ）
- [ ] ADR-0002 正式化（Cloud Run URL が確定したら本ファイルを更新）

---

## 未解決事項

- `numbertales-imagegen` のコンテナ化スコープ（別リポジトリのため要別途調整）
- Vertex AI の採用可否（コスト・ファインチューニング要否次第）
- GCE スポット VM の活用可否（大量バッチ時）

---

## 参考

- ADR-0001: [2026-06-21_progress_cloudflare-api-adr.md](./2026-06-21_progress_cloudflare-api-adr.md)
- 関連リポジトリ: `100BeautiesLab_GeneratorsAI`（画像生成パイプライン）
- GCP プロジェクト: `claude-radiannkswg`
