import { createHash } from "node:crypto";
import {
  ragChunkSchema,
  type RagChunk,
  type RagChunkStrategy,
  type RagDocument
} from "./schema";

export const fixedSizeChunkOptions = {
  targetChars: 800,
  overlapChars: 120
} as const;

function shortHash(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function createChunkId(
  document: RagDocument,
  strategy: RagChunkStrategy,
  chunkIndex: number,
  content: string
): string {
  return [
    document.documentId,
    strategy,
    String(chunkIndex).padStart(4, "0"),
    shortHash(`${document.contentHash}:${content}`)
  ].join(":");
}

function buildEmbeddingText(
  document: RagDocument,
  headingPath: string[],
  content: string
): string {
  const section =
    headingPath.length > 0 ? `Section: ${headingPath.join(" > ")}\n\n` : "";
  return `Document: ${document.title}\n${section}${content}`.trim();
}

function splitByCharacterWindow(
  content: string,
  targetChars = fixedSizeChunkOptions.targetChars,
  overlapChars = fixedSizeChunkOptions.overlapChars
): string[] {
  const normalizedContent = content.trim();
  if (!normalizedContent) {
    return [];
  }

  if (targetChars <= 0 || overlapChars < 0 || overlapChars >= targetChars) {
    throw new Error("Invalid fixed-size chunk options.");
  }

  if (normalizedContent.length <= targetChars) {
    return [normalizedContent];
  }

  const chunks: string[] = [];
  let start = 0;
  const step = targetChars - overlapChars;

  while (start < normalizedContent.length) {
    const chunk = normalizedContent.slice(start, start + targetChars).trim();
    if (chunk) {
      chunks.push(chunk);
    }

    const nextStart = start + step;
    if (nextStart <= start) {
      break;
    }
    start = nextStart;
  }

  return chunks;
}

function createChunk(
  document: RagDocument,
  strategy: RagChunkStrategy,
  chunkIndex: number,
  headingPath: string[],
  content: string
): RagChunk {
  return ragChunkSchema.parse({
    chunkId: createChunkId(document, strategy, chunkIndex, content),
    documentId: document.documentId,
    sourcePath: document.sourcePath,
    documentTitle: document.title,
    headingPath,
    content,
    embeddingText: buildEmbeddingText(document, headingPath, content),
    chunkIndex,
    chunkStrategy: strategy,
    contentHash: shortHash(content)
  });
}

export function chunkDocumentFixedSize(document: RagDocument): RagChunk[] {
  return splitByCharacterWindow(document.content).map((content, index) =>
    createChunk(document, "fixed-size-v1", index, [], content)
  );
}

type MarkdownSection = {
  headingPath: string[];
  contentLines: string[];
};

function parseMarkdownSections(document: RagDocument): MarkdownSection[] {
  const sections: MarkdownSection[] = [];
  const headingStack: string[] = [];
  let current: MarkdownSection = { headingPath: [], contentLines: [] };

  function flushCurrent() {
    const content = current.contentLines.join("\n").trim();
    if (content) {
      sections.push({
        headingPath: current.headingPath,
        contentLines: [content]
      });
    }
  }

  for (const line of document.content.split(/\r?\n/)) {
    const headingMatch = /^(#{1,3})\s+(.+?)\s*$/.exec(line);

    if (headingMatch) {
      flushCurrent();
      const level = headingMatch[1].length;
      const title = headingMatch[2].trim();
      headingStack[level - 1] = title;
      headingStack.length = level;
      current = {
        headingPath: headingStack.filter(Boolean),
        contentLines: []
      };
      continue;
    }

    current.contentLines.push(line);
  }

  flushCurrent();
  return sections;
}

export function chunkDocumentHeadingAware(document: RagDocument): RagChunk[] {
  const chunks: RagChunk[] = [];
  const sections = parseMarkdownSections(document);

  for (const section of sections) {
    for (const content of splitByCharacterWindow(section.contentLines.join("\n"))) {
      chunks.push(
        createChunk(
          document,
          "heading-aware-v1",
          chunks.length,
          section.headingPath,
          content
        )
      );
    }
  }

  return chunks;
}

export function chunkDocuments(
  documents: RagDocument[],
  strategy: RagChunkStrategy
): RagChunk[] {
  return documents.flatMap((document) =>
    strategy === "fixed-size-v1"
      ? chunkDocumentFixedSize(document)
      : chunkDocumentHeadingAware(document)
  );
}
