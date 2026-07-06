import type { RagContextPolicy } from "@/lib/schema";
import type { RetrievedChunk } from "./schema";

export const defaultRagContextPolicy: RagContextPolicy = "raw-top-k-v1";
export const rawTopKContextCandidateTopK = 5;
export const documentCapContextCandidateTopK = 10;
export const documentDiversityContextCandidateTopK = 10;
export const selectedGenerationFinalTopK = 5;
export const documentCapMaxChunksPerDocument = 2;

export type SelectedRagContextChunk = RetrievedChunk & {
  contextRank: number;
  retrievalRank: number;
};

export type RagContextCompositionMetrics = {
  selectedChunkCount: number;
  uniqueDocumentCount: number;
  maximumChunksFromSameDocument: number;
  documentChunkCounts: Record<string, number>;
  duplicateSlotCount: number;
};

export type RagContextSelectionResult = {
  policy: RagContextPolicy;
  candidateTopK: number;
  candidateMetrics: RagContextCompositionMetrics;
  requestedFinalTopK: number;
  maxChunksPerDocument?: number;
  selectedChunks: SelectedRagContextChunk[];
  metrics: RagContextCompositionMetrics;
};

export function getCandidateTopKForContextPolicy(
  policy: RagContextPolicy
): number {
  if (policy === "document-cap-v1") {
    return documentCapContextCandidateTopK;
  }

  if (policy === "document-diversity-v1") {
    return documentDiversityContextCandidateTopK;
  }

  return rawTopKContextCandidateTopK;
}

export function calculateContextCompositionMetrics(
  chunks: Array<Pick<RetrievedChunk, "documentId">>
): RagContextCompositionMetrics {
  const documentChunkCounts = chunks.reduce<Record<string, number>>(
    (counts, chunk) => {
      counts[chunk.documentId] = (counts[chunk.documentId] ?? 0) + 1;
      return counts;
    },
    {}
  );
  const countValues = Object.values(documentChunkCounts);
  const selectedChunkCount = chunks.length;
  const uniqueDocumentCount = countValues.length;

  return {
    selectedChunkCount,
    uniqueDocumentCount,
    maximumChunksFromSameDocument:
      countValues.length > 0 ? Math.max(...countValues) : 0,
    documentChunkCounts,
    duplicateSlotCount: selectedChunkCount - uniqueDocumentCount
  };
}

function withContextRanks(
  chunks: RetrievedChunk[]
): SelectedRagContextChunk[] {
  return chunks.map((chunk, index) => ({
    ...chunk,
    contextRank: index + 1,
    retrievalRank: chunk.rank
  }));
}

function selectDocumentCapCandidates(
  candidates: RetrievedChunk[],
  requestedFinalTopK: number,
  maxChunksPerDocument: number
): RetrievedChunk[] {
  const selectedCounts = new Map<string, number>();
  const selectedCandidates: RetrievedChunk[] = [];

  for (const candidate of candidates) {
    const selectedCount = selectedCounts.get(candidate.documentId) ?? 0;

    if (selectedCount >= maxChunksPerDocument) {
      continue;
    }

    selectedCandidates.push(candidate);
    selectedCounts.set(candidate.documentId, selectedCount + 1);

    if (selectedCandidates.length >= requestedFinalTopK) {
      break;
    }
  }

  return selectedCandidates;
}

function selectDocumentDiversityCandidates(
  candidates: RetrievedChunk[],
  requestedFinalTopK: number,
  maxChunksPerDocument: number
): RetrievedChunk[] {
  const selectedCounts = new Map<string, number>();
  const selectedChunkIds = new Set<string>();
  const selectedCandidates: RetrievedChunk[] = [];

  for (const candidate of candidates) {
    if (selectedChunkIds.has(candidate.chunkId)) {
      continue;
    }

    if (selectedCounts.has(candidate.documentId)) {
      continue;
    }

    selectedCandidates.push(candidate);
    selectedChunkIds.add(candidate.chunkId);
    selectedCounts.set(candidate.documentId, 1);

    if (selectedCandidates.length >= requestedFinalTopK) {
      return selectedCandidates.sort((a, b) => a.rank - b.rank);
    }
  }

  for (const candidate of candidates) {
    if (selectedCandidates.length >= requestedFinalTopK) {
      break;
    }

    if (selectedChunkIds.has(candidate.chunkId)) {
      continue;
    }

    const selectedCount = selectedCounts.get(candidate.documentId) ?? 0;

    if (selectedCount >= maxChunksPerDocument) {
      continue;
    }

    selectedCandidates.push(candidate);
    selectedChunkIds.add(candidate.chunkId);
    selectedCounts.set(candidate.documentId, selectedCount + 1);
  }

  return selectedCandidates.sort((a, b) => a.rank - b.rank);
}

export function selectRagContextChunks(
  candidates: RetrievedChunk[],
  policy: RagContextPolicy
): RagContextSelectionResult {
  const candidateTopK = getCandidateTopKForContextPolicy(policy);
  const candidateMetrics = calculateContextCompositionMetrics(candidates);
  const requestedFinalTopK = selectedGenerationFinalTopK;
  let selectedCandidates: RetrievedChunk[];
  let maxChunksPerDocument: number | undefined;

  if (policy === "document-cap-v1") {
    maxChunksPerDocument = documentCapMaxChunksPerDocument;
    selectedCandidates = selectDocumentCapCandidates(
      candidates,
      requestedFinalTopK,
      maxChunksPerDocument
    );
  } else if (policy === "document-diversity-v1") {
    maxChunksPerDocument = documentCapMaxChunksPerDocument;
    selectedCandidates = selectDocumentDiversityCandidates(
      candidates,
      requestedFinalTopK,
      maxChunksPerDocument
    );
  } else {
    selectedCandidates = candidates.slice(0, requestedFinalTopK);
  }

  const selectedChunks = withContextRanks(selectedCandidates);
  const metrics = calculateContextCompositionMetrics(selectedChunks);

  return {
    policy,
    candidateTopK,
    candidateMetrics,
    requestedFinalTopK,
    maxChunksPerDocument,
    selectedChunks,
    metrics
  };
}
