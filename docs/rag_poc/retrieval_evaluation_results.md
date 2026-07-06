# RAG PoC Retrieval Evaluation Results

## 1. Purpose

RAG PoC Phase 1-A / 1-Bでは、既存 `/api/generate` へRAG contextを統合する前に、retrieval単体の品質を評価した。評価対象はsynthetic Markdown corpusをQdrantへingestし、同一evaluation casesで`fixed-size-v1`と`heading-aware-v1`を比較することである。

この結果は、provider企業全体、embedding model一般、Qdrant性能一般の優劣を示すものではない。synthetic 8-document corpus、8 evaluation cases、`text-embedding-3-small`、topK=5、現在のchunk設定に限定されたPoC結果として扱う。

## 2. Environment

| Item | Value |
|---|---|
| Runtime | 通常のローカルPowerShell |
| Vector DB | Qdrant Docker local |
| Qdrant URL | `http://localhost:6333` |
| Embedding model | `text-embedding-3-small` |
| Retrieval topK | 5 |
| Corpus | synthetic Markdown 8 documents |
| Evaluation cases | 8 cases |

APIキー、embedding vector、Qdrant local storageは公開資料へ含めない。

## 3. Ingestion Results

| Strategy | Documents | Chunks | Embedding model | Vector dimension | Collection | Upserted points | Prompt tokens | Total tokens |
|---|---:|---:|---|---:|---|---:|---:|---:|
| `fixed-size-v1` | 8 | 8 | `text-embedding-3-small` | 1536 | `rag_chunks_fixed_v1` | 8 | 3255 | 3255 |
| `heading-aware-v1` | 8 | 41 | `text-embedding-3-small` | 1536 | `rag_chunks_heading_v1` | 41 | 4428 | 4428 |

## 4. Metrics

Metric definitions:

- Hit@5: Top 5内にexpected documentが1件以上含まれるcase割合。
- MRR: 最初に登場したexpected documentのrankからreciprocal rankを計算し、case平均を取る。
- Source Recall@5: expectedDocumentIdsのうちTop 5に含まれたdocument ID割合。document ID単位で重複除去する。

実装上も、Source Recall@5はTop-Kの`documentId`集合を作ってからexpected sourceと照合しており、同一documentの複数chunkを重複加算しない。

| Strategy | Hit@5 | MRR | Source Recall@5 |
|---|---:|---:|---:|
| `fixed-size-v1` | 1.000 | 0.854 | 1.000 |
| `heading-aware-v1` | 1.000 | 1.000 | 1.000 |

MRR calculation check:

- `fixed-size-v1`: ranks `[1, 1, 1, 1, 3, 2, 1, 1]` -> 0.854
- `heading-aware-v1`: ranks `[1, 1, 1, 1, 1, 1, 1, 1]` -> 1.000

## 5. Case-Level Rank Comparison

| Case | Expected source | fixed-size-v1 first relevant rank | heading-aware-v1 first relevant rank |
|---|---|---:|---:|
| CASE-001 | `profile-image-spec` | 1 | 1 |
| CASE-002 | `frontend-cache-guideline`, `profile-image-spec` | 1 | 1 |
| CASE-003 | `media-upload-security` | 1 | 1 |
| CASE-004 | `profile-api` | 1 | 1 |
| CASE-005 | `error-message-guideline` | 3 | 1 |
| CASE-006 | `storage-lifecycle` | 2 | 1 |
| CASE-007 | `notification-settings-spec` | 1 | 1 |
| CASE-008 | `search-filter-spec` | 1 | 1 |

## 6. Manual Retrieval Review

追加のOpenAI Embeddings API呼び出しやQdrant queryは行わず、実測rank結果、evaluation case、synthetic corpus、heading-aware chunk構造を確認した。Top 5の詳細なscore順・非expected sourceの全内訳は保存されていないため、ここでは渡された実測metricから言える範囲に限定する。

確認結果:

- 全8caseで`heading-aware-v1`のfirst relevant sourceはrank 1だった。
- 全8caseでSource Recall@5は1.00であり、expected sourceはTop 5に含まれていた。
- CASE-007 / CASE-008では、別機能documentである`notification-settings-spec`と`search-filter-spec`がそれぞれrank 1になっており、プロフィール画像関連queryとは異なるdistractor sourceを識別できている。
- heading-aware chunkは`documentTitle`と`headingPath`をembeddingTextへ含め、retrieval resultにもmetadataとして保持するため、検索結果の意味を人間が確認しやすい。
- section単位のchunkは、fixed-size chunkよりもchunk単独で読みやすい。特にエラー表示、cleanup、cache、APIなどの関心が見出し単位で分離される。
- 現時点の実測metricでは、expected source missing、rank too low、Source Recall低下は観測されていない。

Top 5全体におけるdistractor混入数、score差、同一document chunkの占有度は、今回の記録値だけでは断定しない。Phase 1-C前に必要であれば、debug APIまたはJSON reportでTop 5詳細を保存してmanual reviewを再実施する。

## 7. CASE-005 Analysis

CASE-005 query:

```text
画像アップロード失敗時にユーザーへ何を表示するか
```

`fixed-size-v1`ではfirst relevant rankが3、`heading-aware-v1`ではrank 1だった。

関連sourceである`error-message-guideline`には、以下のようにquery意図と直接対応するsectionがある。

- `基本方針 > 行動可能な文言`
- `基本方針 > 内部例外を表示しない`
- `プロフィール画像アップロード > Validation error`
- `プロフィール画像アップロード > Network error`
- `Retryability`

heading-aware chunkでは、これらの見出しが`headingPath`として保持され、embeddingTextにも`Document: エラーメッセージガイドライン`と`Section: ...`が含まれる。そのため「失敗時にユーザーへ何を表示するか」というqueryに対して、ユーザー向けmessage、validation error、network error、retryable/non-retryableのsectionがretrieval対象として分離されている。このchunk構造は、first relevant rankが3から1へ改善した実測結果と整合する。

ただし、rank改善の内部要因をembedding modelの重みとして断定することはしない。データから言えるのは、今回のcorpusとqueryではheading-aware化により関連sourceのrankが3から1へ改善した、という点である。

## 8. CASE-006 Analysis

CASE-006 query:

```text
プロフィール画像を置き換えた後の古い画像や不完全ファイルの扱い
```

`fixed-size-v1`ではfirst relevant rankが2、`heading-aware-v1`ではrank 1だった。

関連sourceである`storage-lifecycle`には、以下のようにquery意図と直接対応するsectionがある。

- `保存と切替 > 新画像保存`
- `保存と切替 > Rollback`
- `失敗時cleanup`
- `旧画像cleanup`
- `Object storage lifecycle`

heading-aware chunkでは「不完全ファイル」や「古い画像」の扱いが、cleanup系のheadingPathとcontentに分離される。特に`失敗時cleanup`は不完全なtemporary objectを残さない方針、`旧画像cleanup`は新画像切替後の旧画像policyを説明しており、queryの2要素と対応している。

このため、fixed-sizeでは文書全体内の一部として扱われていたcleanup関連情報が、heading-awareではsection metadata付きのchunkとしてretrieval対象になる。このchunk構造は、first relevant rankが2から1へ改善した実測結果と整合する。内部的なranking要因は、今回の保存値だけからは断定しない。

## 9. Chunk / Embedding Usage Trade-Off

| Item | fixed-size-v1 | heading-aware-v1 | Difference |
|---|---:|---:|---:|
| Chunks | 8 | 41 | 約5.1倍 |
| Embedding prompt tokens | 3255 | 4428 | 約36%増 |
| Hit@5 | 1.000 | 1.000 | 維持 |
| MRR | 0.854 | 1.000 | 改善 |
| Source Recall@5 | 1.000 | 1.000 | 維持 |

`heading-aware-v1`は、chunk数とembedding量を増やす代わりに、fine-grainedなsection retrievalによりrankingを改善した。今回のsmall corpusでは、Hit@5とSource Recall@5を維持したままMRRが改善している。

ただし、これは8 documentsのsynthetic small corpusでの結果であり、production-scale cost、latency、Qdrant performanceを推定して断定しない。

## 10. Strategy Selection

Phase 1-Cのgrounded generationには`heading-aware-v1`を採用する。

根拠:

- Hit@5を1.000で維持した。
- Source Recall@5を1.000で維持した。
- MRRを0.854から1.000へ改善した。
- 全8caseでfirst relevant sourceがrank 1だった。
- corpusとchunk構造の確認上、section heading metadataがretrieval resultの説明性とchunk単独可読性を高めている。

この選定は、synthetic 8-document corpus、8 evaluation cases、`text-embedding-3-small`、topK=5、現在のchunk設定に限定されたPoC判断である。次段階では`heading-aware-v1`を使ってRAG context constructionとgrounded generation評価へ進む。
