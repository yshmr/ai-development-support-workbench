import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { ragDocumentSchema, type RagDocument } from "./schema";

export const defaultKnowledgeDirectory = path.join(
  process.cwd(),
  "data",
  "rag",
  "knowledge"
);

function normalizeSourcePath(filePath: string): string {
  return path.relative(process.cwd(), filePath).split(path.sep).join("/");
}

function getDocumentId(filePath: string): string {
  return path.basename(filePath, path.extname(filePath));
}

function getContentHash(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function extractTitle(content: string, sourcePath: string): string {
  const titleLine = content
    .split(/\r?\n/)
    .find((line) => /^#\s+/.test(line.trim()));

  if (!titleLine) {
    throw new Error(`${sourcePath} にH1 titleがありません。`);
  }

  return titleLine.replace(/^#\s+/, "").trim();
}

export async function loadRagDocuments(
  directory = defaultKnowledgeDirectory
): Promise<RagDocument[]> {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = entries
    .filter(
      (entry) =>
        entry.isFile() &&
        (entry.name.endsWith(".md") || entry.name.endsWith(".markdown"))
    )
    .map((entry) => path.join(directory, entry.name))
    .sort((a, b) => a.localeCompare(b));

  const seenDocumentIds = new Set<string>();
  const documents: RagDocument[] = [];

  for (const filePath of files) {
    const content = (await fs.readFile(filePath, "utf8")).trim();
    const sourcePath = normalizeSourcePath(filePath);

    if (!content) {
      throw new Error(`${sourcePath} is empty.`);
    }

    const documentId = getDocumentId(filePath);
    if (seenDocumentIds.has(documentId)) {
      throw new Error(`Duplicate RAG documentId: ${documentId}`);
    }
    seenDocumentIds.add(documentId);

    documents.push(
      ragDocumentSchema.parse({
        documentId,
        sourcePath,
        title: extractTitle(content, sourcePath),
        content,
        contentHash: getContentHash(content)
      })
    );
  }

  if (documents.length === 0) {
    throw new Error(`No Markdown documents found in ${directory}.`);
  }

  return documents;
}
