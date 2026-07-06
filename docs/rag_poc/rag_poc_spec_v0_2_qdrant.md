# RAG PoC 仕様書 v0.2 — Qdrant版

## 1. PoC名

AI Development Support Workbench — Grounded Development Preparation RAG

## 2. 背景

既存のLLMアプリ開発PoCでは、要件メモから次の開発準備資料を構造化生成できる。

- summary
- spec
- acceptanceCriteria
- jiraTasks
- implementationPlan
- reviewPoints
- risks

現状は入力要件とLLMの一般知識を中心に生成しており、既存プロダクト固有の仕様、API契約、セキュリティルール、キャッシュ方針、エラー表示ルールなどを検索して根拠として利用していない。

本PoCでは、公開可能なsynthetic Markdown corpusをQdrantへindexし、semantic retrievalで関連chunkを取得し、その根拠を既存generation flowへ注入するRAG機能を追加する。

## 3. 目的

本PoCの目的は「RAGチャットボットを作ること」ではない。

以下を一連で設計、実装、評価できることを示す。

1. Knowledge corpus設計
2. Markdown ingestion
3. Chunk strategy設計
4. Embedding生成
5. Qdrant collection / point / payload設計
6. Semantic retrieval
7. Retrieval evaluation
8. Chunk strategy比較
9. Retrieved contextを利用したgrounded generation
10. Source metadata表示
11. RAG OFF / ON比較
12. Retrieval失敗とgeneration失敗の切り分け

## 4. テーマ

既存仕様・設計ドキュメント参照型AI開発支援。

ユーザーが要件メモを入力すると、関連する既存仕様・設計資料を検索し、その根拠に基づいて次を生成する。

- 仕様整理
- 受け入れ条件
- Jira形式の開発タスク
- 実装方針
- レビュー観点
- リスク・確認事項

生成結果にはretrieved source metadataを表示する。

## 5. 既存LLMアプリとの関係

### RAG OFF

```text
Requirement memo
    |
    v
LLM provider
    |
    v
GenerationOutput
```

### RAG ON

```text
Requirement memo
    |
    v
Query embedding
    |
    v
Qdrant semantic retrieval
    |
    v
Top-K chunks + payload metadata
    |
    v
Context construction
    |
    v
Existing LLM provider abstraction
    |
    v
GenerationOutput + retrieval metadata
```

既存のmulti-provider generation、Structured Outputs、共通Zod validation、履歴保存、latency metadataは維持する。

## 6. Phase構成

### Phase 1-A — Retrieval foundation

実装対象:

- Docker Compose上のQdrant
- synthetic Markdown corpus
- Markdown loader
- fixed-size-v1 chunker
- heading-aware-v1 chunker
- OpenAI embedding client
- Qdrant client
- collection recreation / upsert
- retriever
- retrieval debug API
- ingestion CLI
- retrieval evaluation dataset
- retrieval evaluation CLI

この段階では `/api/generate` にRAGを統合しない。

理由:

retrieval品質とgeneration品質を同時に変更すると、問題の原因を切り分けにくい。最初にretrieval単体を観測・評価可能にする。

### Phase 1-B — Chunk strategy comparison

比較:

- fixed-size-v1
- heading-aware-v1

評価:

- Hit@5
- MRR
- Source Recall@5
- manual retrieval review

heading-aware-v1を採用するかは実測結果で決める。

Phase 1-A / 1-Bの実測では、`heading-aware-v1` がHit@5とSource Recall@5を維持し、MRRを0.854から1.000へ改善した。そのため、Phase 1-Cのgrounded generationでは `heading-aware-v1` を使用する方針とする。詳細は `docs/rag_poc/retrieval_evaluation_results.md` を参照する。

### Phase 1-C — Grounded generation

retrieval strategy決定後、既存 `/api/generate` にRAG modeを統合する。

例:

```json
{
  "inputText": "要件メモ",
  "ragMode": "on"
}
```

`ragMode`はrequest単位で`off` / `on`を切り替える。既定値は`off`。Phase 1-Cでは`RAG_CHUNK_STRATEGY=heading-aware-v1`、`RAG_TOP_K=5`を選定済み設定として使用する。

RAG ON時:

1. requirement memoをqueryとしてembedding
2. QdrantからTop-K chunk取得
3. source metadata付きcontext構築
4. generation provider promptへcontext注入
5. GenerationOutput生成
6. 共通Zod schemaで最終検証
7. retrieval metadataをgeneration historyへ保存

RAG OFF時はretriever、OpenAI Embeddings、Qdrantを呼び出さない。RAG ONでretrieval失敗または有効chunk 0件の場合は、generation providerを呼ばずにエラーを返す。これによりretrieval failureとgeneration failureを切り分ける。

実装詳細は `docs/rag_poc/grounded_generation_design.md` を参照する。

### Phase 1-D — RAG evaluation

同一入力で比較する。

- RAG OFF
- RAG ON

評価観点:

- product-specific rule coverage
- source-grounded requirement coverage
- unsupported assumption reduction
- source appropriateness
- acceptance criteria specificity
- Jira decomposition appropriateness
- JSON schema stability

## 7. 技術構成

### Application

既存構成を継続。

- Next.js
- React
- TypeScript
- Zod

### Vector database

Qdrant OSSをDocker Composeでローカル起動する。

想定:

```text
REST API: http://localhost:6333
Dashboard: http://localhost:6333/dashboard
```

TypeScript client:

```text
@qdrant/js-client-rest
```

### Embedding

初期モデル:

```text
text-embedding-3-small
```

環境変数:

```env
RAG_EMBEDDING_PROVIDER=openai
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
QDRANT_URL=http://localhost:6333
QDRANT_API_KEY=
```

初期PoCではembedding provider abstractionを広げない。

generation provider比較とembedding model/provider比較は別評価テーマとして扱う。

## 8. Docker Compose方針

repository rootに `compose.yaml` を追加する。

要件:

- qdrant/qdrant image
- 6333:6333
- 6334:6334
- Windowsで扱いやすいnamed volume
- restart policyはPoCとして過剰に設定しない
- Qdrantを外部公開しない

概念例:

```yaml
services:
  qdrant:
    image: qdrant/qdrant
    ports:
      - "6333:6333"
      - "6334:6334"
    volumes:
      - qdrant_storage:/qdrant/storage

volumes:
  qdrant_storage:
```

実装時は現行Qdrant公式QuickstartおよびDocker Compose仕様を確認する。

## 9. Knowledge corpus

公開可能なsynthetic corpusのみを使用する。

配置:

```text
data/rag/knowledge/
```

初期文書:

1. `profile-image-spec.md`
2. `profile-api.md`
3. `media-upload-security.md`
4. `frontend-cache-guideline.md`
5. `error-message-guideline.md`
6. `storage-lifecycle.md`
7. `notification-settings-spec.md`
8. `search-filter-spec.md`

最初の6文書はプロフィール画像変更に関連する。

最後の2文書は別機能のnegative / distractor sourceとして使い、semantic retrievalの識別能力を確認する。

実在企業の内部仕様、コード、個人情報、機密情報は使用しない。

## 10. Synthetic corpus内容要件

### profile-image-spec.md

最低限:

- 最大5MB
- JPG / PNG
- 更新成功後の表示反映
- profile image URL
- unsupported format
- oversized file

### profile-api.md

最低限:

- profile image upload endpoint
- request形式
- response概要
- latest image URL
- validation error
- server error

### media-upload-security.md

最低限:

- extensionだけを信頼しない
- MIME / actual content validation
- invalid image rejection
- metadata handling
- malware / virus scanningは運用検討事項
- upload size validation

### frontend-cache-guideline.md

最低限:

- image URL cache
- cache busting
- ETag / versioned URLの考え方
- no full page reload
- multiple device caveat

### error-message-guideline.md

最低限:

- user-facing actionable message
- validation error
- network error
- retryable/non-retryable
- internal exception detailを直接表示しない

### storage-lifecycle.md

最低限:

- new image保存成功後の切替
- failed upload cleanup
- old image cleanup policy
- rollback consideration
- object storage lifecycle

### notification-settings-spec.md

プロフィール画像とは無関係な通知設定文書。

### search-filter-spec.md

プロフィール画像とは無関係な検索filter文書。

## 11. Document metadata

```ts
type RagDocument = {
  documentId: string;
  sourcePath: string;
  title: string;
  content: string;
  contentHash: string;
};
```

documentIdは安定したIDとする。

ファイル名変更以外では不要に変化させない。

## 12. Chunk metadata

```ts
type RagChunkStrategy = "fixed-size-v1" | "heading-aware-v1";

type RagChunk = {
  chunkId: string;
  documentId: string;
  sourcePath: string;
  documentTitle: string;
  headingPath: string[];
  content: string;
  embeddingText: string;
  chunkIndex: number;
  chunkStrategy: RagChunkStrategy;
  contentHash: string;
};
```

chunkIdは再ingestion時に同一入力・同一strategyなら再現可能なdeterministic IDを推奨する。

## 13. Qdrant payload

Qdrant point payload:

```ts
{
  chunkId,
  documentId,
  sourcePath,
  documentTitle,
  headingPath,
  content,
  chunkIndex,
  chunkStrategy,
  contentHash,
  embeddingModel
}
```

embedding vectorはpoint vectorとして保存する。

embedding vectorそのものはdebug APIや公開sampleへ返さない。

## 14. Collection設計

strategyごとにcollectionを分離する。

```text
rag_chunks_fixed_v1
rag_chunks_heading_v1
```

初期distance:

```text
Cosine
```

collection作成時にembedding dimensionとdistance metricを明示する。

dimensionをmagic numberとして複数箇所へ重複定義しない。

embedding responseまたはembedding model configurationと整合する方法で管理する。

## 15. fixed-size-v1

baseline。

初期値:

```text
targetChars = 800
overlapChars = 120
```

要件:

- raw Markdown textを固定長基準で分割
- overlapを付与
- heading構造をchunk boundary決定には使用しない
- document metadataは保持
- empty chunkを生成しない

文字数はtoken数ではないことを資料に明記する。

これは高度なchunkerではなくbaselineである。

## 16. heading-aware-v1

improved candidate。

手順:

1. Markdown title取得
2. H1 / H2 / H3解析
3. heading path保持
4. section単位でchunk化
5. sectionが大きい場合だけ再分割
6. 再分割時にoverlap付与
7. embeddingTextへtitle / heading path / contentを含める

embeddingText例:

```text
Document: プロフィール画像仕様
Section: アップロード制約 > サイズと形式

最大5MBまで。
JPG / PNGに対応する。
```

保存する`content`とembedding用`embeddingText`は分離する。

## 17. Embedding client

OpenAI Embeddings APIを使用する。

要件:

- modelは環境変数から取得
- document chunkとqueryで同じmodelを使用
- 複数chunkを可能な範囲で1 requestのarray inputへまとめる
- response indexを使ってinput orderとの対応を安全に復元
- empty stringを送信しない
- HTTP errorを安全に扱う
- API keyをログへ出さない
- input全文をDEBUGログへ出さない
- usageが取得可能ならingestion reportへtoken usageを含めてもよい
- token数を独自推定してAPI実測値のように扱わない

## 18. Qdrant client

共通client moduleを用意する。

例:

```text
lib/rag/qdrant.ts
```

責務:

- QDRANT_URL取得
- optional QDRANT_API_KEY
- QdrantClient生成
- collection存在確認
- collection recreate
- points upsert
- query
- Qdrant error normalization

API keyやauth headerはログへ出さない。

## 19. Ingestion

CLI:

```text
npm run rag:ingest:fixed
npm run rag:ingest:heading
```

処理:

1. knowledge directory読み込み
2. Markdown validation
3. RagDocument生成
4. chunking
5. embedding batch生成
6. target collection recreate
7. points upsert
8. summary report

summary例:

```text
strategy: heading-aware-v1
documents: 8
chunks: 24
embeddingModel: text-embedding-3-small
collection: rag_chunks_heading_v1
upsertedPoints: 24
embeddingPromptTokens: 3840
```

API keyやvector値をreportしない。

## 20. Retriever

入力:

```ts
type RetrieveInput = {
  query: string;
  strategy: RagChunkStrategy;
  topK: number;
};
```

出力:

```ts
type RetrievedChunk = {
  rank: number;
  score: number;
  chunkId: string;
  documentId: string;
  sourcePath: string;
  documentTitle: string;
  headingPath: string[];
  content: string;
};
```

初期値:

```text
topK = 5
```

Phase 1-Aではsemantic dense vector retrievalのみ。

非対象:

- reranking
- hybrid search
- BM25
- sparse vector
- query rewriting
- multi-query retrieval
- metadata boosting

## 21. Retrieval debug API

追加:

```text
POST /api/rag/search
```

request:

```json
{
  "query": "プロフィール画像のアップロード制約と即時反映方法",
  "strategy": "heading-aware-v1",
  "topK": 5
}
```

response:

```json
{
  "query": "プロフィール画像のアップロード制約と即時反映方法",
  "strategy": "heading-aware-v1",
  "topK": 5,
  "embeddingModel": "text-embedding-3-small",
  "results": [
    {
      "rank": 1,
      "score": 0.91,
      "chunkId": "example",
      "documentId": "profile-image-spec",
      "sourcePath": "data/rag/knowledge/profile-image-spec.md",
      "documentTitle": "プロフィール画像仕様",
      "headingPath": ["アップロード制約", "サイズと形式"],
      "content": "..."
    }
  ]
}
```

注意:

- embedding vectorを返さない
- API keyを返さない
- error responseにsecretを含めない

## 22. Retrieval evaluation dataset

配置:

```text
data/rag/evaluation/retrieval_cases.json
```

schema:

```ts
type RetrievalEvaluationCase = {
  id: string;
  query: string;
  expectedDocumentIds: string[];
  notes: string;
};
```

最低8case。

評価設計詳細は `rag_poc_evaluation_v0_1.md` を参照。

## 23. Retrieval metrics

### Hit@K

Top-K内にexpected documentが1つ以上存在するか。

### MRR

最初に登場したexpected documentのrankからreciprocal rankを計算し、case平均を取る。

### Source Recall@K

expectedDocumentIdsのうち、Top-Kに取得されたdocument IDの割合。

chunk重複はdocument ID単位で除去して計算する。

主評価:

```text
Hit@5
MRR
Source Recall@5
```

## 24. Evaluation CLI

```text
npm run rag:evaluate:fixed
npm run rag:evaluate:heading
```

出力:

- strategy
- topK
- case count
- Hit@K
- MRR
- Source Recall@K
- case別results
- failure cases

必要ならJSON reportもローカル出力できる。

公開用reportを追加する場合、queryとsynthetic corpusのみを対象にする。

## 25. Security / public portfolio policy

Git管理可能:

- compose.yaml
- synthetic knowledge corpus
- retrieval evaluation dataset
- RAG source code
- tests
- public evaluation docs

Git管理対象外:

- `.env.local`
- API keys
- private corpus
- local generation history
- local Qdrant storage data

named Docker volumeを使用する場合、volume自体はGit対象外。

Qdrant local instanceを外部公開しない。

## 26. Non-goals

Phase 1では行わない。

- PDF / Office ingestion
- OCR
- Web crawling
- GitHub repository ingestion
- real company internal documents
- authentication / multi-tenant
- managed vector DB
- hybrid retrieval
- reranker
- GraphRAG
- knowledge graph
- RAGAS導入
- LLM-as-a-Judge
- autonomous agent
- code modification
- production deployment

## 27. Phase 1 completion criteria

1. QdrantをDocker Composeで起動できる
2. synthetic Markdown corpusをingestできる
3. fixed-size-v1 chunkを生成できる
4. heading-aware-v1 chunkを生成できる
5. OpenAI embeddingsを生成できる
6. Qdrant collectionへvector + payloadを保存できる
7. query embeddingからTop-K searchできる
8. debug APIでretrieval結果を確認できる
9. retrieval evaluation datasetを実行できる
10. Hit@5 / MRR / Source Recall@5を計算できる
11. two chunk strategiesを比較できる
12. strategy選定根拠を文書化できる
13. RAG ONで既存generationへcontext注入できる
14. retrieved sourcesをUIへ表示できる
15. RAG OFF / ONを比較評価できる
16. secrets / local DB / public corpusを安全に分離できる
17. README / evaluation / portfolio summaryを整備できる
