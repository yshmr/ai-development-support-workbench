import { z } from "zod";

export const jiraTaskTypeSchema = z.enum([
  "frontend",
  "backend",
  "test",
  "documentation"
]);

export const jiraTaskSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  type: jiraTaskTypeSchema
});

export const llmProviderSchema = z.enum(["mock", "openai", "gemini", "anthropic"]);
export const ragModeSchema = z.enum(["off", "on"]);
export const agentModeSchema = z.enum(["off", "on", "auto"]);
export const ragContextPolicySchema = z.enum([
  "raw-top-k-v1",
  "document-cap-v1",
  "document-diversity-v1"
]);

const optionalNonNegativeNumberSchema = z.number().nonnegative().optional();
const optionalDocumentChunkCountsSchema = z
  .record(z.string(), z.number().int().nonnegative())
  .optional();

const ragSourceSchema = z.object({
  sourceId: z.string().min(1),
  rank: z.number().int().positive(),
  contextRank: z.number().int().positive().optional(),
  retrievalRank: z.number().int().positive().optional(),
  score: z.number(),
  chunkId: z.string().min(1),
  documentId: z.string().min(1),
  documentTitle: z.string().min(1),
  headingPath: z.array(z.string().min(1)),
  sourcePath: z.string().min(1),
  content: z.string().min(1)
});

const ragEmbeddingUsageSchema = z.object({
  promptTokens: optionalNonNegativeNumberSchema,
  totalTokens: optionalNonNegativeNumberSchema
});

export const ragMetadataSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("off")
  }),
  z.object({
    mode: z.literal("on"),
    strategy: z.literal("heading-aware-v1"),
    topK: z.literal(5),
    embeddingModel: z.string().min(1),
    retrievalLatencyMs: optionalNonNegativeNumberSchema,
    contextPolicy: ragContextPolicySchema.optional(),
    candidateTopK: z.number().int().positive().optional(),
    candidateChunkCount: z.number().int().nonnegative().optional(),
    candidateUniqueDocumentCount: z.number().int().nonnegative().optional(),
    candidateDocumentChunkCounts: optionalDocumentChunkCountsSchema,
    requestedFinalTopK: z.number().int().positive().optional(),
    maxChunksPerDocument: z.number().int().positive().optional(),
    selectedChunkCount: z.number().int().nonnegative().optional(),
    uniqueDocumentCount: z.number().int().nonnegative().optional(),
    maximumChunksFromSameDocument: z.number().int().nonnegative().optional(),
    documentChunkCounts: optionalDocumentChunkCountsSchema,
    sources: z.array(ragSourceSchema).min(1),
    embeddingUsage: ragEmbeddingUsageSchema.optional()
  })
]);

export const generationOutputSchema = z.object({
  summary: z.string().min(1),
  spec: z.array(z.string().min(1)).min(1),
  acceptanceCriteria: z.array(z.string().min(1)).min(1),
  jiraTasks: z.array(jiraTaskSchema).min(1),
  implementationPlan: z.array(z.string().min(1)).min(1),
  reviewPoints: z.array(z.string().min(1)).min(1),
  risks: z.array(z.string().min(1)).min(1)
});

export const generationRecordSchema = z.object({
  id: z.string().min(1),
  inputText: z.string().min(1),
  output: generationOutputSchema,
  provider: llmProviderSchema.default("mock"),
  promptVersion: z.string().min(1),
  modelName: z.string().min(1),
  providerLatencyMs: optionalNonNegativeNumberSchema,
  serverProcessingMs: optionalNonNegativeNumberSchema,
  inputTokens: optionalNonNegativeNumberSchema,
  outputTokens: optionalNonNegativeNumberSchema,
  totalTokens: optionalNonNegativeNumberSchema,
  rag: ragMetadataSchema.optional(),
  createdAt: z.string().datetime()
});

export const generateRequestSchema = z.object({
  inputText: z.string().trim().min(1, "要件メモを入力してください。"),
  agentMode: agentModeSchema.default("off"),
  ragMode: ragModeSchema.default("off"),
  ragContextPolicy: ragContextPolicySchema.default("raw-top-k-v1")
});

export const generationHistorySchema = z.array(generationRecordSchema);

export type JiraTaskType = z.infer<typeof jiraTaskTypeSchema>;
export type JiraTask = z.infer<typeof jiraTaskSchema>;
export type LlmProvider = z.infer<typeof llmProviderSchema>;
export type RagMode = z.infer<typeof ragModeSchema>;
export type AgentMode = z.infer<typeof agentModeSchema>;
export type RagContextPolicy = z.infer<typeof ragContextPolicySchema>;
export type RagSource = z.infer<typeof ragSourceSchema>;
export type RagMetadata = z.infer<typeof ragMetadataSchema>;
export type GenerationOutput = z.infer<typeof generationOutputSchema>;
export type GenerationRecord = z.infer<typeof generationRecordSchema>;
export type GenerateRequest = z.infer<typeof generateRequestSchema>;

export const generationOutputJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "summary",
    "spec",
    "acceptanceCriteria",
    "jiraTasks",
    "implementationPlan",
    "reviewPoints",
    "risks"
  ],
  properties: {
    summary: {
      type: "string",
      description: "要件メモの要約"
    },
    spec: {
      type: "array",
      minItems: 1,
      items: { type: "string" }
    },
    acceptanceCriteria: {
      type: "array",
      minItems: 1,
      items: { type: "string" }
    },
    jiraTasks: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "description", "type"],
        properties: {
          title: { type: "string" },
          description: { type: "string" },
          type: {
            type: "string",
            enum: ["frontend", "backend", "test", "documentation"]
          }
        }
      }
    },
    implementationPlan: {
      type: "array",
      minItems: 1,
      items: { type: "string" }
    },
    reviewPoints: {
      type: "array",
      minItems: 1,
      items: { type: "string" }
    },
    risks: {
      type: "array",
      minItems: 1,
      items: { type: "string" }
    }
  }
} as const;

export const geminiGenerationOutputSchema = {
  type: "object",
  required: [
    "summary",
    "spec",
    "acceptanceCriteria",
    "jiraTasks",
    "implementationPlan",
    "reviewPoints",
    "risks"
  ],
  properties: {
    summary: {
      type: "string"
    },
    spec: {
      type: "array",
      items: { type: "string" }
    },
    acceptanceCriteria: {
      type: "array",
      items: { type: "string" }
    },
    jiraTasks: {
      type: "array",
      items: {
        type: "object",
        required: ["title", "description", "type"],
        properties: {
          title: { type: "string" },
          description: { type: "string" },
          type: {
            type: "string",
            enum: ["frontend", "backend", "test", "documentation"]
          }
        }
      }
    },
    implementationPlan: {
      type: "array",
      items: { type: "string" }
    },
    reviewPoints: {
      type: "array",
      items: { type: "string" }
    },
    risks: {
      type: "array",
      items: { type: "string" }
    }
  }
} as const;

export const anthropicGenerationOutputSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "summary",
    "spec",
    "acceptanceCriteria",
    "jiraTasks",
    "implementationPlan",
    "reviewPoints",
    "risks"
  ],
  properties: {
    summary: {
      type: "string"
    },
    spec: {
      type: "array",
      items: { type: "string" }
    },
    acceptanceCriteria: {
      type: "array",
      items: { type: "string" }
    },
    jiraTasks: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "description", "type"],
        properties: {
          title: { type: "string" },
          description: { type: "string" },
          type: {
            type: "string",
            enum: ["frontend", "backend", "test", "documentation"]
          }
        }
      }
    },
    implementationPlan: {
      type: "array",
      items: { type: "string" }
    },
    reviewPoints: {
      type: "array",
      items: { type: "string" }
    },
    risks: {
      type: "array",
      items: { type: "string" }
    }
  }
} as const;
