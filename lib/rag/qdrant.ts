import { createHash } from "node:crypto";
import { QdrantClient } from "@qdrant/js-client-rest";
import { getRagConfig } from "./config";
import {
  qdrantPayloadSchema,
  type QdrantChunkPayload,
  type RagChunk,
  type RagChunkStrategy,
  type RetrievedChunk
} from "./schema";

export const collectionByStrategy: Record<RagChunkStrategy, string> = {
  "fixed-size-v1": "rag_chunks_fixed_v1",
  "heading-aware-v1": "rag_chunks_heading_v1"
};

type QdrantClientLike = Pick<
  QdrantClient,
  "collectionExists" | "recreateCollection" | "upsert" | "query"
>;

type QdrantQueryResponse = {
  points?: Array<{
    score?: unknown;
    payload?: unknown;
  }>;
};

export function getRagCollectionName(strategy: RagChunkStrategy): string {
  return collectionByStrategy[strategy];
}

export function createRagQdrantClient(): QdrantClient {
  const config = getRagConfig();
  return new QdrantClient({
    url: config.qdrantUrl,
    apiKey: config.qdrantApiKey
  });
}

export function chunkIdToPointId(chunkId: string): string {
  const hex = createHash("sha256").update(chunkId).digest("hex").slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(
    13,
    16
  )}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export async function recreateRagCollection(
  client: QdrantClientLike,
  strategy: RagChunkStrategy,
  vectorSize: number
): Promise<string> {
  const collectionName = getRagCollectionName(strategy);
  await client.recreateCollection(collectionName, {
    vectors: {
      size: vectorSize,
      distance: "Cosine"
    }
  });
  return collectionName;
}

export async function ragCollectionExists(
  client: QdrantClientLike,
  strategy: RagChunkStrategy
): Promise<boolean> {
  const result = await client.collectionExists(getRagCollectionName(strategy));
  return Boolean(result.exists);
}

export function chunkToQdrantPayload(
  chunk: RagChunk,
  embeddingModel: string
): QdrantChunkPayload {
  return qdrantPayloadSchema.parse({
    chunkId: chunk.chunkId,
    documentId: chunk.documentId,
    sourcePath: chunk.sourcePath,
    documentTitle: chunk.documentTitle,
    headingPath: chunk.headingPath,
    content: chunk.content,
    chunkIndex: chunk.chunkIndex,
    chunkStrategy: chunk.chunkStrategy,
    contentHash: chunk.contentHash,
    embeddingModel
  });
}

export async function upsertRagChunks(
  client: QdrantClientLike,
  strategy: RagChunkStrategy,
  chunks: RagChunk[],
  vectors: number[][],
  embeddingModel: string
): Promise<number> {
  if (chunks.length !== vectors.length) {
    throw new Error("Chunk count and vector count do not match.");
  }

  const collectionName = getRagCollectionName(strategy);
  await client.upsert(collectionName, {
    wait: true,
    points: chunks.map((chunk, index) => ({
      id: chunkIdToPointId(chunk.chunkId),
      vector: vectors[index],
      payload: chunkToQdrantPayload(chunk, embeddingModel)
    }))
  });

  return chunks.length;
}

export function normalizeQdrantResults(
  response: QdrantQueryResponse
): RetrievedChunk[] {
  const points = Array.isArray(response.points) ? response.points : [];

  return points.map((point, index) => {
    const payload = qdrantPayloadSchema.parse(point.payload);
    const score = typeof point.score === "number" ? point.score : 0;

    return {
      rank: index + 1,
      score,
      chunkId: payload.chunkId,
      documentId: payload.documentId,
      sourcePath: payload.sourcePath,
      documentTitle: payload.documentTitle,
      headingPath: payload.headingPath,
      content: payload.content
    };
  });
}

export async function queryRagChunks(
  client: QdrantClientLike,
  strategy: RagChunkStrategy,
  queryVector: number[],
  topK: number
): Promise<RetrievedChunk[]> {
  const response = (await client.query(getRagCollectionName(strategy), {
    query: queryVector,
    limit: topK,
    with_payload: true,
    with_vector: false
  })) as QdrantQueryResponse;

  return normalizeQdrantResults(response);
}
