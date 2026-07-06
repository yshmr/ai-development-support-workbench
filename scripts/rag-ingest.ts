import { chunkDocuments } from "../lib/rag/chunker";
import { loadRagCliEnv, parseRagCliArgs } from "../lib/rag/cli";
import { getRagConfig } from "../lib/rag/config";
import { createOpenAiEmbeddings } from "../lib/rag/embedding";
import { loadRagDocuments } from "../lib/rag/loader";
import {
  createRagQdrantClient,
  getRagCollectionName,
  recreateRagCollection,
  upsertRagChunks
} from "../lib/rag/qdrant";

async function main() {
  loadRagCliEnv();
  const { strategy } = parseRagCliArgs(process.argv.slice(2));
  const documents = await loadRagDocuments();
  const chunks = chunkDocuments(documents, strategy);

  if (chunks.length === 0) {
    throw new Error("No chunks were generated.");
  }

  const config = getRagConfig();
  const embedding = await createOpenAiEmbeddings(
    chunks.map((chunk) => chunk.embeddingText)
  );

  if (embedding.vectorDimension !== config.embeddingDimension) {
    throw new Error(
      `Embedding dimension mismatch: expected=${config.embeddingDimension}, actual=${embedding.vectorDimension}`
    );
  }

  const client = createRagQdrantClient();
  const collection = await recreateRagCollection(
    client,
    strategy,
    embedding.vectorDimension
  );
  const upsertedPoints = await upsertRagChunks(
    client,
    strategy,
    chunks,
    embedding.vectors,
    embedding.model
  );

  console.log(
    JSON.stringify(
      {
        strategy,
        documents: documents.length,
        chunks: chunks.length,
        embeddingModel: embedding.model,
        vectorDimension: embedding.vectorDimension,
        collection,
        expectedCollection: getRagCollectionName(strategy),
        upsertedPoints,
        embeddingPromptTokens: embedding.usage?.promptTokens,
        embeddingTotalTokens: embedding.usage?.totalTokens
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "RAG ingestion failed.");
  process.exitCode = 1;
});
