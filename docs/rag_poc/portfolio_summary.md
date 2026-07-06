# RAG PoC Portfolio Summary

## Summary

RAG PoC Phase 1-A / 1-Bでは、既存のLLM生成へRAGを統合する前に、retrieval単体を実装・評価した。Docker上のlocal Qdrantにsynthetic Markdown corpusをingestし、OpenAI Embeddingsでvector化したchunkをpayload metadata付きで保存した。

実装範囲:

- Docker ComposeによるQdrant local環境
- synthetic Markdown corpus 8 documents
- Markdown loader
- `fixed-size-v1` chunker
- `heading-aware-v1` chunker
- OpenAI Embeddings client
- Qdrant collection / point / payload設計
- semantic retrieval
- retrieval debug API
- ingestion CLI
- retrieval evaluation CLI
- Hit@5 / MRR / Source Recall@5
- `/api/generate`のRAG OFF / ON切り替え
- retrieved context construction
- source metadataの履歴保存とUI表示
- retrieval失敗時のfail-closed制御

## Evaluation

同一corpus、同一evaluation cases、`text-embedding-3-small`、topK=5で、`fixed-size-v1`と`heading-aware-v1`を比較した。

| Strategy | Hit@5 | MRR | Source Recall@5 |
|---|---:|---:|---:|
| `fixed-size-v1` | 1.000 | 0.854 | 1.000 |
| `heading-aware-v1` | 1.000 | 1.000 | 1.000 |

`heading-aware-v1`はHit@5とSource Recall@5を維持しながら、MRRを0.854から1.000へ改善した。一方で、chunk数は8から41へ増え、embedding prompt tokensは3255から4428へ増えた。ranking改善とchunk / embedding量増加のtrade-offを確認したうえで、Phase 1-Cのgrounded generationでは`heading-aware-v1`を採用する方針とした。

Phase 1-Cでは、この選定済みretrieval設定を既存generation flowへ接続した。RAG OFFではretrieverを呼ばず、RAG ONでは`heading-aware-v1` / Top 5の取得sourceをcontextとして注入する。retrieval失敗や有効chunk 0件ではgeneration providerを呼ばない設計にし、retrieval failureとgeneration failureを切り分けられるようにした。

Phase 1-Dでは、`openai` / `gpt-5.4-mini`、`llm-app-poc-rag-v1`、同一入力、同一schemaでRAG OFF / ONを各3Run比較した。Direct comparisonでは両modeに共通して適用できる5軸を使い、RAG OFFは3.9 / 5、RAG ONは4.6 / 5だった。RAG ONでは`POST /api/profile/image`、`multipart/form-data`、`image` field、latest profile image URL、validation messageなどのsource-grounded ruleが増えた。RAG-specific grounding axesは別枠で評価し、source coverageとgeneration coverageを対応付けてfailure domainを分離した。

一方で、RAG ONのTop 5は3Runとも`profile-image-spec`が3slot、`error-message-guideline`が1slot、`profile-api`が1slotで、uniqueDocumentCount@5は3だった。無関係なdistractorは入らなかったが、same-document duplicate chunksにより`frontend-cache-guideline`、`media-upload-security`、`storage-lifecycle`はcontextから外れた。これにより、retrieval hit/rankだけでなくTop-K context compositionとgeneration coverageを分けて評価する必要があることを確認した。

Phase 1-Eでは、retrieval baseline自体は維持したまま、generation contextへ採用するchunk selection policyを分離した。`raw-top-k-v1`はsemantic Top 5をそのまま使用し、`document-cap-v1`はsemantic Top 10候補から同一document最大2 chunksで最大5件を選ぶ。smoke testでは`document-cap-v1`によりmaximumChunksFromSameDocumentは3から2へ下がったが、uniqueDocumentCount@5は3のままだったため、negative resultとして記録した。

その後、各documentの最初のchunkを優先する`document-diversity-v1`を追加し、candidate pool compositionとselected context compositionを分離して評価した。formal evaluationではuniqueDocumentCount@5が3から5へ改善し、maximumChunksFromSameDocumentは3から1へ低下した。Common 5-axis averageはraw 4.7、document-diversity 4.7で品質は概ね維持され、storage save-before-switchやlatest URL/no reloadなど新規selected source由来のruleがgenerationへ反映された。一方、`media-upload-security`はcandidate Top 10にも入らず、security-specific rule coverageは未解決として残した。

Phase 1-A Retrieval foundation、Phase 1-B Chunk strategy evaluation、Phase 1-C Grounded generation integration、Phase 1-D RAG OFF / ON evaluation、Phase 1-E Context diversity improvementまで完了したため、RAG PoC Phase 1は完了状態として扱う。今後の候補はMMR、reranking、hybrid retrieval、query decomposition、multi-query retrievalなどだが、Phase 1では未実装であり、今回の完了範囲には含めない。

この結果はsynthetic small corpusと特定PoC条件に限定される。production benchmarkやQdrant性能一般の評価とは扱わない。
