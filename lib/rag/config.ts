import { z } from "zod";
import { ragChunkStrategySchema, type RagChunkStrategy } from "./schema";

const OPENAI_EMBEDDING_DIMENSIONS: Record<string, number> = {
  "text-embedding-3-small": 1536,
  "text-embedding-3-large": 3072
};

const ragConfigSchema = z.object({
  embeddingProvider: z.literal("openai"),
  embeddingModel: z.string().min(1),
  embeddingDimension: z.number().int().positive(),
  qdrantUrl: z.string().url(),
  qdrantApiKey: z.string().optional()
});

export type RagConfig = z.infer<typeof ragConfigSchema>;

export const defaultRagTopK = 5;
export const selectedGenerationRagStrategy = "heading-aware-v1" as const;
export const selectedGenerationRagTopK = 5;

export function getEmbeddingDimension(model: string): number {
  return OPENAI_EMBEDDING_DIMENSIONS[model] ?? 1536;
}

export function getRagConfig(): RagConfig {
  const embeddingProvider = process.env.RAG_EMBEDDING_PROVIDER ?? "openai";
  const embeddingModel =
    process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small";
  const qdrantUrl = process.env.QDRANT_URL ?? "http://localhost:6333";
  const qdrantApiKey = process.env.QDRANT_API_KEY?.trim() || undefined;

  if (embeddingProvider !== "openai") {
    throw new Error("RAG_EMBEDDING_PROVIDER は openai のみ対応しています。");
  }

  return ragConfigSchema.parse({
    embeddingProvider,
    embeddingModel,
    embeddingDimension: getEmbeddingDimension(embeddingModel),
    qdrantUrl,
    qdrantApiKey
  });
}

export function parseRagStrategy(value: unknown): RagChunkStrategy {
  return ragChunkStrategySchema.parse(value);
}

export function getGroundedGenerationRagConfig(): {
  strategy: typeof selectedGenerationRagStrategy;
  topK: typeof selectedGenerationRagTopK;
} {
  const strategy =
    process.env.RAG_CHUNK_STRATEGY ?? selectedGenerationRagStrategy;
  const topK = Number.parseInt(
    process.env.RAG_TOP_K ?? String(selectedGenerationRagTopK),
    10
  );

  if (strategy !== selectedGenerationRagStrategy) {
    throw new Error(
      "Phase 1-Cでは RAG_CHUNK_STRATEGY=heading-aware-v1 を使用してください。"
    );
  }

  if (topK !== selectedGenerationRagTopK) {
    throw new Error("Phase 1-Cでは RAG_TOP_K=5 を使用してください。");
  }

  return {
    strategy: selectedGenerationRagStrategy,
    topK: selectedGenerationRagTopK
  };
}
