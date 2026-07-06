# Codex Task 01 — Qdrant Retrieval Foundation

## 目的

既存repository:

```text
C:\Users\tomo5\ai_development_support_workbench
```

に、RAG PoC Phase 1-Aのretrieval foundationを実装する。

今回はretrieval単体を完成・評価可能にする。

既存 `/api/generate` へのRAG context注入はまだ行わない。

## 前提

LLMアプリ開発PoC Phase 1は完了済み。

既存機能:

- Next.js / React / TypeScript
- mock / OpenAI / Gemini / Anthropic generation providers
- Structured Outputs
- common Zod validation
- generation history
- latency / usage metadata
- 24 tests passed
- working tree clean

RAG設計資料:

```text
docs/rag_poc/rag_poc_spec_v0_2_qdrant.md
docs/rag_poc/rag_poc_evaluation_v0_1.md
```

このtask開始前に両方を読んでください。

## 実装範囲

今回実装する:

1. Qdrant Docker Compose
2. RAG env configuration
3. synthetic Markdown corpus
4. Markdown document loader
5. fixed-size-v1 chunker
6. heading-aware-v1 chunker
7. OpenAI embedding client
8. Qdrant client
9. collection mapping
10. ingestion CLI
11. semantic retriever
12. POST /api/rag/search
13. retrieval evaluation dataset
14. retrieval evaluation CLI
15. unit/integration-style tests with external calls stubbed
16. README update

今回実装しない:

- `/api/generate`へのRAG統合
- RAG ON/OFF UI
- source citation UI
- reranking
- hybrid search
- BM25
- query rewriting
- RAGAS
- LLM-as-a-Judge
- new generation provider
- production deployment

## 1. 事前確認

最初に以下を確認してください。

```text
git status
git log -5 --oneline
npm run typecheck
npm test
npm run build
```

working treeがcleanでない場合は、勝手に既存差分へ混ぜず報告してください。

既存RAG実装がすでに存在する場合は重複実装せず内容を確認してください。

## 2. 公式仕様確認

実装前に現行公式documentationを確認してください。

対象:

- Qdrant local Docker quickstart
- Qdrant JavaScript/TypeScript client
- collection creation
- point upsert
- Query APIまたは現行推奨semantic vector query方法
- payload response
- OpenAI Embeddings API
- text-embedding-3-small
- array inputによるmultiple embeddings

technical implementationはprimary sourceを基準にしてください。

READMEやsource commentへ不要なURL羅列はしないでください。

## 3. Qdrant Docker Compose

repository rootに:

```text
compose.yaml
```

を追加してください。

要件:

- qdrant/qdrant
- port 6333
- port 6334
- named volume
- service name `qdrant`
- local development用途

想定command:

```text
docker compose up -d qdrant
docker compose ps
docker compose down
```

Qdrant storageをGit管理対象へ入れないでください。

Qdrantをpublic networkへ公開するproduction構成として扱わないでください。

## 4. Dependencies

Qdrant official JavaScript/TypeScript REST clientを追加してください。

想定:

```text
@qdrant/js-client-rest
```

Markdown heading parsingに小さなdependencyが必要な場合は追加可能です。

ただしLangChainやLlamaIndexは今回導入しないでください。

理由:

RAG pipelineのloader / chunker / embedding / vector store / retriever責務を自分で実装し、構造を理解できるPoCにするため。

## 5. Environment configuration

`.env.example`へ最低限追加:

```env
RAG_EMBEDDING_PROVIDER=openai
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
QDRANT_URL=http://localhost:6333
QDRANT_API_KEY=
```

既存`OPENAI_API_KEY`をembeddingでも使用してください。

secret実値は書かないでください。

必要ならRAG config moduleを作成してください。

例:

```text
lib/rag/config.ts
```

config validationでは分かりやすいerrorを返してください。

## 6. Synthetic knowledge corpus

追加:

```text
data/rag/knowledge/profile-image-spec.md
data/rag/knowledge/profile-api.md
data/rag/knowledge/media-upload-security.md
data/rag/knowledge/frontend-cache-guideline.md
data/rag/knowledge/error-message-guideline.md
data/rag/knowledge/storage-lifecycle.md
data/rag/knowledge/notification-settings-spec.md
data/rag/knowledge/search-filter-spec.md
```

内容は`rag_poc_spec_v0_2_qdrant.md`の要件に合わせてください。

重要:

- synthetic / fictional product knowledgeであること
- public portfolioへcommit可能であること
- 実在企業の内部仕様を模倣・転記しないこと
- API key、個人情報、機密情報を含めないこと
- retrieval caseで答えが一意または合理的に評価できる内容にすること
- distractor documentsを意味のある別機能仕様として作ること

各documentに明確なtitleとH2/H3構造を持たせてください。

## 7. RagDocument schema / loader

必要な型・Zod schemaを用意してください。

最低限:

```ts
type RagDocument = {
  documentId: string;
  sourcePath: string;
  title: string;
  content: string;
  contentHash: string;
};
```

knowledge directory内の`.md`を読み込むloaderを実装してください。

documentIdはfile basenameから安定生成してよいです。

要件:

- deterministic ordering
- empty document rejection
- title取得
- duplicate documentId detection
- SHA-256等によるcontentHash
- Windows path差異を公開metadataへ不要に持ち込まない
- sourcePathはrepository relativeなnormalized slash pathを使用する

## 8. Chunk schemas

最低限:

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

chunkIdは同一document content + strategy + chunk index等からdeterministicに生成してください。

ランダムUUIDで毎回変化させないでください。

## 9. fixed-size-v1 chunker

baselineとして実装してください。

初期設定:

```text
targetChars=800
overlapChars=120
```

要件:

- fixed character boundary baseline
- overlapあり
- empty chunkなし
- infinite loopなし
- short document対応
- Japanese text対応
- headingをboundary decisionへ使わない
- metadata保持

文字数ベースでありtoken-aware chunkingではないことをsource/doc上で明確にしてください。

## 10. heading-aware-v1 chunker

Markdown H1 / H2 / H3を解析してください。

要件:

- heading path保持
- section単位chunking
- oversized sectionのみ再分割
- oversized splitではfixed-size baseline相当のtarget/overlapを利用可能
- embeddingTextにはdocument title / heading path / contentを含める
- contentには不要なembedding prefixを混ぜない
- preambleが存在するdocumentも安全に扱う
- heading-only empty sectionを不正chunkとして大量生成しない

simple parserで十分ですが、regexだけで複雑化する場合はMarkdown AST library導入を検討してください。

## 11. Embedding client

例:

```text
lib/rag/embedding.ts
```

OpenAI Embeddings APIを利用してください。

model:

```text
OPENAI_EMBEDDING_MODEL
default example: text-embedding-3-small
```

要件:

- `OPENAI_API_KEY`未設定error
- input array batch対応
- query embedding対応
- input orderとresponse indexを正しく対応
- empty input rejection
- HTTP 4xx / 5xx error
- rate limit / quota / billing系errorを可能な範囲で安全に分類
- malformed response handling
- vector dimension consistency validation
- secretをログに出さない
- input全文をDEBUGログに出さない

external APIの実呼び出しをtestでは行わずfetchをstubしてください。

Embedding usage metadataがresponseから取得できる場合は、ingestion report用に返せる設計にしてください。

## 12. Qdrant client

例:

```text
lib/rag/qdrant.ts
```

`@qdrant/js-client-rest`を使用してください。

責務:

- client creation
- collection name mapping
- collection exists
- recreate collection
- upsert chunks
- query chunks

collection mapping:

```text
fixed-size-v1 -> rag_chunks_fixed_v1
heading-aware-v1 -> rag_chunks_heading_v1
```

collection:

- dense vector
- Cosine distance
- vector dimension明示

Point ID:

Qdrant client/APIが受け付ける安定ID形式を使ってください。

chunkIdをpayloadへ必ず保存してください。

payload最低限:

```text
chunkId
documentId
sourcePath
documentTitle
headingPath
content
chunkIndex
chunkStrategy
contentHash
embeddingModel
```

query resultからpayloadをruntime validationしてください。

unsafe castだけで済ませないでください。

## 13. Ingestion CLI

追加command:

```text
npm run rag:ingest:fixed
npm run rag:ingest:heading
```

実装例:

```text
scripts/rag-ingest.ts
```

既存toolingに合わせてtsx等を追加してよいです。

処理:

1. parse args
2. load documents
3. chunk documents
4. generate embeddings
5. validate consistent dimension
6. recreate target collection
7. upsert points
8. print safe summary

safe summary:

- strategy
- documents
- chunks
- embeddingModel
- vectorDimension
- collection
- upsertedPoints
- provider-reported embedding usage if available

表示禁止:

- API key
- Authorization header
- vector全値
- input全文

重要:

Codex sandboxから実OpenAI APIを呼ばないでください。

Qdrant local Docker操作も、実行環境制約で問題がある場合は無理に起動せず、commandと検証結果を報告してください。

## 14. Retriever

例:

```text
lib/rag/retriever.ts
```

interface:

```ts
type RetrieveInput = {
  query: string;
  strategy: RagChunkStrategy;
  topK: number;
};

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

処理:

1. query validation
2. query embedding
3. collection mapping
4. Qdrant Top-K query
5. payload validation
6. rank付与
7. normalized result返却

initial topK:

```text
5
```

score thresholdは初期段階では固定導入しないでください。

metric取得前に任意thresholdでrelevant resultを消さないためです。

## 15. Search debug API

追加:

```text
POST /api/rag/search
```

request schema:

```json
{
  "query": "プロフィール画像のアップロード制約と即時反映方法",
  "strategy": "heading-aware-v1",
  "topK": 5
}
```

Zod等でvalidationしてください。

responseには:

- query
- strategy
- topK
- embeddingModel
- results

を含めてください。

embedding vectorやsecretは返さないでください。

Node.js runtimeが必要なdependencyを使用する場合はroute runtimeを明示してください。

## 16. Retrieval evaluation dataset

追加:

```text
data/rag/evaluation/retrieval_cases.json
```

`rag_poc_evaluation_v0_1.md`の8caseを実データ化してください。

schema validationを追加してください。

expectedDocumentIdsが実corpusのdocumentIdに存在することを可能ならevaluation開始時に検証してください。

## 17. Retrieval evaluation metrics

実装:

- Hit@K
- MRR
- Source Recall@K

document ID単位で重複除去してください。

重要:

Top-Kに同じdocumentのchunkが複数存在してもSource Recallを重複加算しない。

case別failureを確認できるreportにしてください。

## 18. Retrieval evaluation CLI

commands:

```text
npm run rag:evaluate:fixed
npm run rag:evaluate:heading
```

output:

```text
strategy
topK
cases
Hit@5
MRR
Source Recall@5
```

さらにcase summary:

```text
CASE-001 hit=true firstRelevantRank=1 sourceRecall=1.00
```

failure caseではretrieved document IDsをrank順に出してください。

API keyやvectorは出さないでください。

今回はevaluation CLIから実OpenAI APIをCodex sandboxで勝手に実行しないでください。

## 19. Tests

外部OpenAI API / Qdrant network callはstub/mockしてください。

最低限:

### loader

- Markdown loading
- deterministic ordering
- title extraction
- empty document error
- duplicate document ID error
- normalized source path

### fixed chunker

- short document
- long document
- overlap
- empty chunkなし
- deterministic chunk IDs

### heading-aware chunker

- H1/H2/H3 hierarchy
- heading path
- oversized section split
- embeddingText prefix
- preamble
- empty heading section

### embedding client

- missing API key
- batch response index mapping
- malformed response
- inconsistent dimension
- HTTP error
- usage mapping

### Qdrant mapping

- strategy -> collection name
- payload validation
- result normalization

### metrics

- Hit@K
- MRR
- Source Recall@K
- duplicate document chunks
- no relevant result

### API

- invalid request
- valid result shape

既存24 testsを壊さないでください。

## 20. Documentation

READMEへ必要最小限追加:

- RAG PoC Phase 1-A
- Qdrant startup
- ingestion commands
- retrieval evaluation commands
- search API example
- required env vars
- docs links

追加docs:

```text
docs/rag_poc/rag_poc_spec_v0_2_qdrant.md
docs/rag_poc/rag_poc_evaluation_v0_1.md
```

ユーザーが渡した仕様ファイルをrepositoryへ配置する場合、内容を勝手に大きく書き換えず、必要なformat調整だけ行ってください。

## 21. Git / security

以下を確認:

- `.env.local` ignored
- `data/generations.json` ignored
- API keys not staged
- Qdrant local storage not staged
- synthetic corpus is safe to publish

必要な`.gitignore`更新を行ってください。

`git add .`は使用しないでください。

## 22. Validation

実行:

```text
npm run typecheck
npm test
npm run build
git diff --check
```

可能ならDocker CLI存在確認:

```text
docker --version
docker compose version
```

Qdrant実起動やOpenAI embedding実呼び出しは、Codex実行環境のnetwork/sandbox制約があるため勝手に成功したと仮定しないでください。

外部API creditを消費しないでください。

## 23. 今回はコミットしない

実装とlocal/stub validationまで行い、コミットしないでください。

理由:

次にユーザーが通常のローカルPowerShellから:

1. `docker compose up -d qdrant`
2. Qdrant health/dashboard確認
3. fixed-size ingestion
4. heading-aware ingestion
5. retrieval evaluation

を実行する。

実測結果を確認してからPhase 1-A / 1-Bとしてコミットする。

## 最終報告

以下を要約してください。

- architecture
- Qdrant collection design
- payload design
- chunk strategy implementation
- embedding implementation
- ingestion CLI
- retriever / search API
- evaluation metrics
- synthetic corpus
- changed files
- test count
- typecheck / test / build result
- Docker確認結果
- actual OpenAI/Qdrant callsを行ったか
- local PowerShellで次に実行するcommands
- current uncommitted changes
- security check result
