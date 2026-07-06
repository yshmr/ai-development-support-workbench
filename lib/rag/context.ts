import type { RagSource } from "@/lib/schema";
import type { RetrievedChunk } from "./schema";

export type GroundedContext = {
  contextText: string;
  sources: RagSource[];
};

function formatHeadingPath(headingPath: string[]): string {
  return headingPath.length > 0 ? headingPath.join(" > ") : "(root)";
}

export function buildGroundedContext(chunks: RetrievedChunk[]): GroundedContext {
  const validChunks = chunks.filter((chunk) => chunk.content.trim().length > 0);

  if (validChunks.length === 0) {
    throw new Error("RAG retrieval returned no usable chunks.");
  }

  const sources = validChunks.map((chunk, index) => ({
    sourceId: `S${index + 1}`,
    rank: chunk.rank,
    score: chunk.score,
    chunkId: chunk.chunkId,
    documentId: chunk.documentId,
    documentTitle: chunk.documentTitle,
    headingPath: chunk.headingPath,
    sourcePath: chunk.sourcePath,
    content: chunk.content
  }));

  const contextText = [
    "<retrieved_product_knowledge>",
    ...sources.map((source) =>
      [
        "",
        `[${source.sourceId}]`,
        `Document: ${source.documentTitle}`,
        `Section: ${formatHeadingPath(source.headingPath)}`,
        `Source: ${source.sourcePath}`,
        "",
        "Content:",
        source.content.trim()
      ].join("\n")
    ),
    "",
    "</retrieved_product_knowledge>"
  ].join("\n");

  return {
    contextText,
    sources
  };
}
