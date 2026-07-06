import { z } from "zod";

export const ragChunkStrategies = ["fixed-size-v1", "heading-aware-v1"] as const;

export const ragChunkStrategySchema = z.enum(ragChunkStrategies);

export type RagChunkStrategy = z.infer<typeof ragChunkStrategySchema>;

export const ragDocumentSchema = z.object({
  documentId: z.string().min(1),
  sourcePath: z.string().min(1),
  title: z.string().min(1),
  content: z.string().min(1),
  contentHash: z.string().min(1)
});

export type RagDocument = z.infer<typeof ragDocumentSchema>;

export const ragChunkSchema = z.object({
  chunkId: z.string().min(1),
  documentId: z.string().min(1),
  sourcePath: z.string().min(1),
  documentTitle: z.string().min(1),
  headingPath: z.array(z.string().min(1)),
  content: z.string().min(1),
  embeddingText: z.string().min(1),
  chunkIndex: z.number().int().nonnegative(),
  chunkStrategy: ragChunkStrategySchema,
  contentHash: z.string().min(1)
});

export type RagChunk = z.infer<typeof ragChunkSchema>;

export const qdrantPayloadSchema = z.object({
  chunkId: z.string().min(1),
  documentId: z.string().min(1),
  sourcePath: z.string().min(1),
  documentTitle: z.string().min(1),
  headingPath: z.array(z.string().min(1)),
  content: z.string().min(1),
  chunkIndex: z.number().int().nonnegative(),
  chunkStrategy: ragChunkStrategySchema,
  contentHash: z.string().min(1),
  embeddingModel: z.string().min(1)
});

export type QdrantChunkPayload = z.infer<typeof qdrantPayloadSchema>;

export const retrievedChunkSchema = z.object({
  rank: z.number().int().positive(),
  score: z.number(),
  chunkId: z.string().min(1),
  documentId: z.string().min(1),
  sourcePath: z.string().min(1),
  documentTitle: z.string().min(1),
  headingPath: z.array(z.string().min(1)),
  content: z.string().min(1)
});

export type RetrievedChunk = z.infer<typeof retrievedChunkSchema>;

export const retrieveInputSchema = z.object({
  query: z.string().trim().min(1),
  strategy: ragChunkStrategySchema,
  topK: z.number().int().min(1).max(20).default(5)
});

export type RetrieveInput = z.infer<typeof retrieveInputSchema>;

export const retrievalSearchRequestSchema = z.object({
  query: z.string().trim().min(1),
  strategy: ragChunkStrategySchema.default("heading-aware-v1"),
  topK: z.number().int().min(1).max(20).default(5)
});

export const retrievalEvaluationCaseSchema = z.object({
  id: z.string().min(1),
  query: z.string().min(1),
  expectedDocumentIds: z.array(z.string().min(1)).min(1),
  notes: z.string().min(1)
});

export type RetrievalEvaluationCase = z.infer<
  typeof retrievalEvaluationCaseSchema
>;

export const retrievalEvaluationCasesSchema = z
  .array(retrievalEvaluationCaseSchema)
  .min(1);
