# RAG PoC Grounded Generation Design

## Purpose

Phase 1-Cでは、Phase 1-A / 1-Bで選定したretrieval strategyを既存の`/api/generate`へ接続し、要件メモからの構造化生成にproduct knowledge contextを渡せるようにした。

今回はretrieval integrationの土台を作る段階であり、RAG OFF / ONの実LLM品質比較はPhase 1-Dで実施する。

## Selected Retrieval Configuration

Phase 1-A / 1-Bの実測結果に基づき、grounded generationでは以下を固定する。

| Item | Value |
|---|---|
| Strategy | `heading-aware-v1` |
| Top K | 5 |
| Embedding model | `.env.local`の`OPENAI_EMBEDDING_MODEL`、既定は`text-embedding-3-small` |
| Prompt version | `llm-app-poc-rag-v1` |

`RAG_CHUNK_STRATEGY`や`RAG_TOP_K`を設定する場合も、Phase 1-Cでは`heading-aware-v1` / `5`以外を許可しない。chunk parameterやembedding modelの比較は別評価として扱う。

## Runtime Flow

### RAG OFF

```text
Requirement memo
  -> generation provider
  -> GenerationOutput
  -> Zod validation
  -> generation history
```

RAG OFFではretriever、OpenAI Embeddings、Qdrantを呼び出さない。

### RAG ON

```text
Requirement memo
  -> query embedding
  -> Qdrant retrieval
  -> Top 5 chunks
  -> grounded context construction
  -> generation provider
  -> GenerationOutput
  -> Zod validation
  -> generation history with RAG metadata
```

RAG ONでは、retrieved chunksを`<retrieved_product_knowledge>`で囲んだcontextとしてpromptへ渡す。contextには`sourceId`、document title、heading path、source path、contentを含める。embedding vector、APIキー、認証headerは含めない。

Phase 1-Eでは、semantic retrieval結果とgeneration contextへ採用するchunk selectionを分離した。retrieverはranked candidatesを返し、context selection policyがfinal context chunksを選択する。

```text
Requirement memo
  -> query embedding
  -> Qdrant semantic retrieval candidates
  -> context selection policy
       raw-top-k-v1
       document-cap-v1
  -> final context chunks
  -> grounded context construction
  -> generation provider
```

`raw-top-k-v1`はPhase 1-C / 1-D baselineとしてsemantic Top 5をそのまま使う。`document-cap-v1`はsemantic Top 10候補をrank順に走査し、同一document最大2 chunksで最大5 chunksを選択する。scoreは再計算せず、original retrieval rankを`retrievalRank`、final context orderを`contextRank`として保持する。

Phase 1-Eのsmoke testで、`document-cap-v1`はmaximumChunksFromSameDocumentを3から2へ下げたが、uniqueDocumentCount@5は3のままだった。このnegative resultを受けて、`document-diversity-v1`を追加した。`document-diversity-v1`はsemantic Top 10候補に対して、Pass 1で各documentの最初のchunkを優先採用し、Pass 2で同一document最大2 chunksまで残りslotを埋める。最後にselected setを`retrievalRank`昇順へ戻してから`contextRank`を付与する。

## Request and History Shape

`POST /api/generate`は以下を受け付ける。

```json
{
  "inputText": "要件メモ",
  "ragMode": "off",
  "ragContextPolicy": "raw-top-k-v1"
}
```

`ragMode`は`off`が既定値。`ragContextPolicy`は`raw-top-k-v1`が既定値で、`ragMode=on`の場合だけcontext selectionへ使用する。`ragMode=off`ではcontext policyに関係なくretrievalを実行しない。

生成履歴には既存の`GenerationOutput` schemaを変更せず、record metadataとして`rag`を追加する。

```json
{
  "rag": {
    "mode": "on",
    "strategy": "heading-aware-v1",
    "topK": 5,
    "embeddingModel": "text-embedding-3-small",
    "retrievalLatencyMs": 123,
    "contextPolicy": "document-diversity-v1",
    "candidateTopK": 10,
    "candidateChunkCount": 10,
    "candidateUniqueDocumentCount": 7,
    "candidateDocumentChunkCounts": {
      "profile-image-spec": 3,
      "error-message-guideline": 1,
      "profile-api": 2,
      "frontend-cache-guideline": 1,
      "media-upload-security": 1,
      "storage-lifecycle": 1,
      "notification-settings-spec": 1
    },
    "requestedFinalTopK": 5,
    "maxChunksPerDocument": 2,
    "selectedChunkCount": 5,
    "uniqueDocumentCount": 4,
    "maximumChunksFromSameDocument": 2,
    "documentChunkCounts": {
      "profile-image-spec": 2,
      "error-message-guideline": 1,
      "profile-api": 1,
      "frontend-cache-guideline": 1
    },
    "sources": [
      {
        "sourceId": "S1",
        "rank": 1,
        "contextRank": 1,
        "retrievalRank": 1,
        "score": 0.91,
        "chunkId": "profile-image-spec:heading-aware-v1:0001",
        "documentId": "profile-image-spec",
        "documentTitle": "プロフィール画像仕様",
        "headingPath": ["アップロード制約"],
        "sourcePath": "data/rag/knowledge/profile-image-spec.md",
        "content": "最大5MBまで。JPG / PNGに対応する。"
      }
    ]
  }
}
```

既存履歴との互換性のため、`rag`がない古いrecordも有効とする。

Phase 1-C / 1-Dの既存RAG ON履歴には`contextPolicy`、`contextRank`、`retrievalRank`がない場合がある。履歴をmigrateせず、UIではlegacy RAG ONを`legacy raw Top-K`として表示する。

## Fail-Closed Policy

RAG ONでは、retrievalが失敗した場合や有効なchunkが0件の場合、generation providerを呼ばずにエラーを返す。

理由:

- 根拠なしでRAG ONの生成結果を作ると、RAG OFFとの差分が曖昧になる。
- retrieval failureとgeneration failureを切り分けるため。
- 実LLM APIクレジットを不要に消費しないため。

RAG OFFではこのfail-closed pathを通らず、従来どおりprovider生成を行う。

## UI

画面ではRAG OFF / ONを切り替えられる。既定はOFF。

RAG ON時だけcontext policyを選択できる。

- Baseline: `raw-top-k-v1`
- Document cap: `document-cap-v1`
- Document diversity: `document-diversity-v1`

RAG ONの生成結果または履歴詳細では、retrieved sourcesを以下の情報付きで表示する。

- source ID
- context rank
- retrieval rank
- score
- chunk ID
- document ID
- document title
- heading path
- source path
- content

Phase 1-Cの実環境smoke test中に、summary / metadata panelのlayout regressionを修正した。原因は、2列gridの直下DOMがsummary heading、summary body、metadataの3要素になっていたことで、CSS Grid auto placementによりsummary bodyがauto columnへ配置され、左columnが極端に狭くなった点だった。修正後はsummary heading/bodyを`summary-content`へまとめ、`summary-content`と`meta-list`の明示的な2block構造にした。metadataはresponsive gridとし、narrow viewportでは1columnにする。

## Phase 1-C Smoke Test

通常のローカルPowerShellとブラウザから、同一入力、同一provider/model、同一promptVersionでRAG OFF / ONのend-to-end smoke testを実施した。

条件:

| Item | Value |
|---|---|
| Provider/model | `openai` / `gpt-5.4-mini` |
| Prompt version | `llm-app-poc-rag-v1` |
| Requirement input | プロフィール画像変更要件 |
| RAG ON strategy | `heading-aware-v1` |
| RAG ON topK | 5 |

実測metadata:

| Item | RAG OFF | RAG ON |
|---|---:|---:|
| Provider latency | 7.4 s | 8.9 s |
| Server processing | 7.4 s | 9.5 s |
| Client elapsed | 8.3 s | 10.1 s |
| Input tokens | 475 | 1032 |
| Output tokens | 865 | 1277 |
| Total tokens | 1340 | 2309 |
| Retrieval latency | N/A | 0.7 s |
| Embedding tokens | N/A | 72 |

RAG OFFでは、retrieval latency、retrieved sources、retrieval embedding usageは表示されなかった。RAG ONでは、strategy、topK、retrieval latency、embedding model、embedding tokens、retrieved sourcesが表示された。

RAG ONのTop 5 retrieved sources:

| Rank | Source ID | Document | Section |
|---:|---|---|---|
| 1 | S1 | `profile-image-spec` | プロフィール画像仕様 > 受け入れ条件 |
| 2 | S2 | `profile-image-spec` | プロフィール画像仕様 > アップロード制約 > サイズと形式 |
| 3 | S3 | `profile-image-spec` | プロフィール画像仕様 > アップロード制約 > 不正入力 |
| 4 | S4 | `error-message-guideline` | エラーメッセージガイドライン > プロフィール画像アップロード > Validation error |
| 5 | S5 | `profile-api` | プロフィールAPI仕様 > Endpoint > プロフィール画像アップロード |

RAG ON生成結果では、以下のproduct-specific factsが反映されることを観測した。

- `POST /api/profile/image`
- `multipart/form-data`
- `image` field
- 5MB上限
- JPG / JPEG / PNG
- 拡張子だけではなくサーバー側画像検査結果を扱うこと
- latest profile image URLを使った表示更新
- unsupported format / oversized fileに対応するエラー観点
- validation error message

RAG OFFではAPI実装が「必要に応じてバックエンドAPIを整備する」程度の一般的な記述だったのに対し、RAG ONでは`POST /api/profile/image`、`multipart/form-data`、`image` fieldなどAPI契約が具体化された。

このsmoke testはRAG OFF / ONが実環境で動作することと、retrieved contextが生成内容へ反映されることを確認するためのもの。Phase 1-D前のため、ここではquality scoreを付けない。

### Context Diversity Observation

今回のRAG ON Top 5では、無関係な`notification-settings-spec`や`search-filter-spec`は含まれなかった。一方、Top 5のうち3件が`profile-image-spec`由来であり、same-document chunksが複数slotを占有した。

観測:

- first relevant rankingは良好だった。
- unrelated distractorはTop 5へ入らなかった。
- `frontend-cache-guideline`、`media-upload-security`、`storage-lifecycle`は今回のTop 5へ含まれなかった。
- Hit@5、MRR、Source Recall@5だけでは、Top-K context diversityを直接評価できない。
- Phase 1-Dでgenerationへの影響を確認する。

必要であれば、次の改善候補としてdocument diversity、deduplication、MMR、rerankingなどを検討する。ただしPhase 1-Cではbaselineを維持し、これらは実装しない。今回のデータだけから内部ranking原因を断定しない。

## Evaluation Plan

Phase 1-Dでは以下の条件を固定してRAG OFF / ONを比較する。

| Item | Value |
|---|---|
| Provider/model | `openai` / `gpt-5.4-mini`予定 |
| Prompt version | `llm-app-poc-rag-v1` |
| Generation schema | 既存`GenerationOutput` |
| Requirement input | プロフィール画像変更要件 |
| RAG strategy | `heading-aware-v1` |
| Top K | 5 |

比較結果はprovider企業全体やモデル一般の優劣ではなく、このPoCのsynthetic corpus、特定入力、prompt version、schema、実行時点の環境に限定して扱う。

## Local Verification Commands

通常のローカルPowerShellで、repository rootから以下を実行する。

```powershell
docker compose up -d qdrant
npm run rag:ingest:heading
npm run dev
```

画面でRAG ONに切り替えて生成する前に、必要に応じてdebug APIでretrievalのみ確認する。

```powershell
curl -X POST http://localhost:3000/api/rag/search -H "Content-Type: application/json" -d "{\"query\":\"プロフィール画像のアップロード制約と即時反映方法\",\"strategy\":\"heading-aware-v1\",\"topK\":5}"
```

Codex sandbox内ではOpenAI Embeddings APIやQdrant実体への外部接続を実行しない。
