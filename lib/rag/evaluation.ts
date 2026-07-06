import fs from "node:fs/promises";
import path from "node:path";
import {
  retrievalEvaluationCasesSchema,
  type RetrievalEvaluationCase,
  type RetrievedChunk
} from "./schema";

export type RetrievalCaseResult = {
  caseId: string;
  query: string;
  topK: number;
  expectedDocumentIds: string[];
  retrieved: Array<{
    rank: number;
    score: number;
    documentId: string;
    chunkId: string;
  }>;
  hit: boolean;
  firstRelevantRank: number | null;
  reciprocalRank: number;
  sourceRecall: number;
};

export type RetrievalEvaluationSummary = {
  topK: number;
  cases: number;
  hitAtK: number;
  mrr: number;
  sourceRecallAtK: number;
  results: RetrievalCaseResult[];
};

export async function loadRetrievalEvaluationCases(
  filePath = path.join(
    process.cwd(),
    "data",
    "rag",
    "evaluation",
    "retrieval_cases.json"
  )
): Promise<RetrievalEvaluationCase[]> {
  const raw = await fs.readFile(filePath, "utf8");
  return retrievalEvaluationCasesSchema.parse(JSON.parse(raw));
}

export function validateEvaluationDocumentIds(
  cases: RetrievalEvaluationCase[],
  documentIds: string[]
) {
  const knownIds = new Set(documentIds);
  const missingIds = cases.flatMap((testCase) =>
    testCase.expectedDocumentIds.filter((documentId) => !knownIds.has(documentId))
  );

  if (missingIds.length > 0) {
    throw new Error(
      `Retrieval evaluation references unknown documentIds: ${[
        ...new Set(missingIds)
      ].join(", ")}`
    );
  }
}

export function evaluateRetrievedChunks(
  testCase: RetrievalEvaluationCase,
  results: RetrievedChunk[],
  topK: number
): RetrievalCaseResult {
  const expectedIds = new Set(testCase.expectedDocumentIds);
  const topResults = results.slice(0, topK);
  const retrievedDocumentIds = new Set(
    topResults.map((result) => result.documentId)
  );
  const firstRelevant = topResults.find((result) =>
    expectedIds.has(result.documentId)
  );
  const matchedExpectedIds = [...expectedIds].filter((documentId) =>
    retrievedDocumentIds.has(documentId)
  );

  return {
    caseId: testCase.id,
    query: testCase.query,
    topK,
    expectedDocumentIds: testCase.expectedDocumentIds,
    retrieved: topResults.map((result) => ({
      rank: result.rank,
      score: result.score,
      documentId: result.documentId,
      chunkId: result.chunkId
    })),
    hit: matchedExpectedIds.length > 0,
    firstRelevantRank: firstRelevant?.rank ?? null,
    reciprocalRank: firstRelevant ? 1 / firstRelevant.rank : 0,
    sourceRecall: matchedExpectedIds.length / expectedIds.size
  };
}

export function summarizeRetrievalEvaluation(
  results: RetrievalCaseResult[],
  topK: number
): RetrievalEvaluationSummary {
  const cases = results.length;
  if (cases === 0) {
    throw new Error("Retrieval evaluation result is empty.");
  }

  return {
    topK,
    cases,
    hitAtK: results.filter((result) => result.hit).length / cases,
    mrr:
      results.reduce((sum, result) => sum + result.reciprocalRank, 0) / cases,
    sourceRecallAtK:
      results.reduce((sum, result) => sum + result.sourceRecall, 0) / cases,
    results
  };
}
