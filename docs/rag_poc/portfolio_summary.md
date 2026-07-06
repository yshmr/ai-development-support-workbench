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

## Evaluation

同一corpus、同一evaluation cases、`text-embedding-3-small`、topK=5で、`fixed-size-v1`と`heading-aware-v1`を比較した。

| Strategy | Hit@5 | MRR | Source Recall@5 |
|---|---:|---:|---:|
| `fixed-size-v1` | 1.000 | 0.854 | 1.000 |
| `heading-aware-v1` | 1.000 | 1.000 | 1.000 |

`heading-aware-v1`はHit@5とSource Recall@5を維持しながら、MRRを0.854から1.000へ改善した。一方で、chunk数は8から41へ増え、embedding prompt tokensは3255から4428へ増えた。ranking改善とchunk / embedding量増加のtrade-offを確認したうえで、Phase 1-Cのgrounded generationでは`heading-aware-v1`を採用する方針とした。

この結果はsynthetic small corpusと特定PoC条件に限定される。production benchmarkやQdrant性能一般の評価とは扱わない。
