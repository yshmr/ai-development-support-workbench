# RAG PoC Context Diversity Evaluation

## Purpose

Phase 1-Eでは、Phase 1-Dで観測したsame-document chunk concentrationに対して、semantic retrieval後のcontext selectionだけを変更し、context diversityとgrounded generation coverageへの影響を評価した。

この評価は、synthetic corpus、同一入力、`llm-app-poc-rag-v1`、`openai` / `gpt-5.4-mini`、`heading-aware-v1`、`text-embedding-3-small`、現在のlocal Qdrant collectionに限定したPoC観測である。RAG一般、Qdrant一般、provider/model一般の優劣として扱わない。

追加の外部API呼び出し、Qdrant query、OpenAI Embeddings API呼び出しは行わず、保存済みの`data/generations.json`履歴だけを評価材料にした。

## Phase 1-D Observation

Phase 1-DのRAG ON raw baselineでは、Top 5 source compositionが3Runとも同一だった。

| Metric | Value |
|---|---:|
| selectedChunkCount | 5 |
| uniqueDocumentCount@5 | 3 |
| maximumChunksFromSameDocument | 3 |
| source composition | `profile-image-spec` x3, `error-message-guideline` x1, `profile-api` x1 |

`frontend-cache-guideline`、`media-upload-security`、`storage-lifecycle`はcontext外だった。そのため、cache handling、security-specific validation、storage lifecycle / cleanupのcoverageに制約が残った。

## Initial Hypothesis And Negative Result

Initial hypothesis:

```text
同一documentのchunk数を最大2件へ制限すると、profile-image-specの複数要件をある程度維持しながら、Top 5 contextのdocument diversityを改善できる可能性がある。
```

Pilot policy: `document-cap-v1`

- candidateTopK: 10
- requestedFinalTopK: 5
- maxChunksPerDocument: 2
- semantic rank順に走査し、同一document最大2 chunksまで採用
- score再計算なし

Smoke test result:

| Metric | raw-top-k-v1 | document-cap-v1 |
|---|---:|---:|
| selectedChunkCount | 5 | 5 |
| uniqueDocumentCount@5 | 3 | 3 |
| maximumChunksFromSameDocument | 3 | 2 |
| `profile-image-spec` chunks | 3 | 2 |
| source composition | `profile-image-spec` x3, `error-message-guideline` x1, `profile-api` x1 | `profile-image-spec` x2, `error-message-guideline` x1, `profile-api` x2 |

Observation:

- cap algorithm自体は正常に動作した。
- maximumChunksFromSameDocumentは3から2へ低下した。
- ただしuniqueDocumentCount@5は3のままだった。
- 除外された`profile-image-spec` 3件目のslotは、別documentではなく`profile-api` 2件目で埋まった。
- `frontend-cache-guideline`、`media-upload-security`、`storage-lifecycle`は依然context外だった。

Conclusion:

`document-cap-v1` failed to improve uniqueDocumentCount@5 in this smoke test.

この結果はnegative resultとして残す。document concentrationは低下したが、Phase 1-Eの中心仮説だったdocument diversity改善は観測されなかった。

## Refined Policy

Refined hypothesis:

```text
diversity-first two-pass selectionなら、candidate poolにadditional documentsが存在する場合、uniqueDocumentCount@5を改善できる可能性がある。
```

Policy: `document-diversity-v1`

- candidateTopK: 10
- requestedFinalTopK: 5
- maxChunksPerDocument: 2
- Pass 1: semantic rank順に走査し、各documentの最初のchunkを優先採用する
- Pass 2: 残りslotをsemantic rank順で走査し、最大2 chunks/documentまでfillする
- selected setをoriginal `retrievalRank`昇順へ戻す
- `contextRank`を1..Nで再付与する
- semantic score、retrievalRank、Qdrant rankingは変更しない
- MMR、reranker、query rewriting、multi-query retrieval、hybrid searchは追加しない

## Smoke Gate Result

`document-diversity-v1`のsmoke testはgateを通過した。

| Metric | Value |
|---|---:|
| candidateTopK | 10 |
| candidateChunkCount | 10 |
| candidateUniqueDocumentCount | 5 |
| selectedChunkCount | 5 |
| uniqueDocumentCount@5 | 5 |
| maximumChunksFromSameDocument | 1 |

Selected source composition:

| contextRank | retrievalRank | documentId |
|---:|---:|---|
| 1 | 1 | `profile-image-spec` |
| 2 | 4 | `error-message-guideline` |
| 3 | 6 | `profile-api` |
| 4 | 9 | `storage-lifecycle` |
| 5 | 10 | `frontend-cache-guideline` |

Smoke observation:

- raw baselineのselected unique documentsは3、`document-diversity-v1`は5だった。
- maximumChunksFromSameDocumentは3から1へ低下した。
- `storage-lifecycle`と`frontend-cache-guideline`が新規にcontext入りした。
- `media-upload-security`は依然context外だった。

このため、formal evaluationは`raw-top-k-v1` x3と`document-diversity-v1` x3で実施した。

## Formal Evaluation Conditions

| Item | Value |
|---|---|
| Provider | `openai` |
| Model | `gpt-5.4-mini` |
| Prompt version | `llm-app-poc-rag-v1` |
| GenerationOutput schema | existing schema |
| Requirement input | プロフィール画像変更要件 |
| ragMode | `on` |
| Chunk strategy | `heading-aware-v1` |
| Embedding model | `text-embedding-3-small` |
| Final Top K | 5 |

Input:

```text
ユーザーがプロフィール画像を変更できるようにしたい。
画像は5MBまで、jpg/png対応。
変更後は即時反映したい。
失敗時にはエラーメッセージを表示したい。
```

## Selected Runs

Smoke test履歴はformal runから除外した。以下6件を、現在の最終Phase 1-E実装状態で生成されたformal evaluation runsとして採用した。

### raw-top-k-v1

| Run | History ID | createdAt | provider/model | promptVersion |
|---|---|---|---|---|
| RAW-1 | `267982d7-b339-4eca-9e2f-d6fb0dda7992` | 2026-07-06T13:41:04.906Z | `openai` / `gpt-5.4-mini` | `llm-app-poc-rag-v1` |
| RAW-2 | `2b4dd1db-770a-49d9-83a1-be3aacf6c845` | 2026-07-06T13:41:28.964Z | `openai` / `gpt-5.4-mini` | `llm-app-poc-rag-v1` |
| RAW-3 | `1ac04f87-afb0-420f-9d14-d3e31e133cbb` | 2026-07-06T13:41:53.745Z | `openai` / `gpt-5.4-mini` | `llm-app-poc-rag-v1` |

### document-diversity-v1

| Run | History ID | createdAt | provider/model | promptVersion |
|---|---|---|---|---|
| DIV-1 | `c1ff70da-c822-436c-a1a3-bb4d1bbd84e0` | 2026-07-06T13:41:17.498Z | `openai` / `gpt-5.4-mini` | `llm-app-poc-rag-v1` |
| DIV-2 | `391f2810-3a30-42f5-8b68-a98861fce588` | 2026-07-06T13:41:40.077Z | `openai` / `gpt-5.4-mini` | `llm-app-poc-rag-v1` |
| DIV-3 | `71a3bc63-c6ff-403e-9916-6ec1bf068fa9` | 2026-07-06T13:42:07.277Z | `openai` / `gpt-5.4-mini` | `llm-app-poc-rag-v1` |

## Context Composition

### Candidate Pool

| Metric | raw-top-k-v1 | document-diversity-v1 |
|---|---:|---:|
| candidateTopK | 5 | 10 |
| candidateChunkCount | 5 | 10 |
| candidateUniqueDocumentCount | 3 | 5 |
| candidateDocumentChunkCounts | `profile-image-spec`: 3, `error-message-guideline`: 1, `profile-api`: 1 | `profile-image-spec`: 4, `error-message-guideline`: 2, `profile-api`: 2, `storage-lifecycle`: 1, `frontend-cache-guideline`: 1 |

Candidate poolには`storage-lifecycle`と`frontend-cache-guideline`が存在したため、Phase 1-Dのmissing sourceは「candidate Top 10にも存在しない」ではなく、raw Top 5のsame-document chunk concentrationによりfinal context外になっていたと判断できる。

`media-upload-security`はcandidate Top 10にも存在しなかった。これはCandidate source absentであり、`document-diversity-v1`だけでは取得できない。

### Selected Context

| Metric | raw-top-k-v1 | document-diversity-v1 |
|---|---:|---:|
| selectedChunkCount | 5 | 5 |
| uniqueDocumentCount@5 median | 3 | 5 |
| maximumChunksFromSameDocument median | 3 | 1 |
| duplicateSlotCount | 2 | 0 |
| profile-image-spec chunks | 3 | 1 |
| distractor source count | 0 | 0 |
| document set | `profile-image-spec`, `error-message-guideline`, `profile-api` | `profile-image-spec`, `error-message-guideline`, `profile-api`, `storage-lifecycle`, `frontend-cache-guideline` |

Runごとのcompositionは各policy内で3Runとも同一だった。

### Source Ranks

| Policy | contextRank | retrievalRank | score | documentId | chunkId | headingPath |
|---|---:|---:|---:|---|---|---|
| raw | 1 | 1 | 0.7567597 | `profile-image-spec` | `profile-image-spec:heading-aware-v1:0004:59e05d6b7fe8fd6b` | プロフィール画像仕様 > 受け入れ条件 |
| raw | 2 | 2 | 0.66429365 | `profile-image-spec` | `profile-image-spec:heading-aware-v1:0001:62ae1ff85793db9a` | プロフィール画像仕様 > アップロード制約 > サイズと形式 |
| raw | 3 | 3 | 0.6523615 | `profile-image-spec` | `profile-image-spec:heading-aware-v1:0002:d07d100456f5b587` | プロフィール画像仕様 > アップロード制約 > 不正入力 |
| raw | 4 | 4 | 0.64836675 | `error-message-guideline` | `error-message-guideline:heading-aware-v1:0003:6f6c26b767607c79` | エラーメッセージガイドライン > プロフィール画像アップロード > Validation error |
| raw | 5 | 5 | 0.6388708 | `profile-api` | `profile-api:heading-aware-v1:0001:01f2b6aaf5b8539d` | プロフィールAPI仕様 > Endpoint > プロフィール画像アップロード |
| diversity | 1 | 1 | 0.7567597 | `profile-image-spec` | `profile-image-spec:heading-aware-v1:0004:59e05d6b7fe8fd6b` | プロフィール画像仕様 > 受け入れ条件 |
| diversity | 2 | 4 | 0.64836675 | `error-message-guideline` | `error-message-guideline:heading-aware-v1:0003:6f6c26b767607c79` | エラーメッセージガイドライン > プロフィール画像アップロード > Validation error |
| diversity | 3 | 5 | 0.6388708 | `profile-api` | `profile-api:heading-aware-v1:0001:01f2b6aaf5b8539d` | プロフィールAPI仕様 > Endpoint > プロフィール画像アップロード |
| diversity | 4 | 8 | 0.58321583 | `storage-lifecycle` | `storage-lifecycle:heading-aware-v1:0001:6b1a4db53213dd49` | ストレージライフサイクル > 保存と切替 > 新画像保存 |
| diversity | 5 | 10 | 0.5777364 | `frontend-cache-guideline` | `frontend-cache-guideline:heading-aware-v1:0001:cd0c548c35627043` | フロントエンドキャッシュガイドライン > プロフィール画像の即時反映 > 最新URLの利用 |

`document-diversity-v1`では、semantic rank 8と10のsourceがcontext slot 4と5に入った。これはscoreを変更したrerankingではなく、context selection policyによるdiversity-first selectionである。

## Common 5-Axis Evaluation

Phase 1-Dと同じdirect comparison用の5軸で採点した。Phase 1-Dの既存RAG ON raw baseline score 4.6 / 5は変更しない。ここではPhase 1-E formal runs同士を比較する。

| Axis | RAW-1 | RAW-2 | RAW-3 | raw avg | DIV-1 | DIV-2 | DIV-3 | diversity avg | Observation |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| Product-specific rule coverage | 4.6 | 4.6 | 4.5 | 4.6 | 4.8 | 4.7 | 4.7 | 4.7 | diversityは保存成功後切替とno reload/latest URLが安定して増えた。 |
| Unsupported assumption control | 4.5 | 4.5 | 4.5 | 4.5 | 4.4 | 4.4 | 4.4 | 4.4 | diversityでは`Content-Type`等のsource外詳細が一部implementationに出たが、必須仕様化は限定的。 |
| Acceptance criteria specificity | 4.8 | 4.8 | 4.6 | 4.7 | 4.8 | 4.8 | 4.7 | 4.8 | diversityは保存前切替防止やno reload反映をacceptanceへ含めた。 |
| Jira decomposition appropriateness | 4.5 | 4.5 | 4.4 | 4.5 | 4.6 | 4.6 | 4.6 | 4.6 | diversityは保存・切替制御のbackend taskが明確になった。 |
| JSON structure stability | 5.0 | 5.0 | 5.0 | 5.0 | 5.0 | 5.0 | 5.0 | 5.0 | 全Runでschema安定。 |
| Common 5-axis average | 4.7 | 4.7 | 4.6 | 4.7 | 4.7 | 4.7 | 4.7 | 4.7 | 品質は概ね維持。小幅なcoverage改善はあるが大差とは扱わない。 |

## RAG-Specific Axes

| Axis | RAW-1 | RAW-2 | RAW-3 | raw avg | DIV-1 | DIV-2 | DIV-3 | diversity avg | Observation |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| Source-grounded requirement coverage | 4.6 | 4.6 | 4.5 | 4.6 | 4.8 | 4.8 | 4.7 | 4.8 | diversityはselected storage/cache source由来のruleを一部反映した。 |
| Retrieved source appropriateness | 4.2 | 4.2 | 4.2 | 4.2 | 4.8 | 4.8 | 4.7 | 4.8 | rawは関連性は高いが同一document集中。diversityは5文書すべて関連sourceだった。 |

RAG-specific axesはdirect common-axis differenceには含めない。

## Product-Specific Rule Coverage

Classification:

- `explicit`: 明示的に正しく反映。
- `partial`: 関連内容はあるがsource固有ruleとして不完全、またはrisks/review止まり。
- `absent`: 反映なし。
- `unsupported/invented`: source/inputにない条件を断定的仕様として追加。

| Rule | raw-top-k-v1 | document-diversity-v1 | Notes |
|---|---|---|---|
| 5MB | explicit | explicit | 両policyとも全Runで維持。 |
| JPG / PNG | explicit | explicit | 両policyとも全Runで維持。 |
| immediate reflection | explicit | explicit | 両policyともlatest URL反映を記載。 |
| failure error message | explicit | explicit | 両policyともvalidation messageを記載。 |
| latest profile image URL | explicit | explicit | 両policyとも反映。 |
| invalid input handling | explicit | explicit | rawは`profile-image-spec`不正入力chunk、diversityはAPI/error message sourceから補完。 |
| `POST /api/profile/image` | explicit | explicit | 両policyとも反映。 |
| `multipart/form-data` | explicit | explicit | 両policyとも反映。 |
| `image` field | explicit | explicit | 両policyとも反映。 |
| user-facing actionable validation message | explicit | explicit | 両policyとも指定文言を反映。 |
| internal exception detailを直接表示しない | absent | absent | selected chunkはValidation error中心で、内部例外非表示chunkはcontext外。 |
| latest URL / no full page reload | partial | explicit | diversityは`frontend-cache-guideline`のlatest URL chunkを取得し、no reloadが全Runで明確。 |
| cache busting / `profileImageVersion` / ETag | partial | absent | diversityでcache documentは入ったがselected chunkは最新URLで、Cache busting / ETag chunkはcontext外。 |
| extension alone is insufficient | partial | partial | `media-upload-security`はcontext外。画像実体検証は出るが、media security source由来とは扱わない。 |
| actual image validation | explicit | explicit | `profile-image-spec` / `profile-api` / error message sourceから反映。 |
| failed upload cleanup / temporary object cleanup | absent | absent | `storage-lifecycle`は入ったがselected chunkは新画像保存で、cleanup chunkはcontext外。 |
| old image cleanup policy | partial | partial | risksで確認事項として出るRunはあるが、仕様化はされていない。 |
| rollback / switch ordering | absent | explicit | diversityは保存成功後にプロフィール参照先を切り替えるruleを全Runで反映。 |

## Source-To-Generation Analysis

| Rule family | raw source status | diversity source status | Generation result | Failure domain |
|---|---|---|---|---|
| profile image acceptance / size / format | selected x3 | selected x1 | 両policyで5MB/JPG/PNGを維持 | E. Rule correctly generated |
| invalid input / validation messages | selected | selected | 両policyで指定文言と画像実体検証messageを反映 | E. Rule correctly generated |
| profile API contract | selected | selected | endpoint、request形式、`image` fieldを反映 | E. Rule correctly generated |
| latest URL / no reload | partially selected via profile spec | selected via frontend-cache guideline | diversityでno reload表現が安定 | E. Rule correctly generated |
| cache busting / ETag / versioned URL | candidate absent from selected chunks | candidate absent from selected chunks | 出力へほぼ出ない | A. Candidate source absent at selected chunk level |
| storage save-before-switch | source absent | selected | diversityで保存成功後切替を全Runに反映 | E. Rule correctly generated |
| failed upload cleanup / temporary object cleanup | source absent | candidate/source chunk absent | 出力へ出ない | A. Candidate source absent at rule chunk level |
| media upload security | candidate absent | candidate absent | actual validationは別source由来。MIME/metadata/malwareは出ない | A. Candidate source absent |

## Lost-Chunk Trade-Off

`document-diversity-v1`では、raw baselineで入っていた以下の`profile-image-spec` chunksがcontext外になった。

- アップロード制約 > サイズと形式
- アップロード制約 > 不正入力

確認結果:

- 5MB coverageは維持された。
- JPG / PNG coverageは維持された。
- invalid input handlingは維持された。
- acceptance criteria specificityは低下せず、むしろ保存前切替防止やno reload反映が加わった。

理由として、selectedされた`profile-image-spec`の受け入れ条件chunk自体に5MB、JPG/PNG、サイズ超過、形式エラー、latest URLが含まれていたこと、さらに`profile-api`と`error-message-guideline`がvalidation detailsを補ったことが大きい。

ただし、これは今回のsynthetic corpusとqueryに限定した結果であり、どのタスクでもsame-document high-rank chunksを削ってよいとは結論づけない。

## Newly Selected Source Impact

### storage-lifecycle

Selected chunk:

- `storage-lifecycle:heading-aware-v1:0001:6b1a4db53213dd49`
- heading: ストレージライフサイクル > 保存と切替 > 新画像保存

Generated impact:

- DIV-1: 「新しい画像オブジェクトの保存が成功してから、プロフィール参照先を新画像へ切り替える」
- DIV-2: 「保存成功前にプロフィール参照先が切り替わらない」
- DIV-3: 「新しい画像オブジェクトの保存成功後にプロフィール参照先を切り替える」

評価: source selected and rule generated.

### frontend-cache-guideline

Selected chunk:

- `frontend-cache-guideline:heading-aware-v1:0001:cd0c548c35627043`
- heading: フロントエンドキャッシュガイドライン > プロフィール画像の即時反映 > 最新URLの利用

Generated impact:

- 全DIV Runでlatest image URLをクライアント状態へ反映し、ページリロードなしで即時更新する内容が明確。

評価: source selected and rule generated.

ただし、Cache busting / ETag / versioned URLのchunkはselectedされていないため、そのruleはgeneratedとは評価しない。

## media-upload-security Failure Domain

`document-diversity-v1`のcandidateDocumentChunkCountsは以下だった。

```json
{
  "profile-image-spec": 4,
  "error-message-guideline": 2,
  "profile-api": 2,
  "storage-lifecycle": 1,
  "frontend-cache-guideline": 1
}
```

`media-upload-security`はcandidate Top 10に存在しない。したがってfailure domainは **A. Candidate source absent**。

出力には画像実体検証やサーバー側検証が出るが、これは`profile-image-spec`、`profile-api`、`error-message-guideline`由来として扱う。MIME type、metadata削除、malware / virus scanはselected contextにないため、source-grounded generated ruleとは扱わない。

## Unsupported Assumptions

raw / diversityともに、以下を必須仕様として断定する傾向は見られなかった。

- strict 5-second SLA
- drag and drop mandatory
- WebP mandatory
- virus scan mandatory
- specific cloud vendor mandatory
- GDPR mandatory

diversityでは`Content-Type`やフロント側一次チェックがimplementation detailとして出たRunがある。これはsource外またはselected source外の補足であるためunsupported assumption controlを4.4とした。ただし、必須プロダクト要件として強く固定しているわけではなく、risks / review / implementationの範囲に留まる。

## Latency And Usage

clientElapsedMsはhistoryへ保存されないためN/Aとした。

### Run-Level Metadata

| Run | policy | retrievalLatencyMs | providerLatencyMs | serverProcessingMs | inputTokens | outputTokens | totalTokens | embeddingPromptTokens |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| RAW-1 | `raw-top-k-v1` | 2154 | 10938 | 13102 | 1032 | 1339 | 2371 | 72 |
| RAW-2 | `raw-top-k-v1` | 134 | 8785 | 8929 | 1032 | 1351 | 2383 | 72 |
| RAW-3 | `raw-top-k-v1` | 349 | 8926 | 9284 | 1032 | 1274 | 2306 | 72 |
| DIV-1 | `document-diversity-v1` | 772 | 9008 | 9789 | 1032 | 1340 | 2372 | 72 |
| DIV-2 | `document-diversity-v1` | 289 | 8574 | 8870 | 1032 | 1296 | 2328 | 72 |
| DIV-3 | `document-diversity-v1` | 261 | 10564 | 10835 | 1032 | 1392 | 2424 | 72 |

### Median Comparison

| Metric | raw-top-k-v1 median | document-diversity-v1 median |
|---|---:|---:|
| retrievalLatencyMs | 349 | 289 |
| providerLatencyMs | 8926 | 9008 |
| serverProcessingMs | 9284 | 9789 |
| inputTokens | 1032 | 1032 |
| outputTokens | 1339 | 1340 |
| totalTokens | 2371 | 2372 |
| embeddingPromptTokens | 72 | 72 |

Interpretation:

- candidateTopKは5から10へ増えたが、今回の3Run中央値ではretrievalLatencyMsの悪化は観測されなかった。
- inputTokensは同じだった。finalTopKが5のままで、context chunk数も同じため大きく増えなかった。
- providerLatencyMsとserverProcessingMsはほぼ同水準。
- これは3Run、現在のlocal environment、現在のAPI側状況に限定した観測であり、一般化しない。

## Conclusion

Conclusion category: **B. Diversity improves and source coverage improves, quality is roughly maintained**

根拠:

- uniqueDocumentCount@5は3から5へ改善した。
- maximumChunksFromSameDocumentは3から1へ低下した。
- `storage-lifecycle`と`frontend-cache-guideline`が新規にcontext入りした。
- selectedされた新規source由来の「保存成功後に参照先を切り替える」「latest URLをユーザー状態へ反映しページreloadに依存しない」はgenerationへ反映された。
- Common 5-axis averageはraw 4.7、diversity 4.7で、品質低下は観測されなかった。
- RAG-specific axesはraw 4.6 / 4.2からdiversity 4.8 / 4.8へ改善した。
- latency / usageは今回の3Runではほぼ同水準だった。

一方で、`media-upload-security`はcandidate Top 10にも入らず、MIME validation、metadata handling、malware scanなどはsource-groundedには改善しなかった。Storage cleanup / rollbackの詳細も、selectedされたstorage chunkが「新画像保存」だったため、cleanup系ruleは十分に生成されなかった。

## Policy Adoption Decision

Recommendation: `document-diversity-v1` をPhase 1-E後のrecommended context policyとする。

理由:

- raw baselineを削除せず再現可能なまま残せる。
- context diversityが明確に改善した。
- high-rank profile-image chunksの一部を失っても、今回の入力では5MB/JPG/PNG/invalid input coverageを維持した。
- newly selected sourceの一部が実際にgenerationへ反映された。
- common qualityとlatencyに大きな悪化は見られなかった。

ただし、defaultを即座に切り替えるかは、次の実装判断として扱う。Phase 1-EではMMR、reranker、multi-query retrievalなどは追加しない。

## Remaining Issues

- `media-upload-security`がcandidate Top 10に入らないため、security-specific rule coverageは未解決。
- storage documentは入ったが、cleanup / rollback chunkまでは入らなかった。
- candidateTopK=10でもcoverageに限界があるため、今後はquery decomposition、multi-query、MMR、reranking、source coverage budgetなどが候補になる。
- ただしPhase 1では追加実装せず、Context Diversity Improvementまでを区切りとする。
