# RAG PoC Grounded Generation Evaluation Results

## Purpose

RAG PoC Phase 1-Dでは、Phase 1-Cで実装したRAG OFF / ON切り替えを、同一入力、同一provider/model、同一promptVersion、同一GenerationOutput schemaで比較した。

この評価は、synthetic corpus、特定入力、`llm-app-poc-rag-v1`、`openai` / `gpt-5.4-mini`、`heading-aware-v1` / Top 5、現在のQdrant local collectionに限定したPoC観測である。provider企業全体、model一般、RAG一般の優劣として扱わない。

追加の外部API呼び出しやQdrant queryは行わず、既存の`data/generations.json`に保存済みの履歴とRAG metadataだけを使用した。

## Evaluation Conditions

| Item | Value |
|---|---|
| Provider | `openai` |
| Model | `gpt-5.4-mini` |
| Prompt version | `llm-app-poc-rag-v1` |
| Generation schema | existing `GenerationOutput` |
| Requirement input | プロフィール画像変更要件 |
| RAG strategy | `heading-aware-v1` |
| Top K | 5 |
| Embedding model | `text-embedding-3-small` |

Input:

```text
ユーザーがプロフィール画像を変更できるようにしたい。
画像は5MBまで、jpg/png対応。
変更後は即時反映したい。
失敗時にはエラーメッセージを表示したい。
```

## Selected Runs

既存Phase 1-C smoke test履歴は、provider/model/promptVersion/input条件が一致しているためRun 1として採用した。

### RAG OFF

| Run | History ID | createdAt | provider/model | promptVersion | rag |
|---|---|---|---|---|---|
| OFF-1 | `976ee398-4bc3-4b28-bde9-07f76e66e847` | 2026-07-06T04:52:22.740Z | `openai` / `gpt-5.4-mini` | `llm-app-poc-rag-v1` | `off` |
| OFF-2 | `7de44bbe-b55d-412b-a92d-77e5ea8e81f0` | 2026-07-06T05:17:46.280Z | `openai` / `gpt-5.4-mini` | `llm-app-poc-rag-v1` | `off` |
| OFF-3 | `d355e62a-79ed-4386-8795-b76e61d3705a` | 2026-07-06T05:17:58.941Z | `openai` / `gpt-5.4-mini` | `llm-app-poc-rag-v1` | `off` |

### RAG ON

| Run | History ID | createdAt | provider/model | promptVersion | rag |
|---|---|---|---|---|---|
| ON-1 | `b880dcd7-d3b4-43c0-9c18-348c2d182e4b` | 2026-07-06T05:02:07.041Z | `openai` / `gpt-5.4-mini` | `llm-app-poc-rag-v1` | `on` |
| ON-2 | `33329945-a3b4-4f21-83b5-473d05c28dfe` | 2026-07-06T05:16:43.143Z | `openai` / `gpt-5.4-mini` | `llm-app-poc-rag-v1` | `on` |
| ON-3 | `8cf78070-42a5-4d40-b925-a7b4cd0a04a5` | 2026-07-06T05:17:06.682Z | `openai` / `gpt-5.4-mini` | `llm-app-poc-rag-v1` | `on` |

All RAG ON runs used `heading-aware-v1`, Top 5, and `text-embedding-3-small`.

## Scoring Method

各Runを以下の7軸で5段階評価した。

1. Source-grounded requirement coverage
2. Product-specific rule coverage
3. Unsupported assumption control
4. Retrieved source appropriateness
5. Acceptance criteria specificity
6. Jira decomposition appropriateness
7. JSON structure stability

RAG OFFではretrieved sourceが存在しないため、`Retrieved source appropriateness`はN/Aとする。

直接比較の主指標は、両modeに同じ意味で適用できる以下5軸の平均とする。

- Product-specific rule coverage
- Unsupported assumption control
- Acceptance criteria specificity
- Jira decomposition appropriateness
- JSON structure stability

`Source-grounded requirement coverage`と`Retrieved source appropriateness`はRAG-specific axesとして別枠で扱い、RAG OFF / ONのdirect score differenceには含めない。

既存のRAG OFF 3.7 / RAG ON 4.6は、mode-specific composite scoreとして残す。定義は「各modeに適用可能として評価した軸の平均」であり、OFF / ONで評価軸数または意味が完全には同一ではない。したがって、直接的な改善幅の主指標には使用しない。RAG OFFの`Source-grounded requirement coverage`スコアは、既存mode-specific compositeを保持するための入力要件coverage寄りのproxyとして残すが、RAG-specific comparisonではN/Aとして扱う。

## Run-Level Scores

### RAG OFF

| Axis | OFF-1 | OFF-2 | OFF-3 | Average | Observation |
|---|---:|---:|---:|---:|---|
| Source-grounded requirement coverage | 2.5 | 3.0 | 3.0 | 2.8 | 入力要件は網羅するが、source-groundedではない。 |
| Product-specific rule coverage | 2.5 | 3.0 | 3.0 | 2.8 | API契約や固有error codeはほぼ出ない。一般知識でserver validation等を補うRunはある。 |
| Unsupported assumption control | 4.2 | 4.2 | 4.0 | 4.1 | 必須仕様として大きなunsupported条件は少ない。保存先や詳細はrisksへ逃がしている。 |
| Retrieved source appropriateness | N/A | N/A | N/A | N/A | RAG OFFのため対象外。 |
| Acceptance criteria specificity | 3.6 | 4.0 | 3.8 | 3.8 | 入力要件の検証条件は具体的だが、API契約やerror codeまでは弱い。 |
| Jira decomposition appropriateness | 3.5 | 3.8 | 3.8 | 3.7 | frontend/backend/test/docsへ分かれるが、product-specific backend taskは抽象的。 |
| JSON structure stability | 5.0 | 5.0 | 5.0 | 5.0 | 全Runでschema安定。 |
| Mode-specific composite | 3.6 | 3.8 | 3.8 | 3.7 | Source-grounded requirement coverageを含む6軸平均。direct comparisonの主指標ではない。 |
| Common 5-axis average | 3.8 | 4.0 | 3.9 | 3.9 | 両modeに同じ意味で適用できる5軸平均。 |

### RAG ON

| Axis | ON-1 | ON-2 | ON-3 | Average | Observation |
|---|---:|---:|---:|---:|---|
| Source-grounded requirement coverage | 4.7 | 4.7 | 4.3 | 4.6 | retrieved sourceに含まれるAPI契約、サイズ/形式、latest URL、validation errorが出力へ反映された。 |
| Product-specific rule coverage | 4.6 | 4.6 | 4.4 | 4.5 | `POST /api/profile/image`、`multipart/form-data`、`image` field等が安定して反映された。cache/security/lifecycle系はsource未取得により限定的。 |
| Unsupported assumption control | 4.5 | 4.4 | 4.5 | 4.5 | `.jpeg`やログイン中ユーザーはsource由来。大きなunsupported mandatory requirementは見られない。 |
| Retrieved source appropriateness | 4.2 | 4.2 | 4.2 | 4.2 | distractorはないが、Top 5中3件が`profile-image-spec`でcontext diversityに制限。 |
| Acceptance criteria specificity | 4.8 | 4.8 | 4.5 | 4.7 | endpoint、request形式、エラー種別、latest URL反映まで検証可能。 |
| Jira decomposition appropriateness | 4.5 | 4.6 | 4.3 | 4.5 | API接続、検証ロジック、エラー表示、テストへ分解できている。 |
| JSON structure stability | 5.0 | 5.0 | 5.0 | 5.0 | 全Runでschema安定。 |
| Mode-specific composite | 4.6 | 4.6 | 4.5 | 4.6 | 7軸平均。direct comparisonの主指標ではない。 |
| Common 5-axis average | 4.7 | 4.7 | 4.5 | 4.6 | 両modeに同じ意味で適用できる5軸平均。 |

## Common-Axis Direct Comparison

| Axis | RAG OFF | RAG ON | Observation |
|---|---:|---:|---|
| Product-specific rule coverage | 2.8 | 4.5 | RAG ONはAPI契約、request形式、field名、latest URL、validation messageなどのproduct-specific factsが増加した。 |
| Unsupported assumption control | 4.1 | 4.5 | RAG ONでも大きなunsupported mandatory requirementは見られない。 |
| Acceptance criteria specificity | 3.8 | 4.7 | RAG ONはendpoint/request/error条件まで検証可能になった。 |
| Jira decomposition appropriateness | 3.7 | 4.5 | RAG ONはAPI連携・検証ロジックがtaskへ分解された。 |
| JSON structure stability | 5.0 | 5.0 | OFF/ONともschemaは安定した。 |
| Common 5-axis average | 3.9 | 4.6 | Direct comparisonの主指標。 |

## RAG-Specific Evaluation

| RAG-specific axis | RAG OFF | RAG ON | Observation |
|---|---:|---:|---|
| Source-grounded requirement coverage | N/A | 4.6 | RAG ONはretrieved source由来のAPI契約やvalidation条件を反映した。 |
| Retrieved source appropriateness | N/A | 4.2 | relevanceは高いがsame-document duplicate chunksによりcontext diversityは限定的。 |

RAG-specific axesはRAG OFF / ONのdirect score differenceへ含めない。

## Mode-Specific Composite

| Axis | RAG OFF Avg | RAG ON Avg | Observation |
|---|---:|---:|---|
| Source-grounded requirement coverage | 2.8 | 4.6 | RAG ONはretrieved source由来のAPI契約やvalidation条件を反映した。 |
| Product-specific rule coverage | 2.8 | 4.5 | RAG OFFは一般論中心、RAG ONはproduct-specific factsが増加。 |
| Unsupported assumption control | 4.1 | 4.5 | RAG ONでも大きなunsupported mandatory requirementは見られない。 |
| Retrieved source appropriateness | N/A | 4.2 | relevanceは高いがsame-document duplicate chunksによりdiversityは限定的。 |
| Acceptance criteria specificity | 3.8 | 4.7 | RAG ONはendpoint/request/error条件まで検証可能。 |
| Jira decomposition appropriateness | 3.7 | 4.5 | RAG ONはAPI連携・検証ロジックがtaskへ分解された。 |
| JSON structure stability | 5.0 | 5.0 | OFF/ONとも安定。 |
| Mode-specific composite | 3.7 | 4.6 | OFFは6軸平均、ONは7軸平均。異なる適用軸を含むためdirect improvement metricではない。 |

## Product-Specific Rule Coverage

Classification:

- `explicit`: 明示的に正しく反映。
- `partial`: 関連内容はあるがcorpus固有ruleとして不完全、またはRAG OFFの一般知識由来。
- `absent`: 反映なし。
- `unsupported/invented`: source/inputにない条件を断定的仕様として追加。

| Rule | OFF-1 | OFF-2 | OFF-3 | ON-1 | ON-2 | ON-3 |
|---|---|---|---|---|---|---|
| 5MB | explicit | explicit | explicit | explicit | explicit | explicit |
| JPG / PNG | explicit | explicit | explicit | explicit | explicit | explicit |
| immediate reflection | explicit | explicit | explicit | explicit | explicit | explicit |
| failure error message | explicit | explicit | explicit | explicit | explicit | explicit |
| `POST /api/profile/image` | absent | absent | absent | explicit | explicit | explicit |
| `multipart/form-data` | absent | absent | absent | explicit | explicit | explicit |
| `image` field | absent | absent | absent | explicit | explicit | explicit |
| latest profile image URL | partial | partial | absent | explicit | explicit | explicit |
| extension alone is not sufficient | absent | partial | partial | explicit | explicit | explicit |
| server-side / actual image validation | partial | absent | partial | explicit | explicit | explicit |
| `unsupported_format` | absent | absent | absent | partial | partial | partial |
| `file_too_large` | absent | absent | absent | partial | partial | partial |
| user-facing actionable validation message | partial | partial | partial | explicit | explicit | partial |
| internal exception detailを直接表示しない | absent | absent | absent | absent | absent | absent |
| cache busting / ETag / versioned URL | absent | partial | partial | partial | partial | absent |
| failed upload cleanup | absent | absent | absent | absent | absent | absent |
| old image cleanup policy | absent | absent | partial | absent | absent | absent |
| rollback consideration | absent | absent | absent | absent | absent | absent |

RAG OFFが一般知識によりserver validationやcacheを示唆した箇所はあるが、retrieved sourceに基づくgroundingとは扱わない。

## RAG ON Source-to-Generation Coverage

Top 5 retrieved sourcesは3Runで同一だった。

| Rank | Source ID | documentId | headingPath |
|---:|---|---|---|
| 1 | S1 | `profile-image-spec` | プロフィール画像仕様 > 受け入れ条件 |
| 2 | S2 | `profile-image-spec` | プロフィール画像仕様 > アップロード制約 > サイズと形式 |
| 3 | S3 | `profile-image-spec` | プロフィール画像仕様 > アップロード制約 > 不正入力 |
| 4 | S4 | `error-message-guideline` | エラーメッセージガイドライン > プロフィール画像アップロード > Validation error |
| 5 | S5 | `profile-api` | プロフィールAPI仕様 > Endpoint > プロフィール画像アップロード |

| Rule family | Source status | Generation status | Failure domain |
|---|---|---|---|
| 5MB / JPG / PNG / latest profile image URL / invalid input | `profile-image-spec` retrieved | 全Runで反映 | D. Rule correctly generated |
| `POST /api/profile/image` / `multipart/form-data` / `image` field | `profile-api` endpoint chunk retrieved | 全Runで反映 | D. Rule correctly generated |
| validation message | `error-message-guideline` validation chunk retrieved | ON-2/ON-1は具体文言、ON-3は種別中心 | C-D. Rule partially/correctly generated |
| internal exception detailを直接表示しない | relevant section not retrieved | 出力なし | A. Source not retrieved |
| cache busting / ETag / versioned URL | `frontend-cache-guideline` not retrieved | ON-2はriskで確認、ON-1/ON-3は弱い | A/C. Source not retrieved / partial |
| extensionだけを信頼しない / actual content validation | `media-upload-security` not retrieved。ただし`profile-image-spec`にserver-side validationあり | 全Runでserver-side image validationとして反映 | D for retrieved spec, A for security-specific details |
| failed upload cleanup / old image cleanup / rollback | `storage-lifecycle` not retrieved | 出力なし | A. Source not retrieved |

この結果では、sourceがretrievedされたruleは概ねgenerationへ反映された。一方、Top 5に含まれないcache/security/lifecycle系の詳細は、generationへほぼ反映されなかった。主な制約はgenerationがsourceを無視したことではなく、current Top-K context compositionにより必要sourceが入らなかったことにある。

## Top-K Context Composition

| Run | uniqueDocumentCount@5 | max chunks from same document | `profile-image-spec` chunks | distractor source count |
|---|---:|---:|---:|---:|
| ON-1 | 3 | 3 | 3 | 0 |
| ON-2 | 3 | 3 | 3 | 0 |
| ON-3 | 3 | 3 | 3 | 0 |

`notification-settings-spec`と`search-filter-spec`はTop 5へ入っていないため、distractor contaminationは観測されなかった。一方、`profile-image-spec`がTop 5中3slotを占有し、`frontend-cache-guideline`、`media-upload-security`、`storage-lifecycle`は含まれなかった。

same-document duplicate chunksは常に悪いとは限らない。今回の`profile-image-spec`複数sectionは、受け入れ条件、サイズ/形式、不正入力をそれぞれ補強し、RAG ON出力の5MB、JPG/PNG、latest URL、error handlingの具体性に寄与した。一方で、3slot消費によりcache busting、security-specific actual content validation、storage cleanup / rollbackのsourceがcontextから外れ、これらのrule coverageが弱くなった。

Phase 1-A / 1-BのHit@5、MRR、Source Recall@5はretrieval sourceの到達性やfirst relevant rankを見るには有効だったが、Top-K context diversityやdocument slot占有は直接表せなかった。Phase 1-Dではこの観測をcontext composition issueとして扱う。

## Unsupported Assumption Analysis

RAG OFF / ONとも、5秒以内、drag and drop必須、WebP対応必須、specific cloud storage必須、GDPR対応必須など、inputまたはretrieved sourceにない条件を必須仕様として追加する傾向は見られなかった。

RAG ONの`.jpeg`受付やログイン中ユーザーは、retrieved sourceに含まれるためunsupportedとは扱わない。malware scan / virus scanは今回の出力には必須仕様として出ていない。cacheや保存先に関する記述は主にrisk / confirmation itemとして扱われており、invented mandatory requirementとは判断しない。

## Latency and Usage

client elapsedはserver historyへ保存されないため、smoke test Run 1以外はN/Aとした。推定値は使わない。

### Run-Level Metadata

| Run | providerLatencyMs | serverProcessingMs | clientElapsed | inputTokens | outputTokens | totalTokens | retrievalLatencyMs | embeddingTokens |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| OFF-1 | 7356 | 7365 | 8.3 s | 475 | 865 | 1340 | N/A | N/A |
| OFF-2 | 7970 | 7976 | N/A | 475 | 950 | 1425 | N/A | N/A |
| OFF-3 | 6307 | 6315 | N/A | 475 | 914 | 1389 | N/A | N/A |
| ON-1 | 8887 | 9547 | 10.1 s | 1032 | 1277 | 2309 | 651 | 72 |
| ON-2 | 8774 | 10025 | N/A | 1032 | 1474 | 2506 | 1241 | 72 |
| ON-3 | 7269 | 8081 | N/A | 1032 | 1192 | 2224 | 804 | 72 |

### Median Comparison

| Metric | RAG OFF median | RAG ON median |
|---|---:|---:|
| Provider latency | 7356 ms | 8774 ms |
| Server processing | 7365 ms | 9547 ms |
| Input tokens | 475 | 1032 |
| Output tokens | 914 | 1277 |
| Total tokens | 1389 | 2309 |
| Retrieval latency | N/A | 804 ms |
| Embedding tokens | N/A | 72 |

RAG ONではretrieved context注入によりinput tokensが475から1032へ増え、output tokensも914から1277へ増えた。provider latency medianは約1.4秒増、server processing medianは約2.2秒増だった。retrieval latency medianは約0.8秒であり、server processing増分の一部を説明するが、総時間差の全てをretrieval overheadだけで説明することはできない。context増加に伴うprovider処理時間と出力長の増加も影響している可能性がある。

これは3Runのみ、現在のlocal network / API側状況に限定した観測である。

## Phase 1-D Conclusion

結論カテゴリ: **B. RAG ON improves product-specific facts but context diversity limits coverage**

RAG ONは、RAG OFFに比べてAPI契約、request形式、field名、latest profile image URL、validation messageなどのproduct-specific factsを明確に改善した。retrievedされたsource由来ruleは概ねgenerationへ反映され、JSON schemaも安定していた。

一方で、current raw semantic Top-K baselineではTop 5中3件が`profile-image-spec`由来となり、cache/security/lifecycle系documentがcontextに入らなかった。そのため、cache busting / ETag、failed upload cleanup、old image cleanup、rollbackなどのcorpus固有ruleはRAG ONでも十分に反映されなかった。

今回の結果は、retrievalそのものが完全に失敗したのではなく、Top-K context compositionのdocument diversityに制約があることを示す。RAG ONは有効だが、context diversityを改善する余地がある。

## Improvement Candidates

まだ実装しない。Phase 1-D結果から見た優先候補:

1. **Per-document chunk cap / document-level diversity constraint**
   - Top 5のうち同一documentが3slotを占有したため、まず小さな変更でdocument diversityを確保できるか検討する。
   - Phase 1-Eのsmoke testでは、`document-cap-v1`によりmaximumChunksFromSameDocumentは3から2へ下がったが、uniqueDocumentCount@5は3のままだった。negative resultとして記録し、次のrefined candidateとして`document-diversity-v1`を検証する。評価テンプレートは `docs/rag_poc/context_diversity_evaluation.md` を参照する。
   - Phase 1-E formal evaluationでは、`document-diversity-v1`によりuniqueDocumentCount@5は3から5、maximumChunksFromSameDocumentは3から1へ改善した。Common 5-axis averageはraw 4.7、document-diversity 4.7で、品質は概ね維持された。詳細は `docs/rag_poc/context_diversity_evaluation.md` を参照する。
2. **Document deduplication after retrieval**
   - chunk単位retrievalは維持しつつ、context assembly時にdocument単位で代表chunkを選ぶ案。
3. **TopK increase with context budget**
   - source coverageを増やせる可能性があるが、input tokensとlatencyが増えるためbudget設計が必要。
4. **MMR**
   - diversityを明示的に扱えるが、baselineからの変更量が大きいため小さい変更の後に検討する。
5. **Reranking**
   - ranking品質を改善できる可能性はあるが、まずはcontext diversityの小変更後に検討する。
6. **Query decomposition / multi-query retrieval**
   - 複数観点のsource coverageを増やせる可能性がある。今回のsmall corpusでは最初から導入せず、document diversity改善後の候補とする。
7. **Grounding prompt improvement**
   - sourceがretrievedされているのに反映されない場合に有効。今回はsource not retrievedが主因のため優先度は低め。

## Remaining Issues

- Top-K context diversityをPhase 1-Aのmetricだけでは把握できない。
- retrieved sourceごとのcoverageを評価する補助metricが必要。
- RAG ONのinput/output token増加に伴うlatency/cost影響を継続観測する必要がある。
- client elapsedはserver historyへ保存されないため、Phase 1-Dではsmoke test以外N/Aとなった。
