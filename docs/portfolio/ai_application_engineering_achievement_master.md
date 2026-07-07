# AI Application Engineering Technical Achievement Master

## 1. Executive Summary

このドキュメントは、LLM App PoC Phase 1、RAG PoC Phase 1、AI Agent PoC Phase 1を、媒体別説明へ展開するための技術実績マスターである。最終的なREADME本文、職務経歴書本文、面談回答そのものではなく、実装事実、設計判断、評価結果、失敗領域、キャリア上の接続点を一箇所へ整理する。

中心のストーリーは、同一の開発支援problemを、single LLM application、grounded RAG、bounded Agent workflowへ段階的に発展させたことである。各段階で、問題を定義し、TypeScriptで実装し、評価軸を定義し、actual LLM outputを評価し、failure-domainを分析し、次のarchitectureへ進んだ。

この3 PoCは、単なるサンプルアプリ群ではない。長年のソフトウェア開発、Tech Lead、開発リード、Engineering Management、Scrum / 開発プロセス改善で扱ってきた「曖昧な要件、既存仕様、関係者knowledgeを、実装可能な仕様・受け入れ条件・タスク・計画・レビュー観点へ変換する仕事」を、LLM / RAG / bounded Agent workflowとして設計・実装・評価した技術検証である。

ただし、これは個人技術検証のPoCであり、RAGやAI Agentの商用production運用経験として表現しない。

## 2. Problem Domain

扱ったproblemは、requirement memoを入力として受け取り、開発チームが実装に進みやすい構造化成果物へ変換することである。

入力:

```text
requirement memo
```

出力は共通の`GenerationOutput`で、主なfieldは以下である。

- `summary`
- `spec`
- `acceptanceCriteria`
- `jiraTasks`
- `implementationPlan`
- `reviewPoints`
- `risks`

このproblemを選んだ理由は、ソフトウェア開発の現場で実際に価値があるからである。曖昧な要望を仕様、acceptance criteria、Jira task、実装計画、レビュー観点へ分解する作業は、Tech Leadや開発リードが日常的に担う。LLMの出力品質だけでなく、構造化、grounding、評価、再現性、失敗領域の分離まで含めて検証しやすい題材でもある。

## 3. Evolution Overview

| PoC | Problem | Architecture | Evaluation | Observed limitation | Next architectural response |
|---|---|---|---|---|---|
| LLM App | requirement memoを構造化開発成果物へ変換する | Next.js / React / TypeScript、provider abstraction、structured output、Zod validation、history保存 | mock / OpenAI / Gemini / Anthropicを同一入力・同一schema・同一7軸で比較 | structured generationはできるが、product-specific knowledge groundingが弱い | product knowledgeをretrievalしてcontextへ入れるRAGへ発展 |
| RAG | product knowledgeに基づくgrounded generation | Qdrant local、OpenAI Embeddings、Markdown corpus、chunking、semantic retrieval、RAG OFF / ON、context selection | retrieval metrics、RAG OFF / ON評価、context diversity評価 | retrieval hitだけではTop-K context compositionを制御しきれない。single-pass generationではartifact consistencyやambiguity controlに課題が残る | Planning、Review、bounded Revisionを持つAgent workflowへ発展 |
| AI Agent | single-pass grounded generationとbounded workflowの差を評価する | Planner、Knowledge Retrieval Tool、Draft Generator、Structured Reviewer、deterministic revision decision、bounded Revision、trace | blind manual paired evaluation、retrieval parity、seven-axis rubric、latency/token analysis | Agentは一律default化するほどの優位ではない。consistency改善とcost増加、Reviewer精度課題が同時に観測された | selective use条件を定義し、Phase 1を完了 |

進化の要点:

- LLM App: structured generationはできる。
- LLM App limitation: product-specific ruleや既存仕様のgroundingが弱い。
- RAG: product knowledgeをretrievalし、grounded generationする。
- RAG limitation: context composition、single-pass artifact consistency、ambiguity controlが残る。
- AI Agent: Planning、Knowledge Tool、Draft、Structured Review、deterministic Revision decision、bounded Revisionでworkflow化する。
- Formal evaluation: single-pass grounded generation vs bounded Agent workflowをblind manual paired evaluationで比較し、Agentをdefault pathにしない結論まで出した。

## 4. LLM App PoC Technical Achievement

LLM App PoCでは、requirement memoから`GenerationOutput`を生成する開発支援アプリを実装した。

主な実装:

- Next.js / React / TypeScriptによるUIとAPI
- `POST /api/generate`による生成API
- `GET /api/generations`、`GET /api/generations/:id`による履歴参照API
- Zodによる入力、生成結果、履歴データのvalidation
- `LLM_PROVIDER=mock | openai | gemini | anthropic`によるprovider切り替え
- OpenAI Responses API、Gemini GenerateContent、Claude Messages APIのstructured output対応
- provider差分を吸収し、最終的に共通Zod schemaで検証する構成
- `data/generations.json`へのローカル履歴保存
- `data/sample-generations.json`による公開可能サンプルの分離
- Vitestによるschema/API周辺テスト
- Playwrightによる入力から結果表示までのE2E確認
- provider latency、server processing、client elapsedの分離計測

重要なdesign decision:

- providerごとにstructured outputの指定方法やresponse形状が異なるため、provider abstractionで差分を吸収した。
- 出力は自由文ではなく、共通の`GenerationOutput` schemaに正規化した。
- provider比較は、同一task、同一schema、同一評価軸で行った。
- API key、ローカル履歴、公開サンプルを分離した。

Provider comparison result:

| Provider / Model | Quality score | Median client elapsed | Observed characteristic |
|---|---:|---:|---|
| `mock-local` | 3.4 / 5 | N/A | JSON形状確認、UI/API flow確認に有効 |
| Gemini 2.5 Flash | 4.4 / 5 | 12.2 s | 運用・リスク観点が広い |
| OpenAI `gpt-5.4-mini` | 4.6 / 5 | 7.0 s | Jira分解・実装タスク化と応答時間のバランスが良い |
| Claude Haiku 4.5 | 4.9 / 5 | 11.3 s | 実装準備資料としての網羅性が高い |

この結果は、プロフィール画像変更要件、`llm-app-poc-v1`、現在の`GenerationOutput` schema、各providerの実行時点に限定した観測である。provider企業全体やモデル一般の優劣として扱わない。

Technical learning:

- model selection is workload-specificである。
- 品質だけでなく、latency、token usage、schema安定性、provider実装差分、API key管理まで含めてLLMアプリの設計対象になる。
- 今回の特定タスクでは、Claudeが最高品質、OpenAIが品質と応答時間のバランスに優れた。

## 5. RAG PoC Technical Achievement

RAG PoCでは、LLM Appで見えたproduct-specific grounding不足に対して、synthetic product knowledge corpusをretrievalし、grounded generationへ接続した。

主な実装:

- Qdrant OSS local環境
- OpenAI Embeddings
- `text-embedding-3-small`
- TypeScriptによるloader、chunker、embedding client、Qdrant client、retriever
- synthetic Markdown corpus 8 documents
- `fixed-size-v1` chunking
- `heading-aware-v1` chunking
- retrieval debug API
- ingestion CLI / evaluation CLI
- `Hit@5`、`MRR`、`Source Recall@5`
- `/api/generate`のRAG OFF / ON切り替え
- retrieved context construction
- source metadataの履歴保存とUI表示
- retrieval失敗時のfail-closed制御
- `raw-top-k-v1`、`document-cap-v1`、`document-diversity-v1` context policy

Chunk evaluation:

| Strategy | Hit@5 | MRR | Source Recall@5 |
|---|---:|---:|---:|
| `fixed-size-v1` | 1.000 | 0.854 | 1.000 |
| `heading-aware-v1` | 1.000 | 1.000 | 1.000 |

`heading-aware-v1`はHit@5とSource Recall@5を維持しつつ、MRRを0.854から1.000へ改善した。一方、chunk数とembedding prompt tokensは増えたため、ranking改善とchunk / embedding量増加のtrade-offを確認した。

RAG OFF / ON comparison:

- `openai` / `gpt-5.4-mini`
- `llm-app-poc-rag-v1`
- 同一入力
- 同一`GenerationOutput` schema
- RAG OFF: 3.9 / 5
- RAG ON: 4.6 / 5

RAG ONでは、`POST /api/profile/image`、`multipart/form-data`、`image` field、latest profile image URL、validation messageなどのsource-grounded ruleが増えた。

Context diversity:

| Policy | uniqueDocumentCount@5 | maximumChunksFromSameDocument | Common quality | RAG-specific coverage | Retrieved source appropriateness |
|---|---:|---:|---:|---:|---:|
| `raw-top-k-v1` | 3 | 3 | 4.7 / 5 | 4.6 / 5 | 4.2 / 5 |
| `document-diversity-v1` | 5 | 1 | 4.7 / 5 | 4.8 / 5 | 4.8 / 5 |

`document-diversity-v1`では、candidate Top 10からdiversity-first two-pass selectionを行い、final Top 5へ5文書を選択した。新たに`storage-lifecycle`と`frontend-cache-guideline`がcontext入りし、保存成功後にプロフィール参照先を切り替える、latest URLをユーザー状態へ反映しページreloadに依存しない、などのsource由来ruleがgenerationへ反映された。

RAG negative pilot:

- Initial hypothesis: 同一documentのchunk数を最大2件へ制限すればdocument diversityが改善する可能性がある。
- Policy: `document-cap-v1`
- maximumChunksFromSameDocument: 3 -> 2
- uniqueDocumentCount@5: 3 -> 3
- 結論: chunk concentration controlはできたが、document diversity改善は観測できなかった。

このnegative resultを残したうえで、仮説をtwo-pass diversity-first selectionへ修正した。これは、失敗した実験を消さずに、観測に基づいて次の設計へ進めた点が重要である。

Failure domain:

- `media-upload-security`はcandidate Top 10にも存在せず、Candidate source absentだった。
- selected sourceが存在することと、そのsourceの全ruleがgenerationへ反映されることは同義ではない。
- retrieval hit/rank、Top-K context composition、generation coverageを分けて評価した。

RAG PoC Phase 1は、Retrieval foundation、Chunk strategy evaluation、Grounded generation integration、RAG OFF / ON evaluation、Context diversity improvementまで完了状態として扱う。

## 6. AI Agent PoC Technical Achievement

AI Agent PoCでは、RAGによるsingle-pass grounded generationを、bounded Agent workflowへ発展させた。

このPoCでは、単純なprompt chainをAgentとは呼ばなかった。Agent成立条件として、以下を明示した。

- state
- decision
- tool use
- conditional transition
- bounded loop
- termination
- trace

Workflow:

1. Planner
2. Knowledge Retrieval Tool
3. Draft Generator
4. Structured Reviewer
5. deterministic `decideRevision`
6. Generator revision mode

重要な設計:

- Revisionは4th Agentではない。
- Single model / logical rolesとして扱う。
- `maxRevisionCount = 1`
- Knowledge Retrieval Toolは1 Agent runにつき最大1回。
- Revisionではknowledge resultをreuseする。
- Reviewerはfindingsを返すだけで、workflow decisionはdeterministic codeで行う。
- `major` / `blocker` findingはrevisionをtriggerする。
- `minor` only / no findingはrevisionをtriggerしない。
- Review #2で`major` / `blocker`が残りrevision budget exhaustedの場合は`completed_with_findings`。
- technical / contract failureは`failed`。
- undefined state transitionはrejectする。
- terminal stateから追加transitionできない。

Execution artifact separation:

- `AgentPlan`
- retrieval metadata
- `initialDraft`
- `reviewHistory`
- `revisedOutput`
- `finalOutput`
- trace / metadata

最終成果物である`GenerationOutput`と、Agent workflow内部のexecution artifactsを分離した。これにより、UI表示、履歴、評価、traceを扱いやすくした。

## 7. AI Agent Formal Evaluation

Evaluation design:

- 6 cases
- 16 runs
- Agent OFF: 8
- Agent ON: 8
- AGENT-001は各mode 3 runs
- blind manual scoring
- seven-axis rubric
- sample mapping separated
- retrieval parity gate
- common `evaluationElapsedMs`

Agent OFFはsingle-pass grounded generation、Agent ONはbounded Agent workflowである。この比較はsystem-level workflow comparisonであり、strict single-variable causal ablationではない。

Formal quality result:

| Metric | Agent OFF | Agent ON | Delta |
|---|---:|---:|---:|
| Common 5-axis average | 4.750 | 4.725 | -0.025 |
| Seven-axis average | 4.714 | 4.768 | +0.054 |

Axis result:

| Axis | Agent OFF | Agent ON | Delta |
|---|---:|---:|---:|
| Product-specific rule coverage | 4.375 | 4.375 | 0.000 |
| Unsupported assumption control | 4.750 | 4.875 | +0.125 |
| Acceptance criteria specificity | 4.625 | 4.625 | 0.000 |
| Jira decomposition appropriateness | 5.000 | 4.750 | -0.250 |
| JSON structure stability | 5.000 | 5.000 | 0.000 |
| Cross-field consistency | 4.375 | 5.000 | +0.625 |
| Requirement-to-task traceability | 4.875 | 4.750 | -0.125 |

Paired result:

- Agent ON wins: 2
- Agent OFF wins: 1
- Ties: 5

Retrieval parity:

- exact document parity: 1.000
- exact chunk parity: 1.000

全8 pairで同じselected document sequenceとselected chunk sequenceを使用した。ただし、retrieval parity 1.000はAgent architectureだけが差分を生んだことのstrict causality proofではない。

Agent operational metrics:

| Metric | Value |
|---|---:|
| workflowCompletionRate | 1.000 |
| firstReviewPassRate | 0.750 |
| revisionInvocationRate | 0.250 |
| revisionLimitReachedRate | 0.000 |
| averageLlmStepCount | 3.500 |
| traceCompletenessRate | 1.000 |

Knowledge Tool invocation:

- 1 invocation: 8 Agent ON runs

Reviewer findings:

| Severity | Count |
|---|---:|
| minor | 23 |
| major | 2 |
| blocker | 0 |

| Category | Count |
|---|---:|
| cross_field_consistency | 8 |
| grounding_consistency | 6 |
| requirement_coverage | 6 |
| actionability | 5 |

## 8. Revision Analysis

Revision occurred in:

- AGENT-003
- AGENT-006

AGENT-003:

- Draft: 4.714
- Final: 4.714
- Delta: 0.000

AGENT-003では、Review #1が5MB / JPG / PNG ruleをoriginal requirement memoにないとして削除要求した。一方、そのruleはselected `profile-image-spec` product knowledgeから直接支持されていた。これはReviewer scope relevance policy inconsistency、possible major severity over-calibrationとして扱う。AGENT-003をrevisionによるquality improvement caseとして説明しない。

AGENT-006:

- Draft: 4.571
- Final: 5.000
- Delta: +0.429

AGENT-006では、Initial DraftがCDN関連のcache avoidanceをacceptance criterionとして固定しながら、同時にCDN scopeをunresolvedとして扱っていた。Reviewerのmajor cross-field consistency findingは妥当で、RevisionによりCDN-specific commitmentを弱め、CDN / multi-device scopeを確認事項として残した。material Draft -> Final quality improvementが観測された。

Revision aggregate:

| Metric | Value |
|---|---:|
| revision runs | 2 |
| mean draftToFinalQualityDelta | +0.214 |
| finalQualityRegressionRate | 0 / 2 = 0.000 |

重要なlearning:

- revision invoked != quality improved
- Reviewer-reported finding resolution != independent manual quality improvement
- revision effectivenessを`n=2`から一般化しない

## 9. Cost Analysis

Agent OFF / ON cost comparison:

| Metric | Agent OFF | Agent ON | Observation |
|---|---:|---:|---|
| median evaluationElapsedMs | 8549.5 ms | 15198.5 ms | ON about 1.78x |
| mean provider-reported total LLM tokens | 2344.0 | 7934.5 | ON about 3.39x |
| embedding usage mean | 94.5 | 94.5 | equal |

結論:

- Agent ONは、latencyとLLM token usageが明確に増えた。
- embedding usageは同等だった。
- cost overheadはretrieval expansionではなく、multi-step LLM orchestration側から発生した。
- Agent workflowはdefault pathではなく、選択的に適用すべきである。

## 10. Failure-Domain and Evaluation Discipline

RAG failure-domain:

- candidate source absent != Generator ignored source
- selected source != every rule generated
- retrieval hit/rank != generation coverage
- context diversity improvement != universal RAG improvement

Agent failure-domain:

- Reviewer finding != independent quality ground truth
- revision invoked != quality improved
- revision not invoked != Agent provided no value
- AgentPlan != product truth
- system-level comparison != strict causal ablation
- retrieval parity 1.000 != Agent architecture alone caused the delta
- statistical significanceをclaimしない

Observed Reviewer limitations:

- AGENT-003のReviewer scope relevance inconsistency
- possible major severity over-calibration
- minor finding sensitivity
- possible minor finding redundancy
- structured review artifact language consistency is not guaranteed

Timestamp instrumentation bug:

- formal raw bundle監査で、Agent ON step `startedAt` / `completedAt`が1970年風のISO timestampになる問題を発見した。
- 原因は、elapsed measurement用の`performance.now()`をISO timestamp生成にも使っていたこと。
- 修正では、wall-clock timestampに`Date.now()`、durationにmonotonic timerを使うように分離した。
- 影響範囲はtrace timestamp、Agent run persistence、API response trace metadata、UI表示のtimestampであり、`latencyMs`、`totalAgentLatencyMs`、step order、workflow decision、LLM call、retrieval call、final `GenerationOutput`、quality / elapsed evaluation resultには影響しなかった。

## 11. Final Technical Conclusion

Conclusion Category: B

正確なinterpretation:

Bounded Agent workflowは、common final-output qualityを概ね維持しながら、Cross-field consistencyを明確に改善した。Unsupported assumption controlも小幅に改善した。

一方で、以下も観測された。

- Jira decomposition appropriatenessは小幅低下した。
- Requirement-to-task traceabilityは小幅低下した。
- latencyが増加した。
- LLM token usageが増加した。
- Reviewer scope relevance / severity precisionに課題があった。

したがって、Agent workflowを全requestのdefault pathにする根拠はない。適用に向くのは、以下が重要なcaseである。

- artifact間consistency
- ambiguity control
- reviewable intermediate artifacts
- bounded correction
- complex / high-value workload

## 12. Engineering Skills Demonstrated

この3 PoCで示したengineering capability:

- problem framing
- architecture evolution
- TypeScript full-stack implementation
- provider abstraction
- structured output schema design
- Zod validation
- RAG chunk / retrieval design
- Vector DB integration
- retrieval evaluation
- grounded generation
- context selection design
- negative resultからのhypothesis correction
- explicit state machine
- deterministic workflow policy
- bounded Agent loop
- fail-closed error semantics
- execution trace / observability
- evaluation dataset design
- blind manual evaluation design
- paired comparison
- retrieval parity gate
- latency / token cost analysis
- failure-domain analysis
- instrumentation audit
- security-conscious local/public data separation

単なるtechnology keywordではなく、PoCを通じて「実装、評価、失敗分析、設計修正」を一貫して行った点が実績の中心である。

## 13. Career Experience Connection

このPoCは、RAGやAI Agentのproduction実務経験として表現しない。個人技術検証である。

一方で、既存のsoftware engineering experienceとの連続性は明確である。

既存strength:

- 17年のsoftware development experience
- Android 12年
- iOS 6年
- Kotlin / Java / Swift
- Tech Lead
- 開発リード
- Engineering Management
- Scrum / 開発プロセス改善
- 複雑な既存codeの解析
- 業務logic / 暗黙知の形式知化
- 要件整理
- acceptance criteria整理
- Jira task decomposition
- implementation planning
- review観点整理
- AI-assisted development workflow構築

Career narrative:

これまで人間のTech Lead / 開発リードとして行ってきたdevelopment structuring work、つまり曖昧な要件、既存code / 仕様、関係者knowledgeを、実装可能なspec、acceptance criteria、task、implementation plan、review pointへ変換する仕事を、LLM / RAG / bounded Agent workflowへ再構成して検証した。

このため、位置づけは「AI未経験者の学習成果」ではなく、既存のソフトウェア開発・リード経験をAI-assisted development architectureへ拡張した個人技術検証である。

## 14. Reusable Evidence Table

| Area | Claim | Evidence | Numeric Result | Limitation / Qualifier | Suitable For |
|---|---|---|---|---|---|
| LLM App | 共通schemaで複数providerを比較できる基盤を実装した | `mock | openai | gemini | anthropic`、Zod、history、UI metadata | mock 3.4、Gemini 4.4、OpenAI 4.6、Claude 4.9 | プロフィール画像変更task限定 | GitHub README、職務経歴書、3分説明 |
| LLM App | 品質とlatencyを合わせてmodel selectionを評価した | provider latency / server processing / client elapsedを分離 | OpenAI median client elapsed 7.0s、Claude quality 4.9 | provider/model一般の優劣ではない | 技術面談深掘り |
| RAG | retrieval単体を評価してからgenerationへ統合した | Qdrant、OpenAI Embeddings、chunker、retrieval evaluation | `heading-aware-v1` MRR 1.000、`fixed-size-v1` MRR 0.854 | synthetic corpus限定 | GitHub README、職務経歴書 |
| RAG | RAG ONでsource-grounded rule coverageを改善した | RAG OFF / ON比較 | RAG OFF 3.9、RAG ON 4.6 | 同一input / schema / provider条件限定 | 10分技術説明 |
| RAG | negative pilotを残し仮説修正した | `document-cap-v1` -> `document-diversity-v1` | max concentration 3 -> 2、unique docs 3 -> 3 | cap aloneはdiversity改善せず | 技術面談深掘り |
| RAG | context diversityでsource coverageを改善した | diversity-first two-pass selection | unique docs 3 -> 5、max chunks/doc 3 -> 1、RAG-specific 4.6 -> 4.8 / 4.2 -> 4.8 | `media-upload-security`はcandidate absent | GitHub README、10分技術説明 |
| Agent | prompt chainではなくbounded workflowとして設計した | state、decision、tool use、conditional transition、bounded loop、termination、trace | workflowCompletionRate 1.000、traceCompletenessRate 1.000 | autonomous agentやmulti-agent systemとは表現しない | 職務経歴書、技術面談 |
| Agent | blind manual paired evaluationを実施した | 6 cases、16 runs、OFF 8、ON 8、sample mapping separated | common 5-axis 4.750 -> 4.725、seven-axis 4.714 -> 4.768 | strict causal ablationではない | 技術面談深掘り |
| Agent | Cross-field consistencyを改善した | seven-axis manual scoring | 4.375 -> 5.000、delta +0.625 | Jira decompositionとtraceabilityは小幅低下 | README、面談説明 |
| Agent | revision効果を慎重に分析した | AGENT-003 / AGENT-006 draft-final analysis | AGENT-006 +0.429、AGENT-003 0.000 | `n=2`で一般化しない | 技術面談深掘り |
| Agent | cost trade-offを定量化した | evaluationElapsedMs、LLM token usage、embedding usage | elapsed ~1.78x、LLM tokens ~3.39x、embedding equal | costはmulti-step LLM orchestration由来 | 10分技術説明 |
| Evaluation | failure-domainを分けて扱った | RAG source absent、Reviewer finding、revision invocationなどを区別 | qualitative discipline | 統計的有意性はclaimしない | 技術面談深掘り |

## 15. Claims to Avoid

避ける表現と正確な代替表現:

| Avoid | Use instead |
|---|---|
| RAG production experienceがある | 個人PoCとして、Qdrant + OpenAI EmbeddingsによるRAG retrieval / grounded generationを設計・実装・評価した |
| AI Agent production experienceがある | 個人PoCとして、bounded Agent workflowを設計・実装し、formal evaluationを行った |
| Agent broadly improves quality | 今回の特定PoCではcommon qualityを概ね維持し、Cross-field consistencyを改善した |
| Revision always improves quality | AGENT-006では改善したが、AGENT-003ではmanual score改善はなかった |
| statistically significant | small PoC datasetにおける観測結果 |
| Agent architecture alone caused the delta | retrieval parityを確保したsystem-level workflow comparisonで差分を観測した |
| model X is universally best | 今回の特定task / schema / evaluation axisではmodel Xが高評価だった |
| document-diversity-v1 is universally optimal | 今回のsynthetic corpus / query / Top-K条件ではsource diversityとcoverageが改善した |
| multi-agent systemを実装した | single model / logical rolesによるbounded Agent workflowを実装した |
| autonomous Agentを構築した | deterministic policyとbounded revisionを持つreviewable workflowを実装した |
| ChatGPT APIを使ったサンプルアプリを作った | 開発支援problemをLLM App、RAG、bounded Agent workflowへ段階的に発展させ、評価した |
| RAGを試した | retrieval、chunk strategy、grounded generation、context selection、failure-domainを実装・評価した |
| AI Agentを試した | Agent成立条件を定義し、state machine、tool use、review、bounded revision、trace、formal evaluationを実装した |

## Source-of-Truth Notes

主な参照資料:

- `docs/llm_app_poc/evaluation_results.md`
- `docs/llm_app_poc/latency_evaluation.md`
- `docs/llm_app_poc/portfolio_summary.md`
- `docs/rag_poc/portfolio_summary.md`
- `docs/rag_poc/context_diversity_evaluation.md`
- `docs/rag_poc/grounded_generation_evaluation_results.md`
- `docs/agent_poc/phase_1_e_agent_workflow_evaluation_results.md`
- `lib/rag/`
- `lib/agent/`
- `data/rag/knowledge/`

主なcommit:

- `f8fc561 Add RAG retrieval foundation and chunk evaluation`
- `8995c5c Add RAG grounded generation integration`
- `b1d2708 Complete RAG grounded generation evaluation`
- `cbdcfe2 Complete RAG context diversity evaluation`
- `2ab4f0e Document AI agent workflow and evaluation design`
- `75bf652 Implement agent workflow runtime foundation`
- `304a02a Integrate agent planning retrieval and draft generation`
- `b7be048 Complete agent review revision and UI integration`
- `de2644c Add agent workflow evaluation foundation`
- `b33b476 Complete agent workflow formal evaluation`

Security / public positioning:

- API keyは含めない。
- auth header valueは含めない。
- hidden chain-of-thoughtは含めない。
- raw provider request / responseは含めない。
- embedding vectorは含めない。
- private company confidential informationは含めない。
- synthetic PoC dataとpublic-safe technical factのみを使用する。
