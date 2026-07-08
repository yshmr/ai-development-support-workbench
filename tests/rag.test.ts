import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/rag/search/route";
import { chunkDocumentFixedSize, chunkDocumentHeadingAware } from "@/lib/rag/chunker";
import { loadRagCliEnv, parseRagCliArgs } from "@/lib/rag/cli";
import { buildGroundedContext } from "@/lib/rag/context";
import {
  calculateContextCompositionMetrics,
  getCandidateTopKForContextPolicy,
  selectRagContextChunks
} from "@/lib/rag/context-selection";
import { createOpenAiEmbeddings } from "@/lib/rag/embedding";
import {
  evaluateRetrievedChunks,
  summarizeRetrievalEvaluation
} from "@/lib/rag/evaluation";
import { loadRagDocuments } from "@/lib/rag/loader";
import {
  chunkIdToPointId,
  createRagQdrantClientParams,
  getRagCollectionName,
  normalizeQdrantResults,
  upsertRagChunks
} from "@/lib/rag/qdrant";
import { retrieveRagChunks } from "@/lib/rag/retriever";
import type { RagDocument, RetrievedChunk } from "@/lib/rag/schema";

vi.mock("@/lib/rag/retriever", () => ({
  retrieveRagChunks: vi.fn()
}));

const mockedRetrieveRagChunks = vi.mocked(retrieveRagChunks);

const sampleDocument: RagDocument = {
  documentId: "sample",
  sourcePath: "data/rag/knowledge/sample.md",
  title: "サンプル仕様",
  content: `# サンプル仕様

## アップロード

最大5MBまで。
JPGとPNGに対応する。

### エラー

失敗時はエラーメッセージを表示する。`,
  contentHash: "sample-hash"
};

describe("RAG CLI helpers", () => {
  const originalOpenAiApiKey = process.env.OPENAI_API_KEY;
  const originalEmbeddingModel = process.env.OPENAI_EMBEDDING_MODEL;
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    if (originalOpenAiApiKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = originalOpenAiApiKey;
    }

    if (originalEmbeddingModel === undefined) {
      delete process.env.OPENAI_EMBEDDING_MODEL;
    } else {
      process.env.OPENAI_EMBEDDING_MODEL = originalEmbeddingModel;
    }

    if (originalNodeEnv === undefined) {
      Reflect.deleteProperty(process.env, "NODE_ENV");
    } else {
      Object.assign(process.env, { NODE_ENV: originalNodeEnv });
    }
  });

  it("parses positional strategy arguments", () => {
    expect(parseRagCliArgs(["fixed-size-v1"]).strategy).toBe("fixed-size-v1");
    expect(parseRagCliArgs(["heading-aware-v1"]).strategy).toBe(
      "heading-aware-v1"
    );
  });

  it("parses evaluate topK with the same positional convention", () => {
    expect(parseRagCliArgs(["heading-aware-v1", "7"]).topK).toBe(7);
  });

  it("rejects deprecated flag-style strategy arguments", () => {
    expect(() => parseRagCliArgs(["--strategy=fixed-size-v1"])).toThrow(
      "Use positional arguments"
    );
  });

  it("rejects invalid strategy arguments", () => {
    expect(() => parseRagCliArgs(["unknown-strategy"])).toThrow();
  });

  it("loads .env.local before embedding config is read", async () => {
    const tempDir = await createTempDir();
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_EMBEDDING_MODEL;
    Object.assign(process.env, { NODE_ENV: "development" });

    try {
      await writeFile(
        path.join(tempDir, ".env.local"),
        "OPENAI_API_KEY=loaded-test-key\nOPENAI_EMBEDDING_MODEL=text-embedding-3-small\n",
        "utf8"
      );
      loadRagCliEnv(tempDir, { forceReload: true });

      const fetchMock = vi.fn(async () =>
        new Response(
          JSON.stringify({
            data: [{ index: 0, embedding: [0.1, 0.2] }]
          }),
          { status: 200 }
        )
      );
      const result = await createOpenAiEmbeddings(["hello"], {
        fetchImpl: fetchMock
      });

      expect(result.vectorDimension).toBe(2);
      expect(process.env.OPENAI_API_KEY).toBe("loaded-test-key");
      const fetchCalls = fetchMock.mock.calls as unknown as [
        string,
        RequestInit
      ][];
      expect(String(fetchCalls[0]?.[1].body)).not.toContain("loaded-test-key");
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});

async function createTempDir() {
  return mkdtemp(path.join(os.tmpdir(), "rag-test-"));
}

describe("RAG loader", () => {
  it("loads Markdown documents with deterministic ordering and normalized paths", async () => {
    const tempDir = await createTempDir();

    try {
      await writeFile(path.join(tempDir, "b.md"), "# B Title\n\nB body", "utf8");
      await writeFile(path.join(tempDir, "a.md"), "# A Title\n\nA body", "utf8");

      const documents = await loadRagDocuments(tempDir);

      expect(documents.map((document) => document.documentId)).toEqual(["a", "b"]);
      expect(documents[0].title).toBe("A Title");
      expect(documents[0].sourcePath).toContain("a.md");
      expect(documents[0].sourcePath).not.toContain("\\");
      expect(documents[0].contentHash).toMatch(/^[a-f0-9]{64}$/);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("rejects empty documents", async () => {
    const tempDir = await createTempDir();

    try {
      await writeFile(path.join(tempDir, "empty.md"), "", "utf8");
      await expect(loadRagDocuments(tempDir)).rejects.toThrow("is empty");
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("rejects duplicate document IDs", async () => {
    const tempDir = await createTempDir();

    try {
      await writeFile(path.join(tempDir, "dup.md"), "# Dup\n\nBody", "utf8");
      await writeFile(path.join(tempDir, "dup.markdown"), "# Dup 2\n\nBody", "utf8");
      await expect(loadRagDocuments(tempDir)).rejects.toThrow(
        "Duplicate RAG documentId"
      );
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});

describe("RAG chunkers", () => {
  it("creates deterministic fixed-size chunks with overlap", () => {
    const longContent = `# Long\n\n${"あ".repeat(900)}${"い".repeat(200)}`;
    const document = { ...sampleDocument, content: longContent };

    const chunks = chunkDocumentFixedSize(document);
    const repeatedChunks = chunkDocumentFixedSize(document);

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.content.length > 0)).toBe(true);
    expect(chunks[0].chunkId).toBe(repeatedChunks[0].chunkId);
    expect(chunks[1].content.slice(0, 20)).toBe(chunks[0].content.slice(-120, -100));
  });

  it("creates heading-aware chunks with heading path and embedding prefix", () => {
    const chunks = chunkDocumentHeadingAware(sampleDocument);

    expect(chunks.length).toBeGreaterThanOrEqual(2);
    expect(chunks.some((chunk) => chunk.headingPath.includes("アップロード"))).toBe(
      true
    );
    expect(chunks.some((chunk) => chunk.headingPath.includes("エラー"))).toBe(true);
    expect(chunks[0].embeddingText).toContain("Document: サンプル仕様");
    expect(chunks[0].embeddingText).toContain("Section:");
    expect(chunks[0].content).not.toContain("Document:");
  });

  it("does not create chunks for heading-only empty sections", () => {
    const document = {
      ...sampleDocument,
      content: "# Title\n\n## Empty\n\n## Filled\n\nBody"
    };

    const chunks = chunkDocumentHeadingAware(document);

    expect(chunks).toHaveLength(1);
    expect(chunks[0].headingPath).toEqual(["Title", "Filled"]);
  });
});

describe("OpenAI embedding client", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns a clear error when OPENAI_API_KEY is missing", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");

    await expect(createOpenAiEmbeddings(["hello"])).rejects.toThrow(
      "OPENAI_API_KEY"
    );
  });

  it("maps batch response by index and usage metadata", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          data: [
            { index: 1, embedding: [0.3, 0.4] },
            { index: 0, embedding: [0.1, 0.2] }
          ],
          usage: { prompt_tokens: 12, total_tokens: 12 }
        }),
        { status: 200 }
      )
    );

    const result = await createOpenAiEmbeddings(["a", "b"], {
      fetchImpl: fetchMock
    });

    expect(result.vectors).toEqual([
      [0.1, 0.2],
      [0.3, 0.4]
    ]);
    expect(result.vectorDimension).toBe(2);
    expect(result.usage?.promptTokens).toBe(12);
    const fetchCalls = fetchMock.mock.calls as unknown as [
      string,
      RequestInit
    ][];
    const requestInit = fetchCalls[0]?.[1];
    expect(String(requestInit?.body)).not.toContain("test-key");
  });

  it("rejects malformed and inconsistent embedding responses", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");

    await expect(
      createOpenAiEmbeddings(["a", "b"], {
        fetchImpl: vi.fn(async () =>
          new Response(
            JSON.stringify({
              data: [
                { index: 0, embedding: [0.1, 0.2] },
                { index: 1, embedding: [0.3] }
              ]
            }),
            { status: 200 }
          )
        )
      })
    ).rejects.toThrow("inconsistent dimensions");
  });

  it("classifies HTTP errors without exposing secrets", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");

    await expect(
      createOpenAiEmbeddings(["a"], {
        fetchImpl: vi.fn(async () => new Response("{}", { status: 429 }))
      })
    ).rejects.toThrow("rate_limit_or_quota");
  });
});

describe("Qdrant adapter", () => {
  it("skips Qdrant server compatibility version checks for local PoC runs", () => {
    vi.stubEnv("QDRANT_URL", "http://localhost:6333");
    vi.stubEnv("QDRANT_API_KEY", "test-qdrant-key");

    expect(createRagQdrantClientParams()).toMatchObject({
      url: "http://localhost:6333",
      apiKey: "test-qdrant-key",
      checkCompatibility: false
    });
  });

  it("maps strategies to stable collection names", () => {
    expect(getRagCollectionName("fixed-size-v1")).toBe("rag_chunks_fixed_v1");
    expect(getRagCollectionName("heading-aware-v1")).toBe(
      "rag_chunks_heading_v1"
    );
  });

  it("creates deterministic UUID point IDs from chunk IDs", () => {
    const first = chunkIdToPointId("sample:heading-aware-v1:0001:abc");
    const second = chunkIdToPointId("sample:heading-aware-v1:0001:abc");

    expect(first).toBe(second);
    expect(first).toMatch(
      /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-a[a-f0-9]{3}-[a-f0-9]{12}$/
    );
  });

  it("validates payloads and normalizes query results", () => {
    const result = normalizeQdrantResults({
      points: [
        {
          score: 0.9,
          payload: {
            chunkId: "chunk-1",
            documentId: "profile-image-spec",
            sourcePath: "data/rag/knowledge/profile-image-spec.md",
            documentTitle: "プロフィール画像仕様",
            headingPath: ["アップロード制約"],
            content: "最大5MBまで。",
            chunkIndex: 0,
            chunkStrategy: "heading-aware-v1",
            contentHash: "hash",
            embeddingModel: "text-embedding-3-small"
          }
        }
      ]
    });

    expect(result[0]).toMatchObject({
      rank: 1,
      score: 0.9,
      documentId: "profile-image-spec"
    });
  });

  it("upserts chunks without including vector values in payload", async () => {
    const chunk = chunkDocumentHeadingAware(sampleDocument)[0];
    const client = {
      upsert: vi.fn(async () => ({ status: "completed" }))
    };

    await upsertRagChunks(
      client as never,
      "heading-aware-v1",
      [chunk],
      [[0.1, 0.2]],
      "text-embedding-3-small"
    );

    const upsertCalls = client.upsert.mock.calls as unknown as [
      string,
      { points: Array<{ vector: number[]; payload: Record<string, unknown> }> }
    ][];
    const upsertArgs = upsertCalls[0]?.[1] as
      | { points: Array<{ vector: number[]; payload: Record<string, unknown> }> }
      | undefined;
    const points = upsertArgs?.points ?? [];
    expect(points[0].vector).toEqual([0.1, 0.2]);
    expect(points[0].payload.embeddingModel).toBe("text-embedding-3-small");
    expect(points[0].payload.vector).toBeUndefined();
  });
});

describe("retrieval metrics", () => {
  const retrieved: RetrievedChunk[] = [
    {
      rank: 1,
      score: 0.9,
      chunkId: "a",
      documentId: "distractor",
      sourcePath: "a.md",
      documentTitle: "A",
      headingPath: [],
      content: "A"
    },
    {
      rank: 2,
      score: 0.8,
      chunkId: "b",
      documentId: "expected",
      sourcePath: "b.md",
      documentTitle: "B",
      headingPath: [],
      content: "B"
    },
    {
      rank: 3,
      score: 0.7,
      chunkId: "c",
      documentId: "expected",
      sourcePath: "c.md",
      documentTitle: "C",
      headingPath: [],
      content: "C"
    }
  ];

  it("calculates Hit@K, MRR, and Source Recall@K by document ID", () => {
    const result = evaluateRetrievedChunks(
      {
        id: "CASE",
        query: "query",
        expectedDocumentIds: ["expected", "missing"],
        notes: "notes"
      },
      retrieved,
      5
    );

    expect(result.hit).toBe(true);
    expect(result.firstRelevantRank).toBe(2);
    expect(result.reciprocalRank).toBe(0.5);
    expect(result.sourceRecall).toBe(0.5);
  });

  it("summarizes no relevant result as zero metrics for that case", () => {
    const result = evaluateRetrievedChunks(
      {
        id: "CASE",
        query: "query",
        expectedDocumentIds: ["missing"],
        notes: "notes"
      },
      retrieved,
      2
    );
    const summary = summarizeRetrievalEvaluation([result], 2);

    expect(result.hit).toBe(false);
    expect(result.reciprocalRank).toBe(0);
    expect(summary.hitAtK).toBe(0);
    expect(summary.mrr).toBe(0);
  });
});

describe("grounded generation context", () => {
  const retrieved: RetrievedChunk[] = [
    {
      rank: 1,
      score: 0.92,
      chunkId: "profile:heading-aware-v1:0001",
      documentId: "profile-image-spec",
      sourcePath: "data/rag/knowledge/profile-image-spec.md",
      documentTitle: "プロフィール画像仕様",
      headingPath: ["プロフィール画像", "アップロード制約"],
      content: "プロフィール画像は5MBまで、JPG/PNGのみ許可する。"
    },
    {
      rank: 2,
      score: 0.88,
      chunkId: "cache:heading-aware-v1:0001",
      documentId: "frontend-cache-guideline",
      sourcePath: "data/rag/knowledge/frontend-cache-guideline.md",
      documentTitle: "フロントエンドキャッシュ方針",
      headingPath: ["画像反映"],
      content: "変更後は最新URLまたはcache bustingで即時反映する。"
    }
  ];

  it("builds deterministic source IDs and delimited context text", () => {
    const first = buildGroundedContext(retrieved);
    const second = buildGroundedContext(retrieved);

    expect(first).toEqual(second);
    expect(first.sources.map((source) => source.sourceId)).toEqual(["S1", "S2"]);
    expect(first.sources.map((source) => source.contextRank)).toEqual([1, 2]);
    expect(first.sources.map((source) => source.retrievalRank)).toEqual([1, 2]);
    expect(first.contextText).toContain("<retrieved_product_knowledge>");
    expect(first.contextText).toContain("</retrieved_product_knowledge>");
    expect(first.contextText).toContain("[S1]");
    expect(first.contextText).toContain("Document: プロフィール画像仕様");
    expect(first.contextText).toContain(
      "Section: プロフィール画像 > アップロード制約"
    );
    expect(first.contextText).toContain(
      "Source: data/rag/knowledge/profile-image-spec.md"
    );
    expect(first.contextText).toContain("Content:");
    expect(first.contextText).toContain("JPG/PNGのみ許可");
  });

  it("filters unusable chunks and fails closed when no source text remains", () => {
    expect(() =>
      buildGroundedContext([{ ...retrieved[0], content: "   " }])
    ).toThrow("RAG retrieval returned no usable chunks");
    expect(() => buildGroundedContext([])).toThrow(
      "RAG retrieval returned no usable chunks"
    );
  });
});

describe("RAG context selection", () => {
  function chunk(rank: number, documentId: string): RetrievedChunk {
    return {
      rank,
      score: 1 - rank / 100,
      chunkId: `${documentId}-${rank}`,
      documentId,
      sourcePath: `data/rag/knowledge/${documentId}.md`,
      documentTitle: documentId,
      headingPath: ["Section"],
      content: `${documentId} content ${rank}`
    };
  }

  const candidates = [
    chunk(1, "profile-image-spec"),
    chunk(2, "profile-image-spec"),
    chunk(3, "profile-image-spec"),
    chunk(4, "error-message-guideline"),
    chunk(5, "profile-api"),
    chunk(6, "frontend-cache-guideline"),
    chunk(7, "media-upload-security")
  ];

  it("maps context policies to retrieval candidate counts", () => {
    expect(getCandidateTopKForContextPolicy("raw-top-k-v1")).toBe(5);
    expect(getCandidateTopKForContextPolicy("document-cap-v1")).toBe(10);
    expect(getCandidateTopKForContextPolicy("document-diversity-v1")).toBe(10);
  });

  it("keeps raw semantic Top 5 as the baseline policy", () => {
    const selected = selectRagContextChunks(candidates, "raw-top-k-v1");

    expect(selected.selectedChunks.map((candidate) => candidate.rank)).toEqual([
      1, 2, 3, 4, 5
    ]);
    expect(selected.selectedChunks.map((candidate) => candidate.contextRank)).toEqual([
      1, 2, 3, 4, 5
    ]);
    expect(selected.selectedChunks.map((candidate) => candidate.retrievalRank)).toEqual([
      1, 2, 3, 4, 5
    ]);
    expect(selected.metrics).toMatchObject({
      selectedChunkCount: 5,
      uniqueDocumentCount: 3,
      maximumChunksFromSameDocument: 3,
      duplicateSlotCount: 2
    });
    expect(selected.candidateMetrics).toMatchObject({
      selectedChunkCount: 7,
      uniqueDocumentCount: 5,
      maximumChunksFromSameDocument: 3
    });
  });

  it("caps document chunks at two while preserving original retrieval order", () => {
    const selected = selectRagContextChunks(candidates, "document-cap-v1");

    expect(selected.selectedChunks.map((candidate) => candidate.documentId)).toEqual([
      "profile-image-spec",
      "profile-image-spec",
      "error-message-guideline",
      "profile-api",
      "frontend-cache-guideline"
    ]);
    expect(selected.selectedChunks.map((candidate) => candidate.retrievalRank)).toEqual([
      1, 2, 4, 5, 6
    ]);
    expect(selected.selectedChunks.map((candidate) => candidate.contextRank)).toEqual([
      1, 2, 3, 4, 5
    ]);
    expect(selected.selectedChunks[4].score).toBe(candidates[5].score);
    expect(selected.metrics).toMatchObject({
      selectedChunkCount: 5,
      uniqueDocumentCount: 4,
      maximumChunksFromSameDocument: 2,
      duplicateSlotCount: 1
    });
    expect(selected.metrics.documentChunkCounts).toMatchObject({
      "profile-image-spec": 2,
      "error-message-guideline": 1,
      "profile-api": 1,
      "frontend-cache-guideline": 1
    });
  });

  it("selects unique documents first and then fills second chunks", () => {
    const selected = selectRagContextChunks(
      [
        chunk(1, "A"),
        chunk(2, "A"),
        chunk(3, "A"),
        chunk(4, "B"),
        chunk(5, "C"),
        chunk(6, "C"),
        chunk(7, "D")
      ],
      "document-diversity-v1"
    );

    expect(selected.selectedChunks.map((candidate) => candidate.retrievalRank)).toEqual([
      1, 2, 4, 5, 7
    ]);
    expect(selected.selectedChunks.map((candidate) => candidate.contextRank)).toEqual([
      1, 2, 3, 4, 5
    ]);
    expect(selected.selectedChunks.map((candidate) => candidate.documentId)).toEqual([
      "A",
      "A",
      "B",
      "C",
      "D"
    ]);
    expect(selected.selectedChunks[1].score).toBe(0.98);
    expect(selected.metrics).toMatchObject({
      selectedChunkCount: 5,
      uniqueDocumentCount: 4,
      maximumChunksFromSameDocument: 2,
      duplicateSlotCount: 1
    });
  });

  it("uses the first five unique documents when available", () => {
    const selected = selectRagContextChunks(
      [
        chunk(1, "A"),
        chunk(2, "B"),
        chunk(3, "C"),
        chunk(4, "D"),
        chunk(5, "E"),
        chunk(6, "A")
      ],
      "document-diversity-v1"
    );

    expect(selected.selectedChunks.map((candidate) => candidate.documentId)).toEqual([
      "A",
      "B",
      "C",
      "D",
      "E"
    ]);
    expect(selected.metrics.maximumChunksFromSameDocument).toBe(1);
  });

  it("fills fewer than five diversity chunks without fallback when candidates are limited", () => {
    const selected = selectRagContextChunks(
      [chunk(1, "A"), chunk(2, "A"), chunk(3, "A"), chunk(4, "B")],
      "document-diversity-v1"
    );

    expect(selected.selectedChunks.map((candidate) => candidate.retrievalRank)).toEqual([
      1, 2, 4
    ]);
    expect(selected.metrics).toMatchObject({
      selectedChunkCount: 3,
      uniqueDocumentCount: 2,
      maximumChunksFromSameDocument: 2
    });
  });

  it("keeps only two chunks when one document dominates diversity candidates", () => {
    const selected = selectRagContextChunks(
      [chunk(1, "A"), chunk(2, "A"), chunk(3, "A")],
      "document-diversity-v1"
    );

    expect(selected.selectedChunks.map((candidate) => candidate.retrievalRank)).toEqual([
      1, 2
    ]);
    expect(selected.metrics.documentChunkCounts).toEqual({ A: 2 });
  });

  it("does not select duplicate chunk identities twice", () => {
    const duplicate = chunk(1, "A");
    const selected = selectRagContextChunks(
      [
        duplicate,
        { ...duplicate, rank: 2, score: 0.98 },
        chunk(3, "B"),
        chunk(4, "C")
      ],
      "document-diversity-v1"
    );

    expect(selected.selectedChunks.map((candidate) => candidate.chunkId)).toEqual([
      duplicate.chunkId,
      "B-3",
      "C-4"
    ]);
    expect(selected.metrics.uniqueDocumentCount).toBe(3);
  });

  it("allows fewer than five final chunks without adaptive fallback", () => {
    const selected = selectRagContextChunks(
      [chunk(1, "profile-image-spec"), chunk(2, "profile-image-spec"), chunk(3, "profile-image-spec")],
      "document-cap-v1"
    );

    expect(selected.selectedChunks).toHaveLength(2);
    expect(selected.metrics).toMatchObject({
      selectedChunkCount: 2,
      uniqueDocumentCount: 1,
      maximumChunksFromSameDocument: 2,
      duplicateSlotCount: 1
    });
  });

  it("returns deterministic empty metrics for zero candidates", () => {
    const selected = selectRagContextChunks([], "document-cap-v1");

    expect(selected.selectedChunks).toEqual([]);
    expect(selected.metrics).toEqual({
      selectedChunkCount: 0,
      uniqueDocumentCount: 0,
      maximumChunksFromSameDocument: 0,
      documentChunkCounts: {},
      duplicateSlotCount: 0
    });
  });

  it("calculates context composition metrics independently", () => {
    expect(
      calculateContextCompositionMetrics([
        { documentId: "a" },
        { documentId: "a" },
        { documentId: "b" }
      ])
    ).toEqual({
      selectedChunkCount: 3,
      uniqueDocumentCount: 2,
      maximumChunksFromSameDocument: 2,
      documentChunkCounts: {
        a: 2,
        b: 1
      },
      duplicateSlotCount: 1
    });
  });
});

describe("POST /api/rag/search", () => {
  afterEach(() => {
    mockedRetrieveRagChunks.mockReset();
  });

  it("rejects invalid requests", async () => {
    const response = await POST(
      new Request("http://localhost/api/rag/search", {
        method: "POST",
        body: JSON.stringify({ query: "", strategy: "bad", topK: 0 })
      })
    );

    expect(response.status).toBe(400);
  });

  it("returns retrieval result shape without vectors", async () => {
    mockedRetrieveRagChunks.mockResolvedValueOnce({
      query: "プロフィール画像",
      strategy: "heading-aware-v1",
      topK: 5,
      embeddingModel: "text-embedding-3-small",
      results: [
        {
          rank: 1,
          score: 0.9,
          chunkId: "chunk-1",
          documentId: "profile-image-spec",
          sourcePath: "data/rag/knowledge/profile-image-spec.md",
          documentTitle: "プロフィール画像仕様",
          headingPath: ["アップロード制約"],
          content: "最大5MBまで。"
        }
      ]
    });

    const response = await POST(
      new Request("http://localhost/api/rag/search", {
        method: "POST",
        body: JSON.stringify({
          query: "プロフィール画像",
          strategy: "heading-aware-v1",
          topK: 5
        })
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.embeddingModel).toBe("text-embedding-3-small");
    expect(body.results[0].documentId).toBe("profile-image-spec");
    expect(body.results[0].vector).toBeUndefined();
  });
});
