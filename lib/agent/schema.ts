import { z } from "zod";
import { generationOutputSchema, type GenerationOutput } from "@/lib/schema";
import { agentRunStatusSchema, agentStateNameSchema } from "./state";

export const agentPlanSchema = z.object({
  normalizedGoal: z.string().min(1),
  explicitRequirements: z.array(z.string().min(1)),
  constraints: z.array(z.string().min(1)),
  ambiguities: z.array(z.string().min(1)),
  knowledgeNeeds: z.array(z.string().min(1))
});

export const agentReviewSeveritySchema = z.enum([
  "blocker",
  "major",
  "minor"
]);

export const agentReviewCategorySchema = z.enum([
  "requirement_coverage",
  "grounding_consistency",
  "unsupported_assumption",
  "cross_field_consistency",
  "actionability"
]);

export const generationOutputFieldSchema = z.enum([
  "summary",
  "spec",
  "acceptanceCriteria",
  "jiraTasks",
  "implementationPlan",
  "reviewPoints",
  "risks"
]);

export const agentReviewFindingSchema = z.object({
  findingId: z.string().min(1),
  category: agentReviewCategorySchema,
  severity: agentReviewSeveritySchema,
  targetFields: z.array(generationOutputFieldSchema).min(1),
  message: z.string().min(1),
  requiredChange: z.string().min(1),
  sourceIds: z.array(z.string().min(1))
});

export const agentReviewSchema = z.object({
  summary: z.string().min(1),
  findings: z.array(agentReviewFindingSchema)
});

const knowledgeSourceMetadataSchema = z
  .object({
    sourceId: z.string().min(1),
    rank: z.number().int().positive().optional(),
    contextRank: z.number().int().positive().optional(),
    retrievalRank: z.number().int().positive().optional(),
    score: z.number().optional(),
    chunkId: z.string().min(1).optional(),
    documentId: z.string().min(1).optional(),
    documentTitle: z.string().min(1).optional(),
    headingPath: z.array(z.string().min(1)).optional(),
    sourcePath: z.string().min(1).optional()
  })
  .passthrough();

const optionalNonNegativeNumberSchema = z.number().nonnegative().optional();

export const knowledgeRetrievalToolResultSchema = z.object({
  groundedContext: z.string(),
  sources: z.array(knowledgeSourceMetadataSchema),
  retrievalMetadata: z.record(z.unknown()).optional(),
  embeddingUsage: z
    .object({
      promptTokens: optionalNonNegativeNumberSchema,
      totalTokens: optionalNonNegativeNumberSchema
    })
    .optional()
});

export const agentStepNameSchema = z.enum([
  "planning",
  "knowledge_retrieval",
  "draft_generation",
  "review",
  "revision",
  "finalization"
]);

export const agentStepStatusSchema = z.enum(["completed", "failed"]);
export const revisionDecisionSchema = z.enum(["pass", "revise"]);

export const agentStepTraceSchema = z.object({
  stepId: z.string().min(1),
  stepName: agentStepNameSchema,
  sequence: z.number().int().positive(),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime(),
  latencyMs: z.number().nonnegative(),
  status: agentStepStatusSchema,
  provider: z.string().min(1).optional(),
  modelName: z.string().min(1).optional(),
  promptVersion: z.string().min(1).optional(),
  providerBacked: z.boolean().optional(),
  providerLatencyMs: optionalNonNegativeNumberSchema,
  inputTokens: optionalNonNegativeNumberSchema,
  outputTokens: optionalNonNegativeNumberSchema,
  totalTokens: optionalNonNegativeNumberSchema,
  reviewDecision: revisionDecisionSchema.optional()
});

export const agentTerminationReasonSchema = z.enum([
  "review_passed",
  "revision_limit_reached",
  "technical_failure"
]);

export const agentRunMetadataSchema = z.object({
  agentVersion: z.string().min(1),
  status: agentRunStatusSchema.exclude(["running"]),
  finalState: agentStateNameSchema,
  maxRevisionCount: z.number().int().nonnegative(),
  revisionCount: z.number().int().nonnegative(),
  reviewCount: z.number().int().nonnegative(),
  terminationReason: agentTerminationReasonSchema,
  totalAgentLatencyMs: z.number().nonnegative(),
  llmStepCount: z.number().int().nonnegative(),
  toolInvocationCount: z.number().int().nonnegative(),
  steps: z.array(agentStepTraceSchema)
});

export const sanitizedAgentErrorSchema = z.object({
  message: z.string().min(1),
  stepName: agentStepNameSchema.optional()
});

export const agentReviewStageSchema = z.enum(["draft", "revision"]);

export const agentReviewHistoryEntrySchema = z.object({
  reviewNumber: z.number().int().positive(),
  stage: agentReviewStageSchema,
  review: agentReviewSchema,
  decision: revisionDecisionSchema
});

export const agentSafeSourceSchema = z.object({
  sourceId: z.string().min(1),
  rank: z.number().int().positive().optional(),
  contextRank: z.number().int().positive().optional(),
  retrievalRank: z.number().int().positive().optional(),
  score: z.number().optional(),
  chunkId: z.string().min(1).optional(),
  documentId: z.string().min(1).optional(),
  documentTitle: z.string().min(1).optional(),
  headingPath: z.array(z.string().min(1)).optional(),
  sourcePath: z.string().min(1).optional()
});

export const agentRetrievalArtifactSchema = z.object({
  retrievalMetadata: z.record(z.unknown()).optional(),
  embeddingUsage: z
    .object({
      promptTokens: optionalNonNegativeNumberSchema,
      totalTokens: optionalNonNegativeNumberSchema
    })
    .optional(),
  sources: z.array(agentSafeSourceSchema)
});

export const agentRunRecordSchema = z.object({
  runId: z.string().min(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  inputText: z.string().min(1),
  provider: z.string().min(1).optional(),
  modelName: z.string().min(1).optional(),
  metadata: agentRunMetadataSchema,
  plan: agentPlanSchema.optional(),
  retrieval: agentRetrievalArtifactSchema.optional(),
  initialDraft: generationOutputSchema.optional(),
  revisedOutput: generationOutputSchema.optional(),
  finalOutput: generationOutputSchema.optional(),
  reviewHistory: z.array(agentReviewHistoryEntrySchema),
  error: sanitizedAgentErrorSchema.optional()
});

export const agentRunHistorySchema = z.array(agentRunRecordSchema);

export type AgentPlan = z.infer<typeof agentPlanSchema>;
export type AgentReviewSeverity = z.infer<typeof agentReviewSeveritySchema>;
export type AgentReviewCategory = z.infer<typeof agentReviewCategorySchema>;
export type GenerationOutputField = z.infer<typeof generationOutputFieldSchema>;
export type AgentReviewFinding = z.infer<typeof agentReviewFindingSchema>;
export type AgentReview = z.infer<typeof agentReviewSchema>;
export type KnowledgeRetrievalToolResult = z.infer<
  typeof knowledgeRetrievalToolResultSchema
>;
export type AgentStepName = z.infer<typeof agentStepNameSchema>;
export type RevisionDecision = z.infer<typeof revisionDecisionSchema>;
export type AgentStepTrace = z.infer<typeof agentStepTraceSchema>;
export type AgentTerminationReason = z.infer<
  typeof agentTerminationReasonSchema
>;
export type AgentRunMetadata = z.infer<typeof agentRunMetadataSchema>;
export type SanitizedAgentError = z.infer<typeof sanitizedAgentErrorSchema>;
export type AgentReviewStage = z.infer<typeof agentReviewStageSchema>;
export type AgentReviewHistoryEntry = z.infer<
  typeof agentReviewHistoryEntrySchema
>;
export type AgentSafeSource = z.infer<typeof agentSafeSourceSchema>;
export type AgentRetrievalArtifact = z.infer<
  typeof agentRetrievalArtifactSchema
>;
export type AgentRunRecord = z.infer<typeof agentRunRecordSchema>;

export type AgentRunResult = {
  runId?: string;
  createdAt?: string;
  output?: GenerationOutput;
  initialDraft?: GenerationOutput;
  revisedOutput?: GenerationOutput;
  plan?: AgentPlan;
  knowledge?: KnowledgeRetrievalToolResult;
  reviews: AgentReview[];
  reviewHistory: AgentReviewHistoryEntry[];
  metadata: AgentRunMetadata;
  error?: SanitizedAgentError;
};

export { generationOutputSchema };
export type { GenerationOutput };

export const agentPlanJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "normalizedGoal",
    "explicitRequirements",
    "constraints",
    "ambiguities",
    "knowledgeNeeds"
  ],
  properties: {
    normalizedGoal: { type: "string" },
    explicitRequirements: {
      type: "array",
      items: { type: "string" }
    },
    constraints: {
      type: "array",
      items: { type: "string" }
    },
    ambiguities: {
      type: "array",
      items: { type: "string" }
    },
    knowledgeNeeds: {
      type: "array",
      items: { type: "string" }
    }
  }
} as const;

export const geminiAgentPlanSchema = {
  type: "object",
  required: [
    "normalizedGoal",
    "explicitRequirements",
    "constraints",
    "ambiguities",
    "knowledgeNeeds"
  ],
  properties: {
    normalizedGoal: { type: "string" },
    explicitRequirements: {
      type: "array",
      items: { type: "string" }
    },
    constraints: {
      type: "array",
      items: { type: "string" }
    },
    ambiguities: {
      type: "array",
      items: { type: "string" }
    },
    knowledgeNeeds: {
      type: "array",
      items: { type: "string" }
    }
  }
} as const;

export const anthropicAgentPlanSchema = agentPlanJsonSchema;

export const agentReviewJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "findings"],
  properties: {
    summary: { type: "string" },
    findings: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "findingId",
          "category",
          "severity",
          "targetFields",
          "message",
          "requiredChange",
          "sourceIds"
        ],
        properties: {
          findingId: { type: "string" },
          category: {
            type: "string",
            enum: [
              "requirement_coverage",
              "grounding_consistency",
              "unsupported_assumption",
              "cross_field_consistency",
              "actionability"
            ]
          },
          severity: {
            type: "string",
            enum: ["blocker", "major", "minor"]
          },
          targetFields: {
            type: "array",
            items: {
              type: "string",
              enum: [
                "summary",
                "spec",
                "acceptanceCriteria",
                "jiraTasks",
                "implementationPlan",
                "reviewPoints",
                "risks"
              ]
            }
          },
          message: { type: "string" },
          requiredChange: { type: "string" },
          sourceIds: {
            type: "array",
            items: { type: "string" }
          }
        }
      }
    }
  }
} as const;

export const geminiAgentReviewSchema = {
  type: "object",
  required: ["summary", "findings"],
  properties: {
    summary: { type: "string" },
    findings: {
      type: "array",
      items: {
        type: "object",
        required: [
          "findingId",
          "category",
          "severity",
          "targetFields",
          "message",
          "requiredChange",
          "sourceIds"
        ],
        properties: {
          findingId: { type: "string" },
          category: {
            type: "string",
            enum: [
              "requirement_coverage",
              "grounding_consistency",
              "unsupported_assumption",
              "cross_field_consistency",
              "actionability"
            ]
          },
          severity: {
            type: "string",
            enum: ["blocker", "major", "minor"]
          },
          targetFields: {
            type: "array",
            items: {
              type: "string",
              enum: [
                "summary",
                "spec",
                "acceptanceCriteria",
                "jiraTasks",
                "implementationPlan",
                "reviewPoints",
                "risks"
              ]
            }
          },
          message: { type: "string" },
          requiredChange: { type: "string" },
          sourceIds: {
            type: "array",
            items: { type: "string" }
          }
        }
      }
    }
  }
} as const;

export const anthropicAgentReviewSchema = agentReviewJsonSchema;
