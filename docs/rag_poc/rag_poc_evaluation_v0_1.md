# RAG PoC 評価設計 v0.1

## 1. 評価目的

RAG品質を「最終生成結果がそれっぽい」で評価しない。

以下を分離する。

1. Retrieval Quality
2. Grounded Generation Quality

retrievalが失敗した状態でgenerationだけを評価すると、原因を切り分けられない。

そのため、まずretrieval単体を定量・定性評価し、chunk strategyを決定した後にRAG OFF / ON generation比較へ進む。

## 2. 評価フェーズ

### Evaluation A — fixed-size-v1 baseline

fixed-size chunkingでretrieval metricを取得する。

### Evaluation B — heading-aware-v1

heading-aware chunkingで同じdatasetを評価する。

### Evaluation C — strategy comparison

A / Bのmetricとmanual reviewを比較し、RAG integrationに使用するstrategyを決める。

### Evaluation D — RAG OFF / ON

選定strategyを既存LLMアプリへ統合し、grounded generation品質を比較する。

## 3. Retrieval cases

配置:

```text
data/rag/evaluation/retrieval_cases.json
```

最低8case。

### CASE-001

Query:

```text
プロフィール画像で許可されるファイルサイズと形式を知りたい
```

Expected:

```text
profile-image-spec
```

### CASE-002

Query:

```text
プロフィール画像を変更した直後に画面へ反映する方法
```

Expected:

```text
frontend-cache-guideline
profile-image-spec
```

### CASE-003

Query:

```text
画像アップロードで拡張子偽装や不正ファイルを防ぎたい
```

Expected:

```text
media-upload-security
```

### CASE-004

Query:

```text
プロフィール画像更新APIのレスポンスとエラーコード
```

Expected:

```text
profile-api
```

### CASE-005

Query:

```text
画像アップロード失敗時にユーザーへ何を表示するか
```

Expected:

```text
error-message-guideline
```

### CASE-006

Query:

```text
プロフィール画像を置き換えた後の古い画像や不完全ファイルの扱い
```

Expected:

```text
storage-lifecycle
```

### CASE-007

Query:

```text
通知設定でメール通知を無効にする仕様
```

Expected:

```text
notification-settings-spec
```

### CASE-008

Query:

```text
検索結果をステータスで絞り込む仕様
```

Expected:

```text
search-filter-spec
```

## 4. Metrics

### Hit@K

caseごとにTop-K document ID集合へexpectedDocumentIdsが1件以上含まれる場合1。

```text
Hit@K = hit cases / all cases
```

主評価:

```text
Hit@5
```

### MRR

最初のexpected documentのrankを使う。

```text
RR = 1 / firstRelevantRank
MRR = average(RR)
```

expected sourceが取得されないcaseはRR=0。

### Source Recall@K

caseごとに:

```text
retrievedExpectedDocumentCount / expectedDocumentCount
```

document ID単位で重複除去する。

主評価:

```text
Source Recall@5
```

## 5. Case result schema

各caseで最低限記録する。

```ts
type RetrievalEvaluationResult = {
  caseId: string;
  query: string;
  strategy: RagChunkStrategy;
  topK: number;
  expectedDocumentIds: string[];
  retrieved: Array<{
    rank: number;
    score: number;
    documentId: string;
    chunkId: string;
  }>;
  hit: boolean;
  reciprocalRank: number;
  sourceRecall: number;
};
```

## 6. Comparison table

```text
| Strategy | Hit@5 | MRR | Source Recall@5 |
|---|---:|---:|---:|
| fixed-size-v1 | 1.000 | 0.854 | 1.000 |
| heading-aware-v1 | 1.000 | 1.000 | 1.000 |
```

実測結果の詳細は `docs/rag_poc/retrieval_evaluation_results.md` に記録する。

結果が同等なら「heading-awareの方が高度だから採用」と決めない。

以下も見る。

- rank improvement
- irrelevant chunk contamination
- same-document duplicate chunks
- missing source
- heading metadataの説明性
- chunk単独可読性

## 7. Manual retrieval review

各caseで以下を確認する。

1. Top-1はquery意図に直接関連するか
2. Top-3に必要sourceが含まれるか
3. 別機能documentが上位へ混入していないか
4. chunk単独で意味が通るか
5. document title / heading pathが結果理解に役立つか
6. chunk boundaryで重要情報が欠落していないか
7. 同じdocumentの類似chunkがTop-Kを過剰占有していないか

## 8. Strategy selection rule

heading-aware-v1採用条件:

- Hit@5を悪化させない
- MRRまたはSource Recall@5を改善する

または、

- metric同等でもmanual reviewでchunk独立性、source説明性、grounding用途の読みやすさが明確に改善する

悪化した場合はfailure caseを特定する。

検討候補:

- heading prefixがsimilarityへ過剰影響
- sectionが小さすぎる
- sectionが大きすぎる
- overlap不足
- duplicated context
- title prefix過剰
- fixed char boundaryによるsemantic split

推測だけでparameter変更しない。

### Strategy selection status

Phase 1-A / 1-Bの実測では、`heading-aware-v1` がHit@5を1.000で維持し、Source Recall@5を1.000で維持し、MRRを0.854から1.000へ改善した。

このため、Phase 1-Cのgrounded generationでは `heading-aware-v1` を採用する。これはsynthetic 8-document corpus、8 evaluation cases、`text-embedding-3-small`、topK=5、現在のchunk設定に限定したPoC判断であり、production benchmarkやmodel一般の優劣として扱わない。

## 9. Grounded generation evaluation

retrieval strategy決定後、既存generation flowを比較する。

条件:

- same requirement input
- same generation provider/model
- same promptVersion: `llm-app-poc-rag-v1`
- same GenerationOutput schema
- RAG OFF / ON以外を可能な限り固定
- RAG ON strategy: `heading-aware-v1`
- RAG ON topK: 5

generation providerは最初は1モデルに固定する。

multi-provider RAG比較はPhase 1の非目標。

推奨初期provider/model:

```text
openai / gpt-5.4-mini
```

理由は既存LLM PoCの特定タスクで品質とclient latencyのバランスが良かったため。ただしRAG generation評価結果を見ずに最終モデル選定とはしない。

Phase 1-Cでは、RAG OFF / ONを同じ`/api/generate` endpointで切り替える。`ragMode=off`ではretriever、OpenAI Embeddings、Qdrantを呼ばない。`ragMode=on`ではretrieval成功後のみgenerationへ進み、retrieval失敗または有効chunk 0件ではgeneration providerを呼ばない。

## 10. Grounded generation evaluation input

既存品質比較と同じ入力を使う。

```text
ユーザーがプロフィール画像を変更できるようにしたい。
画像は5MBまで、jpg/png対応。
変更後は即時反映したい。
失敗時にはエラーメッセージを表示したい。
```

RAG corpusには追加のproduct-specific rulesを含める。

例:

- actual image content validation
- success response returns latest image URL
- cache-busting policy
- internal exception detailをuser-facing messageへ出さない
- failed temporary object cleanup
- old image cleanup policy

RAG OFFではこれらをLLMが推測・補完する可能性がある。

RAG ONではretrieved sourcesを根拠に反映できるかを見る。

## 11. Grounded generation evaluation axes

各5段階。

1. Source-grounded requirement coverage
2. Product-specific rule coverage
3. Unsupported assumption control
4. Retrieved source appropriateness
5. Acceptance criteria specificity
6. Jira decomposition appropriateness
7. JSON structure stability

### Source-grounded requirement coverage

retrieved contextの重要ルールがGenerationOutputへ正しく反映されているか。

### Product-specific rule coverage

一般論ではなくcorpus固有ルールが反映されているか。

### Unsupported assumption control

sourceやinputにない断定的条件を勝手に仕様化していないか。

### Retrieved source appropriateness

表示sourceが実際のgeneration内容と関連しているか。

### Acceptance criteria specificity

検証可能な条件になっているか。

### Jira decomposition appropriateness

source-derived implementation concernsが適切にtaskへ分解されているか。

### JSON structure stability

既存GenerationOutput schemaを維持できているか。

## 12. RAG OFF / ON comparison template

```text
| Axis | RAG OFF | RAG ON | Observation |
|---|---:|---:|---|
| Source-grounded requirement coverage | TBD | TBD | TBD |
| Product-specific rule coverage | TBD | TBD | TBD |
| Unsupported assumption control | TBD | TBD | TBD |
| Retrieved source appropriateness | N/A | TBD | TBD |
| Acceptance criteria specificity | TBD | TBD | TBD |
| Jira decomposition appropriateness | TBD | TBD | TBD |
| JSON structure stability | TBD | TBD | TBD |
```

Phase 1-Dの実測比較では、以下も記録する。

| Item | RAG OFF | RAG ON |
|---|---|---|
| provider/model | `openai` / `gpt-5.4-mini` | `openai` / `gpt-5.4-mini` |
| promptVersion | `llm-app-poc-rag-v1` | `llm-app-poc-rag-v1` |
| strategy | N/A | `heading-aware-v1` |
| topK | N/A | 5 |
| retrieved sources | N/A | TBD |
| providerLatencyMs | TBD | TBD |
| serverProcessingMs | TBD | TBD |
| retrievalLatencyMs | N/A | TBD |

単純平均を出す場合、RAG OFFでN/Aのsource appropriatenessをどう扱うか明示する。

RAG ONが必ず高得点になると仮定しない。

## 13. Failure analysis categories

retrieval / generation failureを最低限分類する。

### Retrieval failure

- relevant document missing
- relevant chunk rank too low
- distractor contamination
- duplicate chunks dominate Top-K
- wrong chunk boundary
- query-document semantic mismatch

### Context construction failure

- too much context
- source metadata unclear
- duplicate context
- source ordering issue

### Generation failure

- ignores retrieved rule
- invents unsupported requirement
- over-generalizes source
- source conflict not surfaced
- schema instability

## 14. Non-goals of evaluation

Phase 1では行わない。

- RAGAS
- LLM-as-a-Judge automation
- statistical significance claim
- production benchmark claim
- large-scale corpus benchmark
- multi-model RAG benchmark
- cost optimization benchmark

本評価はsynthetic corpusと特定PoC条件内の比較と明記する。
