import { defaultRagTopK, getRagConfig } from "./config";
import { createOpenAiQueryEmbedding } from "./embedding";
import { createRagQdrantClient, queryRagChunks } from "./qdrant";
import {
  retrieveInputSchema,
  type RagChunkStrategy,
  type RetrievedChunk
} from "./schema";

export type RetrieveResult = {
  query: string;
  strategy: RagChunkStrategy;
  topK: number;
  embeddingModel: string;
  results: RetrievedChunk[];
};

export async function retrieveRagChunks(input: {
  query: string;
  strategy: RagChunkStrategy;
  topK?: number;
}): Promise<RetrieveResult> {
  const parsedInput = retrieveInputSchema.parse({
    query: input.query,
    strategy: input.strategy,
    topK: input.topK ?? defaultRagTopK
  });
  const config = getRagConfig();
  const embedding = await createOpenAiQueryEmbedding(parsedInput.query);
  const client = createRagQdrantClient();
  const results = await queryRagChunks(
    client,
    parsedInput.strategy,
    embedding.vectors[0],
    parsedInput.topK
  );

  return {
    query: parsedInput.query,
    strategy: parsedInput.strategy,
    topK: parsedInput.topK,
    embeddingModel: config.embeddingModel,
    results
  };
}
