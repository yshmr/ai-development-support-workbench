import type { RagSource } from "@/lib/schema";
import type { RetrievedChunk } from "./schema";
import type { SelectedRagContextChunk } from "./context-selection";

export type GroundedContext = {
  contextText: string;
  sources: RagSource[];
};

function formatHeadingPath(headingPath: string[]): string {
  return headingPath.length > 0 ? headingPath.join(" > ") : "(root)";
}

type GroundedContextChunk = RetrievedChunk | SelectedRagContextChunk;

function hasSelectionRanks(
  chunk: GroundedContextChunk
): chunk is SelectedRagContextChunk {
  return "contextRank" in chunk && "retrievalRank" in chunk;
}

export function buildGroundedContext(
  chunks: GroundedContextChunk[]
): GroundedContext {
  const validChunks = chunks.filter((chunk) => chunk.content.trim().length > 0);

  if (validChunks.length === 0) {
    throw new Error("RAG retrieval returned no usable chunks.");
  }

  const sources = validChunks.map((chunk, index) => {
    const contextRank = index + 1;
    const retrievalRank = hasSelectionRanks(chunk) ? chunk.retrievalRank : chunk.rank;

    return {
      sourceId: `S${contextRank}`,
      rank: retrievalRank,
      contextRank,
      retrievalRank,
      score: chunk.score,
      chunkId: chunk.chunkId,
      documentId: chunk.documentId,
      documentTitle: chunk.documentTitle,
      headingPath: chunk.headingPath,
      sourcePath: chunk.sourcePath,
      content: chunk.content
    };
  });

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
